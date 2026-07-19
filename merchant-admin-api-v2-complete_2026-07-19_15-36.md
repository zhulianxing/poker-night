# Poker Night — 商户/运营后台 API v2.0 完成

## 目标
完成 DEV_DOC v2.0 定义的 Merchant API (7 端点) + Admin API (6 端点) + 前端页面

## 变更内容

### 后端: `server/merchant-api/index.js`
完整重写，包含所有 13 个 API 端点 + 2 个额外端点:

**商户 API (7 endpoints):**
1. `POST /api/v1/merchant/login` — 邮箱+密码登录 (bcrypt 密码验证)
2. `GET /api/v1/merchant/dashboard` — 数据看板 (今日订单/流水/待结算/本周赛事/客流量/设备数 + 7天趋势图表数据)
3. `GET /api/v1/merchant/orders` — 订单明细 (分页, 按日期/状态筛选)
4. `GET /api/v1/merchant/devices` — 设备列表
5. `GET /api/v1/merchant/settlements` — 结算记录
6. `POST /api/v1/merchant/settlements/:id/withdraw` — 申请提现
7. `POST /api/v1/merchant/refund` — 商户发起退款 (通过 payment-svc 调用虎皮椒退款)
- 额外: `POST /devices/bind`, `POST /devices/unbind`

**管理 API (6 endpoints):**
8. `POST /api/v1/admin/login` — 管理员登录
9. `GET /api/v1/admin/venues` — 场馆列表 (分页)
10. `POST /api/v1/admin/venues` — 创建场馆 (自动生成默认密码)
11. `POST /api/v1/admin/devices/bind` — 管理员绑定设备到场馆
12. `GET /api/v1/admin/orders` — 全局订单查看
13. `POST /api/v1/admin/refund` — 平台发起退款

### 数据库: `server/migrations/003_merchant_admin.sql`
- venues 表新增 `email`, `password_hash` 字段
- 新建 `admins` 表 (username, email, password_hash, role)
- 测试数据: 测试酒吧 (admin@testbar.com / poker123), 管理员 (admin@poker.com / admin123)

### 依赖更新: `server/merchant-api/package.json`
- 新增 axios 依赖 (用于调用 payment-svc 退款)

### 商户前端: `merchant-dashboard/`
- `login.html` — 邮箱+密码登录, API 路径对齐
- `app.js` — 完整重写, 连接到真实后端 API, 所有页面使用 `/merchant/api/v1/merchant/*` 路径:
  - 数据看板: 6 个统计卡片 + 7天趋势图
  - 订单管理: 分页列表 + 日期/状态筛选 + CSV 导出
  - 设备管理: 列表/绑定/解绑
  - 结算管理: 结算周期列表 + 提现申请
  - 退款管理: 已退款订单展示 + 发起退款

### 运营前端: `admin-dashboard/`
- `admin-login.html` — 管理员登录
- `dashboard.html` — 场馆管理/全局订单/设备绑定/平台退款, 使用 `/merchant/api/v1/admin/*` 路径

### 入口页: `server/merchant-api/public/index.html`
Poker Night 管理后台总入口, 链接到商户后台和运营后台

## 已提交
- Commit: `a590d88` (message: `feat(merchant): ...`)
- Branches: `main` → `origin/main`
