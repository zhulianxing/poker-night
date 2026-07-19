// payment-svc/index.js — 支付服务 (Port 3002)
// 虎皮椒 (xunhupay.com) 支付集成
//   - 创建订单（扫码触发）
//   - 异步回调（签名校验）
//   - 订单状态查询
//   - 退款
//   - 支付成功后自动激活赛事（tournament → registering）
'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const {
  query,
  db,
  ORDER_STATUS,
  TOURNAMENT_STATUS,
  FEE_SPLIT,
  SNG_DEFAULTS,
} = require('@poker-night/shared');

const app = express();

// ============================================================
// 配置
// ============================================================
const PORT = process.env.PAYMENT_PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'poker-night-secret-2026';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://43.164.130.145:3002';
const PUBLIC_RETURN_URL = process.env.PUBLIC_RETURN_URL || PUBLIC_BASE_URL;

// 虎皮椒配置（占位符默认值，部署时由 .env / ecosystem 覆盖）
// 兼容两套环境变量命名：XUNHU_APPID / XUNHU_APP_ID，XUNHU_APPKEY / XUNHU_APP_SECRET
const XUNHU_APPID =
  process.env.XUNHU_APPID || process.env.XUNHU_APP_ID || '202606301';
const XUNHU_APPKEY =
  process.env.XUNHU_APPKEY || process.env.XUNHU_APP_SECRET || 'CHANGE_ME_XUNHU_APPKEY';

// 接口地址（可通过环境变量覆盖）
const XUNHU_CREATE_URL = process.env.XUNHU_API || 'https://api.xunhupay.com/v1/payment';
const XUNHU_QUERY_URL =
  process.env.XUNHU_QUERY_API || 'https://api.xunhupay.com/v1/payment/query';
const XUNHU_REFUND_URL =
  process.env.XUNHU_REFUND_API || 'https://api.xunhupay.com/payment/refund.html';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 虎皮椒回调为 form-urlencoded
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// 中间件：JWT 鉴权（用于退款 / 订单列表等管理端接口）
// ============================================================
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

// ============================================================
// 健康检查
// ============================================================
app.get('/health', (req, res) =>
  res.json({ ok: true, service: 'payment-svc', appid: XUNHU_APPID })
);

// ============================================================
// 虎皮椒签名
//   规则：按参数 key ASCII 升序拼成 k1=v1&k2=v2...，末尾拼接 appKey，MD5(小写)
//   过滤空值与 hash 字段本身
// ============================================================
function sign(params, appKey) {
  const sorted = Object.keys(params)
    .filter(
      (k) =>
        k !== 'hash' &&
        params[k] !== '' &&
        params[k] !== undefined &&
        params[k] !== null
    )
    .sort();
  const str = sorted.map((k) => `${k}=${params[k]}`).join('&') + appKey;
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

function verifySign(params, appKey) {
  const incoming = params.hash;
  if (!incoming) return false;
  const expected = sign(params, appKey);
  // 时序安全比较
  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(incoming)),
      Buffer.from(String(expected))
    );
  } catch {
    return incoming === expected;
  }
}

// ============================================================
// 生成赛事编号 PN-YYYYMMDD-NNN（当天顺序号）
// ============================================================
function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function generateDisplayCode(client) {
  const runner = client || { query };
  const stamp = todayStamp();
  const prefix = `PN-${stamp}-`;
  const r = await runner.query(
    `SELECT COUNT(*)::int AS cnt FROM tournaments WHERE display_code LIKE $1`,
    [`${prefix}%`]
  );
  const seq = (r.rows[0]?.cnt || 0) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// ============================================================
// 解析牌桌：支持 UUID (id) 或 短码 (code)
// ============================================================
async function resolveTable(identifier, deviceSn) {
  if (!identifier && !deviceSn) return null;

  // 优先按设备 SN 定位（扫码流程可能只传设备号）
  if (deviceSn && !identifier) {
    const r = await query(
      `SELECT t.*, v.name AS venue_name, v.rate_plan
         FROM tables t JOIN venues v ON t.venue_id = v.id
        WHERE t.device_sn = $1`,
      [deviceSn]
    );
    return r.rows[0] || null;
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(identifier)
    );

  const r = await query(
    `SELECT t.*, v.name AS venue_name, v.rate_plan
       FROM tables t JOIN venues v ON t.venue_id = v.id
      WHERE ${isUuid ? 't.id = $1' : 't.code = $1'}`,
    [identifier]
  );
  return r.rows[0] || null;
}

// ============================================================
// 牌桌信息查询（供支付页加载：GET /api/v1/tables/:code）
// ============================================================
app.get('/api/v1/tables/:code', async (req, res) => {
  try {
    const table = await resolveTable(req.params.code);
    if (!table) return res.status(404).json({ error: 'table not found' });
    res.json({
      id: table.id,
      code: table.code,
      name: table.label || table.code,
      label: table.label,
      venue_id: table.venue_id,
      venue_name: table.venue_name,
      launch_fee: table.launch_fee,
      entry_fee: (table.launch_fee / 100).toFixed(2),
      max_players: table.max_players,
      status: table.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 创建订单（扫码支付发起）
//   支持：
//     POST /api/v1/payment/create  body: { table_code | tableId, device, paymentMethod, payer }
//     GET  /api/v1/payment/create?table=CODE&device=SN
// ============================================================
async function createPaymentHandler(req, res) {
  const src = { ...req.query, ...req.body };
  const identifier = src.table_code || src.tableId || src.table || src.code;
  const deviceSn = src.device || src.device_sn || null;
  const paymentMethod = src.paymentMethod || src.method || 'wechat'; // 'wechat' | 'alipay'
  const payerIdentifier = src.payer || src.payer_identifier || null;

  if (!identifier && !deviceSn) {
    return res.status(400).json({ error: 'missing table_code / device' });
  }

  const client = await db.getClient();
  let orderId = null;
  let tournamentId = null;
  try {
    // 1. 解析牌桌 + 场馆
    const table = await resolveTable(identifier, deviceSn);
    if (!table) {
      client.release();
      return res.status(404).json({ error: 'table not found' });
    }

    const amount = table.launch_fee; // 单位：分
    const ratePlan = table.rate_plan || {
      platform: FEE_SPLIT.PLATFORM,
      venue: FEE_SPLIT.VENUE,
    };
    const platformFee = Math.floor((amount * (ratePlan.platform ?? FEE_SPLIT.PLATFORM)) / 100);
    const venueIncome = amount - platformFee;

    // 2. 创建赛事（pending）与订单（pending），事务内保证一致
    await client.query('BEGIN');

    const displayCode = await generateDisplayCode(client);

    const tournamentResult = await client.query(
      `INSERT INTO tournaments
         (display_code, table_id, launch_fee, max_players, start_chips,
          start_blind, blind_interval, wait_countdown, action_timeout, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
       RETURNING id`,
      [
        displayCode,
        table.id,
        amount,
        table.max_players || SNG_DEFAULTS.MAX_PLAYERS,
        SNG_DEFAULTS.START_CHIPS,
        SNG_DEFAULTS.START_BLIND_SB,
        SNG_DEFAULTS.BLIND_INTERVAL,
        SNG_DEFAULTS.WAIT_COUNTDOWN,
        SNG_DEFAULTS.ACTION_TIMEOUT,
      ]
    );
    tournamentId = tournamentResult.rows[0].id;

    const orderResult = await client.query(
      `INSERT INTO orders
         (tournament_id, table_id, venue_id, payer_identifier,
          amount, platform_fee, venue_income, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       RETURNING id`,
      [tournamentId, table.id, table.venue_id, payerIdentifier, amount, platformFee, venueIncome]
    );
    orderId = orderResult.rows[0].id;

    // 商户交易号（用于回调反查订单）
    const tradeOrderId = `PN-${todayStamp()}-${crypto.randomBytes(6).toString('hex')}`;
    await client.query('UPDATE orders SET xunhupay_order_id = $1 WHERE id = $2', [
      tradeOrderId,
      orderId,
    ]);

    await client.query('COMMIT');

    // 3. 调用虎皮椒下单
    const notifyUrl = `${PUBLIC_BASE_URL}/pay/api/v1/payment/callback`;
    const returnUrl = `${PUBLIC_RETURN_URL}/pay/pay-result.html?order=${orderId}`;

    const params = {
      version: '1.1',
      appid: XUNHU_APPID,
      trade_order_id: tradeOrderId,
      total_fee: (amount / 100).toFixed(2), // 虎皮椒以「元」为单位
      title: `德州扑克之夜 - ${table.label || table.code}`,
      time: String(Math.floor(Date.now() / 1000)),
      notify_url: notifyUrl,
      return_url: returnUrl,
      nonce_str: crypto.randomBytes(16).toString('hex'),
      type: paymentMethod === 'alipay' ? 'WAP' : 'WAP',
      wap_url: PUBLIC_BASE_URL,
      wap_name: 'PokerNight',
    };
    params.hash = sign(params, XUNHU_APPKEY);

    console.log(
      `[Payment] Create xunhupay order trade=${tradeOrderId} order=${orderId} amount=${params.total_fee}`
    );

    const payResult = await axios.post(
      XUNHU_CREATE_URL,
      new URLSearchParams(params).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      }
    );
    const payData = payResult.data || {};

    // 虎皮椒成功：errcode === 0 且返回 url（或二维码）
    const payUrl = payData.url || payData.url_qrcode || payData.qrcode;
    if (Number(payData.errcode) !== 0 || !payUrl) {
      await query('UPDATE orders SET status = $1 WHERE id = $2', [
        ORDER_STATUS.CANCELLED,
        orderId,
      ]);
      await query('UPDATE tournaments SET status = $1 WHERE id = $2', [
        TOURNAMENT_STATUS.CANCELLED,
        tournamentId,
      ]);
      console.error('[Payment] Xunhupay create failed:', JSON.stringify(payData));
      return res.status(502).json({
        error: 'payment creation failed',
        detail: payData.errmsg || 'xunhupay error',
      });
    }

    return res.json({
      orderId,
      tournamentId,
      displayCode,
      amount, // 分
      amountYuan: (amount / 100).toFixed(2),
      tradeOrderId,
      payUrl,
      qrcode: payData.url_qrcode || payData.qrcode || null,
    });
  } catch (err) {
    // 尝试回滚未提交事务
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    // 若订单/赛事已提交则标记取消
    if (orderId) {
      try {
        await query('UPDATE orders SET status = $1 WHERE id = $2 AND status = $3', [
          ORDER_STATUS.CANCELLED,
          orderId,
          ORDER_STATUS.PENDING,
        ]);
      } catch {
        /* ignore */
      }
    }
    if (tournamentId) {
      try {
        await query(
          'UPDATE tournaments SET status = $1 WHERE id = $2 AND status = $3',
          [TOURNAMENT_STATUS.CANCELLED, tournamentId, 'pending']
        );
      } catch {
        /* ignore */
      }
    }
    console.error('[Payment] Create error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

app.post('/api/v1/payment/create', createPaymentHandler);
app.get('/api/v1/payment/create', createPaymentHandler);

// ============================================================
// 虎皮椒异步回调（form-urlencoded POST）
//   - 校验签名
//   - status === 'OD' 视为支付成功
//   - 通过 trade_order_id 反查订单（orders.xunhupay_order_id）
//   - 支付成功：orders → paid，tournaments → registering，并激活赛事
//   路由：/callback（任务要求） + /notify（向后兼容别名）
// ============================================================
async function paymentCallbackHandler(req, res) {
  const data = { ...req.body, ...req.query };

  if (!verifySign(data, XUNHU_APPKEY)) {
    console.error('[Payment] Callback signature mismatch, trade=', data.trade_order_id);
    return res.send('fail');
  }

  // 仅处理已支付状态；其它状态确认收到但不处理
  if (data.status !== 'OD') {
    console.log('[Payment] Callback status not OD:', data.status, data.trade_order_id);
    return res.send('success');
  }

  const tradeOrderId = data.trade_order_id;
  if (!tradeOrderId) return res.send('fail');

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // 幂等：仅 pending → paid
    const orderResult = await client.query(
      `UPDATE orders
          SET status = $1, paid_at = NOW()
        WHERE xunhupay_order_id = $2 AND status = $3
        RETURNING *`,
      [ORDER_STATUS.PAID, tradeOrderId, ORDER_STATUS.PENDING]
    );

    if (orderResult.rows.length === 0) {
      // 订单不存在或已处理（重复回调）→ 幂等返回成功
      await client.query('ROLLBACK');
      console.log('[Payment] Callback: order already processed or not found:', tradeOrderId);
      return res.send('success');
    }

    const order = orderResult.rows[0];

    if (order.tournament_id) {
      await client.query('UPDATE tournaments SET status = $1 WHERE id = $2', [
        TOURNAMENT_STATUS.REGISTERING,
        order.tournament_id,
      ]);
    }

    await client.query('COMMIT');

    console.log(`[Payment] Order ${order.id} PAID (trade=${tradeOrderId})`);

    // 触发赛事激活（软依赖，不影响回调返回）
    if (order.tournament_id) {
      try {
        const socketMod = require('../poker-socket');
        if (typeof socketMod.activateTournament === 'function') {
          await socketMod.activateTournament(order.tournament_id);
        } else if (socketMod.io) {
          socketMod.io.emit('tournament_activated', {
            tournamentId: order.tournament_id,
            orderId: order.id,
          });
        }
      } catch (e) {
        console.error('[Payment] activate tournament failed:', e.message);
      }
    }

    return res.send('success');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[Payment] Callback error:', err.message);
    return res.send('fail');
  } finally {
    client.release();
  }
}

app.post('/api/v1/payment/callback', paymentCallbackHandler);
app.post('/api/v1/payment/notify', paymentCallbackHandler); // 兼容旧路径

// ============================================================
// 订单状态查询
//   GET /api/v1/payment/status/:order_id
//   ?refresh=1 时主动向虎皮椒查询最新状态并回写
// ============================================================
app.get('/api/v1/payment/status/:order_id', async (req, res) => {
  try {
    const r = await query(
      `SELECT o.*, t.display_code, t.status AS tournament_status
         FROM orders o
         LEFT JOIN tournaments t ON o.tournament_id = t.id
        WHERE o.id = $1`,
      [req.params.order_id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'order not found' });
    const order = r.rows[0];

    // 主动刷新（订单仍 pending 且请求 refresh 时）
    if (req.query.refresh && order.status === ORDER_STATUS.PENDING && order.xunhupay_order_id) {
      try {
        const params = {
          appid: XUNHU_APPID,
          out_trade_order: order.xunhupay_order_id,
          time: String(Math.floor(Date.now() / 1000)),
          nonce_str: crypto.randomBytes(16).toString('hex'),
        };
        params.hash = sign(params, XUNHU_APPKEY);
        const q = await axios.post(
          XUNHU_QUERY_URL,
          new URLSearchParams(params).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
          }
        );
        const qd = q.data || {};
        if (Number(qd.errcode) === 0 && qd.status === 'OD') {
          const upd = await query(
            `UPDATE orders SET status = $1, paid_at = COALESCE(paid_at, NOW())
              WHERE id = $2 AND status = $3 RETURNING *`,
            [ORDER_STATUS.PAID, order.id, ORDER_STATUS.PENDING]
          );
          if (upd.rows.length > 0 && order.tournament_id) {
            await query('UPDATE tournaments SET status = $1 WHERE id = $2', [
              TOURNAMENT_STATUS.REGISTERING,
              order.tournament_id,
            ]);
            order.status = ORDER_STATUS.PAID;
            order.tournament_status = TOURNAMENT_STATUS.REGISTERING;
          }
        }
      } catch (e) {
        console.warn('[Payment] status refresh failed:', e.message);
      }
    }

    res.json({
      orderId: order.id,
      status: order.status,
      amount: order.amount,
      amountYuan: (order.amount / 100).toFixed(2),
      displayCode: order.display_code,
      tournamentId: order.tournament_id,
      tournamentStatus: order.tournament_status,
      paidAt: order.paid_at,
      createdAt: order.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 退款（管理端，需鉴权）
// ============================================================
app.post('/api/v1/refund', auth, async (req, res) => {
  const { orderId, reason } = req.body;
  if (!orderId) return res.status(400).json({ error: 'missing orderId' });

  try {
    const orderResult = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: 'order not found' });
    if (order.status !== ORDER_STATUS.PAID)
      return res.status(400).json({ error: 'order not in paid state' });

    const params = {
      version: '1.1',
      appid: XUNHU_APPID,
      trade_order_id: order.xunhupay_order_id,
      refund_amount: (order.amount / 100).toFixed(2),
      nonce_str: crypto.randomBytes(16).toString('hex'),
    };
    params.hash = sign(params, XUNHU_APPKEY);

    const refundResult = await axios.post(
      XUNHU_REFUND_URL,
      new URLSearchParams(params).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    if (Number(refundResult.data.errcode) !== 0) {
      return res
        .status(502)
        .json({ error: 'refund failed', detail: refundResult.data.errmsg });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders
            SET status = $1, refunded_at = NOW(), refund_reason = $2, refund_initiated_by = $3
          WHERE id = $4`,
        [
          ORDER_STATUS.REFUNDED,
          reason || 'merchant refund',
          req.user?.isAdmin ? 'admin' : 'merchant',
          orderId,
        ]
      );
      if (order.tournament_id) {
        await client.query(
          'UPDATE tournaments SET status = $1 WHERE id = $2 AND status != $3',
          [TOURNAMENT_STATUS.CANCELLED, order.tournament_id, TOURNAMENT_STATUS.FINISHED]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    try {
      const { io } = require('../poker-socket');
      if (io) io.emit('order_refunded', { orderId, tournamentId: order.tournament_id });
    } catch {
      /* ignore */
    }

    res.json({ success: true, orderId, status: ORDER_STATUS.REFUNDED });
  } catch (err) {
    console.error('[Payment] Refund error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 订单详情 / 列表（兼容旧接口）
// ============================================================
app.get('/api/v1/payment/order/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*, t.display_code
         FROM orders o LEFT JOIN tournaments t ON o.tournament_id = t.id
        WHERE o.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/orders/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'order not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/orders', auth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const { startDate, endDate, status, venueId } = req.query;

  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (req.user.venueId && !req.user.isAdmin) {
      whereClause += ` AND o.venue_id = $${paramIdx++}`;
      params.push(req.user.venueId);
    } else if (venueId) {
      whereClause += ` AND o.venue_id = $${paramIdx++}`;
      params.push(venueId);
    }
    if (startDate) {
      whereClause += ` AND o.created_at >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ` AND o.created_at <= $${paramIdx++}`;
      params.push(endDate);
    }
    if (status) {
      whereClause += ` AND o.status = $${paramIdx++}`;
      params.push(status);
    }

    const result = await query(
      `SELECT o.*, t.display_code, t.status AS tournament_status, v.name AS venue_name
         FROM orders o
         LEFT JOIN tournaments t ON o.tournament_id = t.id
         LEFT JOIN venues v ON o.venue_id = v.id
         ${whereClause}
         ORDER BY o.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
      params
    );

    res.json({
      orders: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 启动
// ============================================================
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Payment] running on port ${PORT}`);
    console.log(`[Payment] Xunhupay APPID: ${XUNHU_APPID}`);
    console.log(`[Payment] Create URL: ${XUNHU_CREATE_URL}`);
  });
}

module.exports = app;
