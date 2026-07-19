# Poker Night 虎皮椒支付服务 — 交付说明

**日期**: 2026-07-19
**项目**: `/Users/mac/Documents/Codex/poker-night`
**改动文件**: `server/payment-svc/index.js`（重写）、`.env.example`、`ecosystem.config.js`

## 目标
为 Poker Night 实现完整的支付服务（端口 3002），对接虎皮椒 (xunhupay.com) 支付通道：扫码创建订单 → 异步回调确认 → 支付成功后自动激活赛事。

## 关键背景发现
- 任务描述称 `/opt/poker-night/shared/`，实际不存在；共享模块位于 `server/shared/`（`@poker-night/shared`，通过 npm workspaces 本地链接）。
- DB 实际 schema（`server/migrations/001_init.sql`）中 `orders.id`、`tables.id`、`tournaments.id` 均为 **UUID**，非任务示例里的整型。
- 原 `index.js` 已有较完整框架，但存在关键 **BUG**：回调用 `parseInt(xunhuOrderId.split('-')[1])` 解析订单 ID —— 对 UUID 主键完全失效，回调永远匹配不到订单。
- 端口应为 **3002**（PAYMENT_PORT），非任务描述的 3003（3003 是 merchant-api）。
- 前端 `public/pay.html` 契约：先 `GET /api/v1/tables/:code` 取牌桌信息，再 `POST /pay/api/v1/payment/create`。

## 实现要点
### API 端点
- `GET  /health`
- `GET  /api/v1/tables/:code` — 牌桌信息（供支付页加载）
- `POST /api/v1/payment/create` — 创建订单（也支持 `GET ...?table=CODE&device=SN` 扫码流程）
- `POST /api/v1/payment/callback` — 虎皮椒异步回调（**任务要求路径**）
- `POST /api/v1/payment/notify` — 回调别名（向后兼容旧代码）
- `GET  /api/v1/payment/status/:order_id` — 订单状态查询（`?refresh=1` 主动向虎皮椒查询回写）
- `POST /api/v1/refund` — 退款（JWT 鉴权）
- `GET  /api/v1/orders`、`/api/v1/orders/:id`、`/api/v1/payment/order/:id` — 兼容旧接口

### 虎皮椒对接
- APPID `202606301`（`XUNHU_APPID`/`XUNHU_APP_ID`，占位符默认值）
- APPKEY 从 env（`XUNHU_APPKEY`/`XUNHU_APP_SECRET`），代码不硬编码真实密钥
- 下单 `https://api.xunhupay.com/v1/payment`，查询 `.../v1/payment/query`（env 可覆盖）
- 签名：参数按 key ASCII 升序拼接 + APPKEY，MD5 小写；回调用 `crypto.timingSafeEqual` 时序安全校验

### 订单创建流程
扫码 → 解析牌桌（UUID 或短码 code 或 device_sn）→ 读取 venue.rate_plan 算分账（平台 30% / 场馆 70%，向下取整）→ 事务内创建 tournament(pending) + order(pending) + 生成商户交易号 `PN-YYYYMMDD-<hex>` 写入 `xunhupay_order_id` → 调虎皮椒下单 → 返回 payUrl/qrcode。下单失败自动回滚为 cancelled。

### 回调处理（核心修复）
- 通过 `trade_order_id` **反查 `orders.xunhupay_order_id`**（不再用 parseInt 解析 UUID）
- 幂等：`UPDATE ... WHERE status='pending' RETURNING`，重复回调直接返回 success
- 成功：order→paid、tournament→registering，软触发 `poker-socket.activateTournament()`

### 赛事激活 & display_code
- display_code 格式 `PN-YYYYMMDD-NNN`（按当天已存在的同前缀数量 +1，`COUNT LIKE`）
- 支付成功自动将订单关联的 tournament 置为 registering

## 验证
- `node -e require` 加载 index.js / ecosystem.config.js 均通过
- 启动服务 smoke test：`/health` OK；坏签名回调→`fail`；合法签名非 OD→`success`；缺参 create→400
- sign() 自测：签名可复现校验通过
- DB 相关路径未做集成测试（本机无 psql/DB，DB 在服务器）

## 提交
- commit（前缀 `feat(payment):`）仅包含本任务 3 个文件；`server/poker-engine/sng-manager.js` 的既有未提交改动与本任务无关，未纳入。
