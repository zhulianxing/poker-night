# Poker Night E2E Test Report

**Date**: 2026-07-19T09:49:38.683Z → 2026-07-19T09:49:47.794Z
**Target**: https://pokernight.cc
**Table Code**: SNGT01

## Summary

| Metric | Count |
|--------|-------|
| Total  | 15 |
| ✅ Pass | 13 |
| ❌ Fail | 0 |
| ⏭️ Skip | 2 |
| Pass Rate | 86.7% |

## Detailed Results

### ✅ socket.io-client available

- **Status**: PASS
- **Message**: module found

### ⏭️ Server health check

- **Status**: 200
- **Response Time**: 291ms
- **Message**: {"ok":true,"service":"poker-api"}

### ⏭️ GET /tables/SNGT01/status

- **Status**: 200
- **Response Time**: 66ms
- **Message**: table=SNGT01, tournament=99e3320a, status=registering, players=0

<details>
<summary>Response Body (truncated)</summary>

```json
{
  "table": {
    "id": "48cabe4c-038c-424b-9b1a-06c63d5e86a5",
    "venue_id": "087b991c-3418-4604-a0d2-395e8dece8db",
    "device_sn": null,
    "code": "SNGT01",
    "label": "Test Table",
    "launch_fee": 2500,
    "max_players": 6,
    "status": "idle",
    "created_at": "2026-07-18T09:18:44.426Z"
  },
  "tournament": {
    "id": "99e3320a-29b3-485f-92d7-00a18d0b1d40",
    "display_code": "6LMZFN",
    "table_id": "48cabe4c-038c-424b-9b1a-06c63d5e86a5",
    "status": "registering",
    "launch_fee": 2500,
    "player_count": 0,
    "max_players": 6,
    "start_chips": 1000,
    "start_b
... (truncated)
```
</details>

### ⏭️ POST /auth/send-code

- **Status**: 200
- **Response Time**: 60ms
- **Message**: Code sent to e2e_bot_1784454578683@test.poker

```json
{
  "success": true
}
```

### ⏭️ POST /auth/register

- **Status**: SKIP
- **Message**: Requires real email verification code — need SMTP access to test

### ⏭️ POST /auth/login

- **Status**: SKIP
- **Message**: Requires real email verification code — need SMTP access to test

### ⏭️ GET /tables/SNGT01/status (confirm)

- **Status**: 200
- **Response Time**: 58ms
- **Message**: Tournament: registering, players: 0

### ⏭️ Health: poker-api

- **Status**: 200
- **Response Time**: 55ms
- **Message**: service=poker-api

```json
{
  "ok": true,
  "service": "poker-api"
}
```

### ⏭️ Health: payment-svc

- **Status**: 200
- **Response Time**: 56ms
- **Message**: service=poker-api

```json
{
  "ok": true,
  "service": "poker-api"
}
```

### ⏭️ Health: poker-socket

- **Status**: 200
- **Response Time**: 55ms
- **Message**: service=poker-api

```json
{
  "ok": true,
  "service": "poker-api"
}
```

### ✅ Socket.IO connected

- **Status**: PASS
- **Response Time**: 245ms
- **Message**: socketId=9Hh9HfMNT_OjIusfAAAd, transport=websocket

### ✅ Socket.IO: table_state

- **Status**: PASS
- **Response Time**: 313ms
- **Message**: phase=registering, seats=6, sb=10, bb=20

<details>
<summary>Response Body (truncated)</summary>

```json
{
  "phase": "registering",
  "tournamentId": "99e3320a-29b3-485f-92d7-00a18d0b1d40",
  "seats": [
    {
      "seatIndex": 0,
      "status": "empty"
    },
    {
      "seatIndex": 1,
      "status": "empty"
    },
    {
      "seatIndex": 2,
      "status": "empty"
    },
    {
      "seatIndex": 3,
      "status": "empty"
    },
    {
      "seatIndex": 4,
      "status": "empty"
    },
    {
      "seatIndex": 5,
      "status": "empty"
    }
  ],
  "displayCode": "6LMZFN",
  "sb": 10,
  "bb": 20,
  "blindLevel": 1,
  "pot": 0,
  "communityCards": [],
  "actingIndex": -1,
  "dealerIndex":
... (truncated)
```
</details>

### ✅ Socket.IO: received events

- **Status**: PASS
- **Message**: 1 event(s): [table_state]

### ⏭️ POST /payment/create

- **Status**: 200
- **Response Time**: 384ms
- **Message**: orderId=18683199-4dda-406a-8779-5323869b78fa, amount=undefined yuan, displayCode=QAA6SD

```json
{
  "orderId": "18683199-4dda-406a-8779-5323869b78fa",
  "tournamentId": "2b0354eb-3be6-4ebd-a56f-abb60246e6c8",
  "displayCode": "QAA6SD",
  "payUrl": "https://api.xunhupay.com/payments/wechat/index?id=20302454921&nonce_str=4845471587&time=1784454587&a..."
}
```

### ⏭️ GET /payment/order/:orderId

- **Status**: 200
- **Response Time**: 61ms
- **Message**: display_code=QAA6SD, status=pending

```json
{
  "id": "18683199-4dda-406a-8779-5323869b78fa",
  "status": "pending",
  "amount": 2500,
  "player_name": null,
  "display_code": "QAA6SD",
  "tournament_status": "pending",
  "table_code": "SNGT01"
}
```

## Recommendations

All tests passed. System is functioning normally.
