// merchant-api/index.js — 商户后台 API + 运营后台 API (Port 3013)
'use strict';

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('@poker-night/shared');

const app = express();
const PORT = process.env.MERCHANT_PORT || 3013;
const JWT_SECRET = process.env.JWT_SECRET || 'poker-night-secret-2026';

app.use(cors());
app.use(express.json());

// 静态文件
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// JWT 中间件
// ============================================================

// 商户鉴权
function merchantAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    req.merchant = jwt.verify(token, JWT_SECRET);
    if (!req.merchant.venueId) return res.status(403).json({ error: 'not a merchant token' });
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

// 管理员鉴权
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    if (!req.admin.isAdmin) return res.status(403).json({ error: 'not an admin token' });
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'merchant-api' }));

// ============================================================
// 工具函数
// ============================================================
function formatMoney(cents) {
  return Number(cents || 0).toFixed(2);
}

function toYMD(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function toLocaleDT(d) {
  const dt = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

// ============================================================
// 🏪 MERCHANT API
// ============================================================

// -----------------------------------------------------------
// 1. POST /api/v1/merchant/login — 商户登录（邮箱+密码）
// -----------------------------------------------------------
app.post('/api/v1/merchant/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  try {
    const result = await query(
      `SELECT id, name, email, phone, contact, address, password_hash, status
       FROM venues WHERE email = $1`, [email]
    );

    const venue = result.rows[0];
    if (!venue) return res.status(404).json({ error: '商户不存在' });

    if (venue.status !== 'active') return res.status(403).json({ error: '商户已被禁用' });

    // 验证密码
    const valid = venue.password_hash
      ? bcrypt.compareSync(password, venue.password_hash)
      : false;

    if (!valid) return res.status(401).json({ error: '密码错误' });

    const token = jwt.sign(
      { venueId: venue.id, name: venue.name, email: venue.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      merchant: {
        id: venue.id,
        name: venue.name,
        email: venue.email,
        contact: venue.contact,
        phone: venue.phone,
      }
    });
  } catch (err) {
    console.error('[Merchant Login]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 2. GET /api/v1/merchant/dashboard — 数据看板
// -----------------------------------------------------------
app.get('/api/v1/merchant/dashboard', merchantAuth, async (req, res) => {
  const venueId = req.merchant.venueId;
  const today = toYMD(new Date());
  const weekAgo = toYMD(new Date(Date.now() - 7 * 24 * 3600 * 1000));

  try {
    const [todayStats, totalStats, deviceStats, chartData, weekMatchCount, weekTraffic] = await Promise.all([
      // 今日统计
      query(
        `SELECT
           COUNT(*)::int AS today_orders,
           COALESCE(SUM(amount), 0)::int AS today_revenue,
           COALESCE(SUM(venue_income), 0)::int AS today_venue_income
         FROM orders
         WHERE venue_id = $1 AND DATE(paid_at) = $2 AND status = 'paid'`,
        [venueId, today]
      ),
      // 待结算
      query(
        `SELECT COALESCE(SUM(venue_income), 0)::int AS pending_settlement
         FROM settlements
         WHERE venue_id = $1 AND status = 'pending'`,
        [venueId]
      ),
      // 设备
      query(
        `SELECT
           COUNT(*)::int AS total_devices
         FROM device_bindings
         WHERE venue_id = $1`,
        [venueId]
      ),
      // 最近7天趋势
      query(
        `SELECT
           DATE(paid_at) AS day,
           COUNT(*)::int AS orders,
           COALESCE(SUM(amount), 0)::int AS revenue
         FROM orders
         WHERE venue_id = $1 AND paid_at >= $2 AND status = 'paid'
         GROUP BY DATE(paid_at)
         ORDER BY day`,
        [venueId, weekAgo]
      ),
      // 本周赛事场次
      query(
        `SELECT COUNT(*)::int AS match_count
         FROM tournaments t
         JOIN tables tb ON t.table_id = tb.id
         WHERE tb.venue_id = $1 AND t.created_at >= $2 AND t.status IN ('started', 'finished')`,
        [venueId, weekAgo]
      ),
      // 本周客流量（参赛人次）
      query(
        `SELECT COUNT(*)::int AS traffic
         FROM tournament_players tp
         JOIN tournaments t ON tp.tournament_id = t.id
         JOIN tables tb ON t.table_id = tb.id
         WHERE tb.venue_id = $1 AND tp.joined_at >= $2`,
        [venueId, weekAgo]
      ),
    ]);

    const todayRow = todayStats.rows[0] || {};
    const pendingRow = totalStats.rows[0] || {};
    const deviceRow = deviceStats.rows[0] || {};
    const matchRow = weekMatchCount.rows[0] || {};
    const trafficRow = weekTraffic.rows[0] || {};

    res.json({
      todayOrders: todayRow.today_orders || 0,
      todayRevenue: todayRow.today_revenue || 0,
      todayVenueIncome: todayRow.today_venue_income || 0,
      pendingSettlement: pendingRow.pending_settlement || 0,
      totalDevices: deviceRow.total_devices || 0,
      weekMatches: matchRow.match_count || 0,
      weekTraffic: trafficRow.traffic || 0,
      chartData: (chartData.rows || []).map(r => ({
        date: r.day ? r.day.slice(5) : '--',
        orders: parseInt(r.orders) || 0,
        revenue: parseInt(r.revenue) || 0,
      })),
    });
  } catch (err) {
    console.error('[Merchant Dashboard]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 3. GET /api/v1/merchant/orders — 订单明细
// -----------------------------------------------------------
app.get('/api/v1/merchant/orders', merchantAuth, async (req, res) => {
  const venueId = req.merchant.venueId;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 15));
  const offset = (page - 1) * pageSize;
  const { dateStart, dateEnd, status, search } = req.query;

  try {
    let where = 'WHERE o.venue_id = $1';
    const params = [venueId];
    let idx = 2;

    if (dateStart) { where += ` AND o.paid_at >= $${idx++}`; params.push(dateStart); }
    if (dateEnd)   { where += ` AND o.paid_at <= $${idx++}`; params.push(dateEnd + 'T23:59:59Z'); }
    if (status)    { where += ` AND o.status = $${idx++}`; params.push(status); }

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM orders o ${where}`, params
    );
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `SELECT o.id, o.amount, o.venue_income, o.platform_fee, o.status,
              o.payer_identifier, o.xunhupay_order_id,
              o.paid_at, o.refunded_at, o.refund_reason, o.created_at,
              t.display_code AS tournament_code,
              db.device_sn, db.table_label
       FROM orders o
       LEFT JOIN tournaments t ON o.tournament_id = t.id
       LEFT JOIN device_bindings db ON db.venue_id = o.venue_id
       LEFT JOIN tables tb ON o.table_id = tb.id AND tb.venue_id = o.venue_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset]
    );

    res.json({
      list: (result.rows || []).map(o => ({
        orderNo: o.xunhupay_order_id || o.id,
        time: o.paid_at ? toLocaleDT(o.paid_at) : toLocaleDT(o.created_at),
        account: o.payer_identifier || '--',
        amount: o.amount,
        venueIncome: o.venue_income,
        matchId: o.tournament_code || '--',
        deviceSN: o.device_sn || '--',
        tableLabel: o.table_label || '--',
        status: o.status,
        refundReason: o.refund_reason || '',
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[Merchant Orders]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 4. GET /api/v1/merchant/devices — 设备列表
// -----------------------------------------------------------
app.get('/api/v1/merchant/devices', merchantAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.device_sn, d.table_label, d.bound_at,
              t.code AS table_code, t.label AS table_label2,
              t.status AS table_status
       FROM device_bindings d
       LEFT JOIN tables t ON t.device_sn = d.device_sn
       WHERE d.venue_id = $1
       ORDER BY d.bound_at DESC`,
      [req.merchant.venueId]
    );

    res.json({
      list: (result.rows || []).map(d => ({
        sn: d.device_sn,
        tableNo: d.table_label || d.table_label2 || d.table_code || '--',
        tableCode: d.table_code || '--',
        status: d.table_status || 'idle',
        bindTime: d.bound_at ? toLocaleDT(d.bound_at) : '--',
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 绑定设备
app.post('/api/v1/merchant/devices/bind', merchantAuth, async (req, res) => {
  const { deviceSn, tableLabel } = req.body;
  if (!deviceSn) return res.status(400).json({ error: 'missing deviceSn' });

  try {
    // 检查是否已被其他商户绑定
    const existResult = await query(
      'SELECT * FROM device_bindings WHERE device_sn = $1', [deviceSn]
    );
    if (existResult.rows.length > 0) {
      const existing = existResult.rows[0];
      if (existing.venue_id !== req.merchant.venueId) {
        return res.status(409).json({ error: '该设备已被其他商户绑定' });
      }
      return res.json({ success: true, message: '设备已绑定到当前商户' });
    }

    await query(
      `INSERT INTO device_bindings (device_sn, venue_id, table_label)
       VALUES ($1, $2, $3)`,
      [deviceSn, req.merchant.venueId, tableLabel || null]
    );

    // 自动创建牌桌
    const tableCode = generateTableCode();
    await query(
      `INSERT INTO tables (venue_id, device_sn, code, label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_sn) DO UPDATE SET label = $4`,
      [req.merchant.venueId, deviceSn, tableCode, tableLabel || '桌台1']
    );

    res.json({ success: true, deviceSn, tableCode, tableLabel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 解绑设备
app.post('/api/v1/merchant/devices/unbind', merchantAuth, async (req, res) => {
  const { sn } = req.body;
  if (!sn) return res.status(400).json({ error: 'missing sn' });

  try {
    const existResult = await query(
      'SELECT * FROM device_bindings WHERE device_sn = $1 AND venue_id = $2',
      [sn, req.merchant.venueId]
    );
    if (existResult.rows.length === 0) {
      return res.status(404).json({ error: '设备未找到' });
    }

    await query('DELETE FROM device_bindings WHERE device_sn = $1 AND venue_id = $2',
      [sn, req.merchant.venueId]);
    await query('UPDATE tables SET device_sn = NULL WHERE device_sn = $1', [sn]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 5. GET /api/v1/merchant/settlements — 结算记录
// -----------------------------------------------------------
app.get('/api/v1/merchant/settlements', merchantAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, period_start, period_end, total_orders, total_amount,
              venue_share, platform_share, status, paid_at, transfer_proof, created_at
       FROM settlements
       WHERE venue_id = $1
       ORDER BY created_at DESC`,
      [req.merchant.venueId]
    );

    res.json({
      list: (result.rows || []).map(s => ({
        id: s.id,
        period: `${toYMD(s.period_start)} ~ ${toYMD(s.period_end)}`,
        orderCount: s.total_orders,
        totalAmount: s.total_amount,
        merchantShare: s.venue_share,
        platformShare: s.platform_share,
        status: s.status,
        paidAt: s.paid_at ? toLocaleDT(s.paid_at) : null,
        voucherUrl: s.transfer_proof || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 6. POST /api/v1/merchant/settlements/:id/withdraw — 申请提现
// -----------------------------------------------------------
app.post('/api/v1/merchant/settlements/:id/withdraw', merchantAuth, async (req, res) => {
  const { id } = req.params;
  const { target, note } = req.body;

  try {
    const sResult = await query(
      'SELECT * FROM settlements WHERE id = $1 AND venue_id = $2',
      [id, req.merchant.venueId]
    );
    if (sResult.rows.length === 0) {
      return res.status(404).json({ error: '结算记录未找到' });
    }
    const settlement = sResult.rows[0];
    if (settlement.status !== 'pending') {
      return res.status(400).json({ error: '该结算周期已处理' });
    }

    await query(
      'UPDATE settlements SET status = $1, transfer_proof = $2 WHERE id = $3',
      ['processing', JSON.stringify({ requestedAt: new Date(), target, note }), id]
    );

    res.json({ success: true, id, status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 7. POST /api/v1/merchant/refund — 发起退款
// -----------------------------------------------------------
app.post('/api/v1/merchant/refund', merchantAuth, async (req, res) => {
  const { orderId, reason } = req.body;
  if (!orderId) return res.status(400).json({ error: 'missing orderId' });

  try {
    // 验证订单属于该商户
    const orderResult = await query(
      'SELECT * FROM orders WHERE id = $1 AND venue_id = $2',
      [orderId, req.merchant.venueId]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: '订单未找到' });
    }
    const order = orderResult.rows[0];
    if (order.status !== 'paid') {
      return res.status(400).json({ error: '订单状态不允许退款' });
    }

    // 通过 payment-svc 退款
    const axios = require('axios');
    const PAYMENT_URL = `http://localhost:${process.env.PAYMENT_PORT || 3002}`;
    const refundResult = await axios.post(
      `${PAYMENT_URL}/api/v1/refund`,
      { orderId, reason: reason || '商户发起退款' },
      { headers: { Authorization: req.headers.authorization } }
    );

    if (refundResult.data.success) {
      await query(
        'UPDATE orders SET refund_reason = $1, refund_initiated_by = $2 WHERE id = $3',
        [reason || '商户退款', 'merchant', orderId]
      );
      res.json({ success: true, orderId, status: 'refunded' });
    } else {
      res.status(500).json({ error: '退款失败', detail: refundResult.data.error });
    }
  } catch (err) {
    console.error('[Merchant Refund]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 🛡️ ADMIN API
// ============================================================

// -----------------------------------------------------------
// 8. POST /api/v1/admin/login — 管理员登录
// -----------------------------------------------------------
app.post('/api/v1/admin/login', async (req, res) => {
  const { email, password, username } = req.body;
  const loginId = email || username;

  if (!loginId || !password) {
    return res.status(400).json({ error: 'username/email and password required' });
  }

  try {
    const result = await query(
      `SELECT * FROM admins WHERE email = $1 OR username = $1`,
      [loginId]
    );

    const admin = result.rows[0];
    if (!admin) return res.status(404).json({ error: '管理员不存在' });
    if (admin.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });

    const valid = bcrypt.compareSync(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: '密码错误' });

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: admin.role, isAdmin: true },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      }
    });
  } catch (err) {
    console.error('[Admin Login]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 9. GET /api/v1/admin/venues — 场馆列表
// -----------------------------------------------------------
app.get('/api/v1/admin/venues', adminAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
  const offset = (page - 1) * pageSize;

  try {
    const countResult = await query('SELECT COUNT(*)::int AS total FROM venues', []);
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `SELECT id, name, address, contact, phone, email, status, rate_plan, created_at
       FROM venues ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    res.json({
      list: (result.rows || []).map(v => ({
        id: v.id,
        name: v.name,
        address: v.address,
        contact: v.contact,
        phone: v.phone,
        email: v.email,
        status: v.status,
        ratePlan: v.rate_plan,
        createdAt: toLocaleDT(v.created_at),
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 10. POST /api/v1/admin/venues — 创建场馆
// -----------------------------------------------------------
app.post('/api/v1/admin/venues', adminAuth, async (req, res) => {
  const { name, address, contact, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const defaultPwd = 'poker123';
    const hash = bcrypt.hashSync(defaultPwd, 10);

    const result = await query(
      `INSERT INTO venues (name, address, contact, phone, email, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email`,
      [name, address || '', contact || '', phone || '', email || null, hash]
    );

    res.json({
      success: true,
      venue: result.rows[0],
      defaultPassword: defaultPwd,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 11. POST /api/v1/admin/devices/bind — 管理员绑定设备到场馆
// -----------------------------------------------------------
app.post('/api/v1/admin/devices/bind', adminAuth, async (req, res) => {
  const { venueId, deviceSn, tableLabel } = req.body;
  if (!venueId || !deviceSn) return res.status(400).json({ error: 'venueId and deviceSn required' });

  try {
    // 验证场馆存在
    const venueResult = await query('SELECT id FROM venues WHERE id = $1', [venueId]);
    if (venueResult.rows.length === 0) {
      return res.status(404).json({ error: '场馆不存在' });
    }

    // 绑定或更新
    await query(
      `INSERT INTO device_bindings (device_sn, venue_id, table_label)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_sn) DO UPDATE SET venue_id = $2, table_label = $3`,
      [deviceSn, venueId, tableLabel || null]
    );

    // 创建牌桌
    const tableCode = generateTableCode();
    await query(
      `INSERT INTO tables (venue_id, device_sn, code, label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_sn) DO UPDATE SET venue_id = $1, label = $4`,
      [venueId, deviceSn, tableCode, tableLabel || '桌台1']
    );

    res.json({ success: true, venueId, deviceSn, tableCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 12. GET /api/v1/admin/orders — 全局订单
// -----------------------------------------------------------
app.get('/api/v1/admin/orders', adminAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
  const offset = (page - 1) * pageSize;
  const { dateStart, dateEnd, status, venueId } = req.query;

  try {
    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (dateStart) { where += ` AND o.created_at >= $${idx++}`; params.push(dateStart); }
    if (dateEnd)   { where += ` AND o.created_at <= $${idx++}`; params.push(dateEnd + 'T23:59:59Z'); }
    if (status)    { where += ` AND o.status = $${idx++}`; params.push(status); }
    if (venueId)   { where += ` AND o.venue_id = $${idx++}`; params.push(venueId); }

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM orders o ${where}`, params
    );
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `SELECT o.id, o.amount, o.venue_income, o.platform_fee, o.status,
              o.payer_identifier, o.xunhupay_order_id,
              o.paid_at, o.refunded_at, o.refund_reason, o.created_at,
              o.refund_initiated_by,
              t.display_code AS tournament_code,
              v.name AS venue_name,
              db.device_sn
       FROM orders o
       LEFT JOIN tournaments t ON o.tournament_id = t.id
       LEFT JOIN venues v ON o.venue_id = v.id
       LEFT JOIN device_bindings db ON db.venue_id = o.venue_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset]
    );

    res.json({
      list: (result.rows || []).map(o => ({
        orderNo: o.xunhupay_order_id || o.id,
        time: o.paid_at ? toLocaleDT(o.paid_at) : toLocaleDT(o.created_at),
        account: o.payer_identifier || '--',
        amount: o.amount,
        venueIncome: o.venue_income,
        platformFee: o.platform_fee,
        venueName: o.venue_name || '--',
        deviceSN: o.device_sn || '--',
        matchId: o.tournament_code || '--',
        status: o.status,
        refundReason: o.refund_reason || '',
        refundInitiatedBy: o.refund_initiated_by || '',
      })),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------
// 13. POST /api/v1/admin/refund — 平台发起退款
// -----------------------------------------------------------
app.post('/api/v1/admin/refund', adminAuth, async (req, res) => {
  const { orderId, reason } = req.body;
  if (!orderId) return res.status(400).json({ error: 'missing orderId' });

  try {
    const orderResult = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: '订单未找到' });
    }
    const order = orderResult.rows[0];
    if (order.status !== 'paid') {
      return res.status(400).json({ error: '订单状态不允许退款' });
    }

    // 通过 payment-svc 退款
    const axios = require('axios');
    const PAYMENT_URL = `http://localhost:${process.env.PAYMENT_PORT || 3002}`;
    const refundResult = await axios.post(
      `${PAYMENT_URL}/api/v1/refund`,
      { orderId, reason: reason || '平台发起退款' },
      { headers: { Authorization: req.headers.authorization } }
    );

    if (refundResult.data.success) {
      await query(
        'UPDATE orders SET refund_reason = $1, refund_initiated_by = $2 WHERE id = $3',
        [reason || '平台退款', 'admin', orderId]
      );
      res.json({ success: true, orderId, status: 'refunded' });
    } else {
      res.status(500).json({ error: '退款失败', detail: refundResult.data.error });
    }
  } catch (err) {
    console.error('[Admin Refund]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 辅助
// ============================================================
function generateTableCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Merchant API] running on port ${PORT}`);
  console.log(`[Merchant API] Merchant routes: /api/v1/merchant/*`);
  console.log(`[Merchant API] Admin routes: /api/v1/admin/*`);
});

module.exports = app;
