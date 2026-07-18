# Poker Night SNG 引擎完整修复 + 真机测试就绪 (2026-07-19 00:10)

## 本轮完成的工作

### 1. CALL 金额计算 Bug 修复（严重）
- **问题**: `callAmount = Math.min(hand.currentBet, player.chipCount)` 直接用 `currentBet`，没减去已投注额
- **修复**: `toCall = Math.max(0, hand.currentBet - alreadyBet)` → `callAmount = Math.min(toCall, player.chipCount)`

### 2. Bot AI 策略增强
- **旧**: 70% call / 30% fold，不 raise → 赛事永不结束
- **新**: 分段策略
  - check/steal raise (20%)
  - pot odds 分段决策 (25%/40% 阈值)
  - 短筹码 push-or-fold (chipCount < 3BB)
  - raise 逻辑

### 3. 高盲注无限循环修复
- **问题**: 2 人对局时双方筹码不够 BB，每次 all-in 后平局，无限循环
- **修复**: `startNewHand` 开头检查 `activePlayers.length === 2 && every chipCount < bb → finish()`

### 4. 所有玩家筹码耗尽保护
- **修复**: `canAffordBlind` 检查，所有玩家 chipCount=0 → 直接 finish()

### 5. 排名逻辑修复
- **问题**: survivors 都标为 rank=1（多人并列第一）
- **修复**: survivors 按筹码降序排列，淘汰者按淘汰顺序倒排

### 6. isFinished 保护
- 防止 `finish()` 后 `setTimeout(startNewHand)` 重复触发

### 7. 数据库持久化验证
- `tournament_finished` 事件回调写回 `tournaments` 和 `tournament_players` 表
- 排名、筹码、状态、结束时间全部正确持久化

### 8. 服务器端修复同步
- `poker-api`: POKER_SOCKET_PORT 3011→3001
- `poker-api`: 满员自动调用 `/internal/activate`
- `poker-socket`: `table_state` 添加 `tournamentId`

## 测试结果

### 完整赛事测试 #1（修复前）
- 6 Bot, 75s, 4 手牌, 5 次淘汰 ✅
- 但排名有并列问题（2 人都是 #1）

### 完整赛事测试 #2（修复后）
- 6 Bot, 80s, 4 手牌, 4 次淘汰 ✅
- 排名正确: #1 Bot3 (3220), #2 Bot4 (2780), #3-#6 淘汰
- DB 持久化完整 ✅

### Player E2E 模拟测试
- Player1 (模拟真人) 成功执行 check/call/raise/fold ✅
- 底牌正确接收 ✅
- 筹码实时更新 ✅
- 操作结果正确反馈 ✅

## Git 提交
- `6f31806` — 服务器端修复同步
- `b7c83e8` — SNG 引擎重大升级 (CALL bug + Bot AI + finish持久化)
- `4ed7a66` — 无限循环 + 排名修复

## 当前状态
- PM2 4 服务在线
- 新赛事 REAL04 已创建（registering, 桌号 SNGT01）
- Player App + TV Display Release APK 已安装至手机
- 完整 E2E 打牌流程已验证（自动测试通过）

## 真机测试指南
1. 打开 Player App → 注册/登录（邮箱验证码）
2. 输入桌号 `SNGT01` → 入座
3. 等待满员自动开赛（或让其他玩家加入）
4. 打牌：Fold/Check/Call/Raise/AllIn
5. TV Display 可同时连接显示赛事状态
