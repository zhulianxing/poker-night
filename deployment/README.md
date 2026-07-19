# Poker Night Deployment Guide

## 服务器信息

- **IP**: 43.164.130.145
- **用户**: root
- **项目目录**: /opt/poker-night

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                     Nginx (80/443)                      │
├─────────────────────────────────────────────────────────┤
│  /api/*      → poker-api      (3010)                   │
│  /ws/*       → poker-socket   (3001)  WebSocket        │
│  /socket.io/*→ poker-socket   (3001)  Socket.IO       │
│  /merchant/* → poker-merchant (3003)                   │
│  /payment/*  → poker-payment  (3002)                   │
│  /apk/*      → Static APK files                        │
│  /*          → Static files (index.html)               │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                  PM2 Process Manager                    │
├─────────────────────────────────────────────────────────┤
│  poker-api      - REST API Server        (Port 3010)  │
│  poker-socket   - WebSocket/Socket.IO    (Port 3001)  │
│  poker-payment  - Payment Service        (Port 3002)  │
│  poker-merchant - Merchant API           (Port 3003)  │
│  poker-bot      - Bot Test Service       (Port 3011)  │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│                 PostgreSQL Database                     │
│  Host: 127.0.0.1:5432                                  │
│  Database: poker_night                                 │
│  User: poker / Password: poker123                      │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 服务器初始化（首次部署）

```bash
cd deployment/scripts
chmod +x *.sh
./setup-server.sh
```

这将安装：
- Node.js 20
- PM2
- PostgreSQL
- Nginx
- 防火墙配置

### 2. 部署应用

```bash
./deploy.sh
```

选项：
- `--skip-apk` - 跳过 APK 同步
- `--skip-npm` - 跳过依赖安装

### 3. 数据库备份

```bash
./backup.sh           # 仅服务器备份
./backup.sh --upload  # 同时下载到本地
```

## 手动操作

### PM2 命令

```bash
# 查看状态
pm2 list

# 查看日志
pm2 logs poker-api
pm2 logs poker-socket

# 重启服务
pm2 restart poker-api
pm2 restart all

# 停止服务
pm2 stop poker-api

# 监控
pm2 monit
```

### Nginx 命令

```bash
# 测试配置
nginx -t

# 重载配置
systemctl reload nginx

# 查看日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### PostgreSQL 命令

```bash
# 连接数据库
psql -U poker -d poker_night

# 备份
pg_dump -U poker poker_night > backup.sql

# 恢复
psql -U poker poker_night < backup.sql
```

## 目录结构

```
/opt/poker-night/
├── server/
│   ├── poker-api/       # REST API
│   ├── poker-socket/    # WebSocket
│   ├── payment-svc/     # Payment
│   └── merchant-api/    # Merchant
├── shared/              # 共享模块
├── public/
│   ├── index.html       # 下载页面
│   ├── apk/
│   │   ├── poker-night-tv.apk
│   │   └── poker-night-player.apk
│   ├── admin/           # Admin Dashboard
│   └── merchant/        # Merchant Dashboard
├── backups/             # 数据库备份
├── ecosystem.config.js  # PM2 配置
└── package.json
```

## 环境变量

关键环境变量（在 ecosystem.config.js 中配置）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| NODE_ENV | 运行环境 | production |
| PORT | 服务端口 | 各服务不同 |
| DB_HOST | 数据库地址 | 127.0.0.1 |
| DB_PORT | 数据库端口 | 5432 |
| DB_NAME | 数据库名称 | poker_night |
| DB_USER | 数据库用户 | poker |
| DB_PASSWORD | 数据库密码 | poker123 |
| JWT_SECRET | JWT密钥 | poker-night-secret-2026 |

## SSL 配置（可选）

使用 Let's Encrypt：

```bash
# 安装 Certbot
apt-get install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d your-domain.com

# 自动续期
certbot renew --dry-run
```

## 故障排查

### 服务无法启动

```bash
# 检查端口占用
lsof -i :3010
lsof -i :3001

# 检查日志
pm2 logs poker-api --lines 100
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 状态
systemctl status postgresql

# 测试连接
psql -U poker -d poker_night -h 127.0.0.1
```

### Nginx 502 Bad Gateway

```bash
# 检查上游服务是否运行
pm2 list

# 检查 Nginx 配置
nginx -t

# 查看 Nginx 错误日志
tail -f /var/log/nginx/error.log
```

## 监控与日志

### 日志位置

- PM2 日志: `/var/log/pm2/*.log`
- Nginx 访问日志: `/var/log/nginx/access.log`
- Nginx 错误日志: `/var/log/nginx/error.log`
- PostgreSQL 日志: `/var/log/postgresql/*.log`

### 性能监控

```bash
# PM2 监控面板
pm2 monit

# 系统资源
htop

# 网络流量
nethogs
```

## 更新部署

```bash
# 1. 备份数据库
./backup.sh --upload

# 2. 部署新版本
./deploy.sh

# 3. 检查状态
ssh root@43.164.130.145 "pm2 list"
```

## 回滚

```bash
# 1. 停止服务
pm2 stop all

# 2. 恢复数据库
gunzip -c backups/poker_night_YYYYMMDD.sql.gz | psql -U poker poker_night

# 3. 回滚代码
git checkout <previous-commit>
./deploy.sh --skip-npm

# 4. 重启服务
pm2 restart all
```

---

**部署文档版本**: 1.0  
**最后更新**: 2026-07-19
