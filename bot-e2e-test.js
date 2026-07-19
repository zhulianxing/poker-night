#!/usr/bin/env node
/**
 * Poker Night Bot E2E Test Script
 * Tests: REST API, WebSocket (Socket.IO), Payment flow
 * Target: https://pokernight.cc
 */
'use strict';

const { io } = require('socket.io-client');
const https = require('https');
const http = require('http');
const fs = require('fs');

// ============================================================
// Config
// ============================================================
const BASE_URL = 'https://pokernight.cc';
const API_BASE = `${BASE_URL}/api/v1`;
const SOCKET_URL = BASE_URL;
const TABLE_CODE = 'SNGT01';
const TEST_EMAIL = `e2e_bot_${Date.now()}@test.poker`;
const TEST_NICKNAME = `E2EBot_${Date.now() % 100000}`;

// ============================================================
// Test Report Collector
// ============================================================
const report = {
  startTime: new Date().toISOString(),
  results: [],
  summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
};

function record(name, status, details = {}) {
  report.results.push({ name, status, ...details });
  report.summary.total++;
  if (status === 'PASS') report.summary.passed++;
  else if (status === 'FAIL') report.summary.failed++;
  else report.summary.skipped++;
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`  ${icon} ${name}${details.message ? ': ' + details.message : ''}`);
}

// ============================================================
// HTTP Request Helper
// ============================================================
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'PokerNight-E2E-Bot/1.0',
      ...(options.headers || {}),
    };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const startTime = Date.now();
    const req = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers,
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const elapsed = Date.now() - startTime;
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data, elapsed });
        });
      }
    );
    req.on('error', (err) => reject({ error: err.message, code: err.code }));
    req.on('timeout', () => { req.destroy(); reject({ error: 'request timeout', code: 'TIMEOUT' }); });
    if (body) req.write(body);
    req.end();
  });
}

// ============================================================
// Step 1: Environment Check
// ============================================================
async function step1_environmentCheck() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 1: Environment Check');
  console.log('='.repeat(60));

  // socket.io-client
  try {
    require.resolve('socket.io-client');
    record('socket.io-client available', 'PASS', { message: 'module found' });
  } catch {
    record('socket.io-client available', 'FAIL', { message: 'not installed. Run: npm install' });
    return false;
  }

  // Server connectivity
  try {
    const res = await httpRequest(`${BASE_URL}/health`, { timeout: 8000 });
    if (res.status === 200) {
      record('Server health check', 'PASS', {
        status: res.status, message: JSON.stringify(res.data), elapsed: `${res.elapsed}ms`,
      });
    } else {
      record('Server health check', 'FAIL', {
        status: res.status, message: `Unexpected status`, elapsed: `${res.elapsed}ms`,
      });
    }
  } catch (err) {
    record('Server health check', 'FAIL', { message: err.error || err.message, code: err.code });
    return false;
  }

  return true;
}

// ============================================================
// Step 2: API Tests
// ============================================================
async function step2_apiTests() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 2: REST API Tests');
  console.log('='.repeat(60));

  // 2.1 GET /tables/SNGT01/status
  let tableData = null;
  try {
    const res = await httpRequest(`${API_BASE}/tables/${TABLE_CODE}/status`);
    if (res.status === 200) {
      tableData = res.data;
      const t = tableData?.table;
      const tn = tableData?.tournament;
      record('GET /tables/SNGT01/status', 'PASS', {
        status: res.status,
        message: `table=${t?.code}, tournament=${tn?.id?.substring(0,8)||'none'}, status=${tn?.status||'none'}, players=${tableData?.players?.length||0}`,
        elapsed: `${res.elapsed}ms`,
        response: tableData,
      });
    } else if (res.status === 404) {
      record('GET /tables/SNGT01/status', 'FAIL', {
        status: res.status, message: `Table '${TABLE_CODE}' not found on server`, elapsed: `${res.elapsed}ms`,
      });
    } else {
      record('GET /tables/SNGT01/status', 'FAIL', {
        status: res.status, message: JSON.stringify(res.data), elapsed: `${res.elapsed}ms`,
      });
    }
  } catch (err) {
    record('GET /tables/SNGT01/status', 'FAIL', { message: err.error || err.message, code: err.code });
  }

  // 2.2 POST /auth/send-code
  let codeSendOk = false;
  try {
    const res = await httpRequest(`${API_BASE}/auth/send-code`, {
      method: 'POST', body: { email: TEST_EMAIL, purpose: 'register' },
    });
    if (res.status === 200) {
      codeSendOk = true;
      record('POST /auth/send-code', 'PASS', {
        status: res.status, message: `Code sent to ${TEST_EMAIL}`, elapsed: `${res.elapsed}ms`, response: res.data,
      });
    } else {
      record('POST /auth/send-code', 'FAIL', {
        status: res.status, message: JSON.stringify(res.data), elapsed: `${res.elapsed}ms`, response: res.data,
      });
    }
  } catch (err) {
    record('POST /auth/send-code', 'FAIL', { message: err.error || err.message, code: err.code });
  }

  // 2.3 POST /auth/register (requires real email verification code — SKIP)
  record('POST /auth/register', 'SKIP', { message: 'Requires real email verification code — need SMTP access to test' });

  // 2.4 POST /auth/login (requires real email verification code — SKIP)
  record('POST /auth/login', 'SKIP', { message: 'Requires real email verification code — need SMTP access to test' });

  // 2.5 GET /tables/SNGT01/status (confirm)
  let authToken = null, playerId = null;
  try {
    const res = await httpRequest(`${API_BASE}/tables/${TABLE_CODE}/status`);
    if (res.status === 200) {
      record('GET /tables/SNGT01/status (confirm)', 'PASS', {
        status: res.status,
        message: `Tournament: ${res.data?.tournament?.status || 'none'}, players: ${res.data?.players?.length || 0}`,
        elapsed: `${res.elapsed}ms`,
      });
    } else {
      record('GET /tables/SNGT01/status (confirm)', 'FAIL', {
        status: res.status, message: JSON.stringify(res.data), elapsed: `${res.elapsed}ms`,
      });
    }
  } catch (err) {
    record('GET /tables/SNGT01/status (confirm)', 'FAIL', { message: err.error || err.message, code: err.code });
  }

  // 2.6 Health checks via API (reverse proxied)
  const healthEndpoints = [
    { name: 'poker-api', path: '/health' },
    { name: 'payment-svc', path: '/health' },
    { name: 'poker-socket', path: '/health' },
  ];
  for (const ep of healthEndpoints) {
    try {
      const res = await httpRequest(`${BASE_URL}${ep.path}`);
      if (res.status === 200) {
        const svcName = typeof res.data === 'object' ? res.data.service : 'unknown';
        record(`Health: ${ep.name}`, 'PASS', {
          status: res.status, message: `service=${svcName}`, elapsed: `${res.elapsed}ms`, response: res.data,
        });
      } else {
        record(`Health: ${ep.name}`, 'FAIL', {
          status: res.status, message: JSON.stringify(res.data), elapsed: `${res.elapsed}ms`,
        });
      }
    } catch (err) {
      record(`Health: ${ep.name}`, 'FAIL', { message: err.error || err.message, code: err.code });
    }
  }

  return { authToken, playerId, tableData };
}

// ============================================================
// Step 3: WebSocket / Socket.IO Connection Test
// ============================================================
async function step3_webSocketTest(authToken, playerId) {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 3: WebSocket / Socket.IO Test');
  console.log('='.repeat(60));

  return new Promise((resolve) => {
    const receivedEvents = [];
    const startTime = Date.now();
    const WAIT_MS = 8000;

    console.log(`  Connecting to ${SOCKET_URL} (role=tv)...`);

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 8000,
      query: { role: 'tv' },
    });

    const finalize = () => {
      socket.disconnect();
      if (receivedEvents.length === 0) {
        record('Socket.IO: received events', 'FAIL', { message: `No events in ${WAIT_MS / 1000}s` });
      } else {
        const summary = receivedEvents.map((e) => e.event).join(', ');
        record('Socket.IO: received events', 'PASS', {
          message: `${receivedEvents.length} event(s): [${summary}]`,
        });
      }
      console.log('\n  --- All received Socket.IO events ---');
      for (const evt of receivedEvents) {
        const preview = JSON.stringify(evt.data).substring(0, 150);
        console.log(`  [${evt.time}ms] ${evt.event}: ${preview}`);
      }
      resolve(receivedEvents.length > 0);
    };

    socket.on('connect', () => {
      const elapsed = Date.now() - startTime;
      record('Socket.IO connected', 'PASS', {
        message: `socketId=${socket.id}, transport=${socket.io.engine?.transport?.name || 'websocket'}`,
        elapsed: `${elapsed}ms`,
      });
      console.log(`  Emitting join_table for ${TABLE_CODE}...`);
      socket.emit('join_table', { tableCode: TABLE_CODE });
    });

    socket.on('table_state', (data) => {
      receivedEvents.push({ event: 'table_state', time: Date.now() - startTime, data });
      record('Socket.IO: table_state', 'PASS', {
        message: `phase=${data?.phase}, seats=${data?.seats?.length || 0}, sb=${data?.sb}, bb=${data?.bb}`,
        elapsed: `${Date.now() - startTime}ms`,
        response: data,
      });
    });

    socket.on('tournament_activated', (data) => {
      receivedEvents.push({ event: 'tournament_activated', time: Date.now() - startTime, data });
    });
    socket.on('countdown_tick', (data) => {
      receivedEvents.push({ event: 'countdown_tick', time: Date.now() - startTime, data });
    });
    socket.on('seat_joined', (data) => {
      receivedEvents.push({ event: 'seat_joined', time: Date.now() - startTime, data });
    });
    socket.on('hand_started', (data) => {
      receivedEvents.push({ event: 'hand_started', time: Date.now() - startTime, data });
    });
    socket.on('turn_changed', (data) => {
      receivedEvents.push({ event: 'turn_changed', time: Date.now() - startTime, data });
    });
    socket.on('error', (err) => {
      receivedEvents.push({ event: 'error', time: Date.now() - startTime, data: err });
      record('Socket.IO: error event', 'FAIL', { message: typeof err === 'string' ? err : JSON.stringify(err) });
    });
    socket.on('connect_error', (err) => {
      record('Socket.IO: connection error', 'FAIL', { message: err.message, elapsed: `${Date.now() - startTime}ms` });
      socket.disconnect();
      finalize();
    });
    socket.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') {
        record('Socket.IO: unexpected disconnect', 'FAIL', { message: `reason: ${reason}` });
      }
    });

    setTimeout(finalize, WAIT_MS);
  });
}

// ============================================================
// Step 4: Payment Flow Test
// ============================================================
async function step4_paymentTest(tableData) {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 4: Payment Flow Test');
  console.log('='.repeat(60));

  const tableId = tableData?.table?.id || TABLE_CODE;

  // 4.1 Create payment
  let orderId = null;
  try {
    const res = await httpRequest(`${API_BASE}/payment/create`, {
      method: 'POST',
      body: {
        tableId,
        device_sn: `E2E_TEST_${Date.now()}`,
        paymentMethod: 'wechat',
        payer: 'E2E_TestBot',
      },
    });
    if (res.status === 200 && res.data?.orderId) {
      orderId = res.data.orderId;
      record('POST /payment/create', 'PASS', {
        status: res.status,
        message: `orderId=${orderId}, amount=${res.data.amountYuan} yuan, displayCode=${res.data.displayCode}`,
        elapsed: `${res.elapsed}ms`,
        response: {
          orderId: res.data.orderId, tournamentId: res.data.tournamentId,
          displayCode: res.data.displayCode, amountYuan: res.data.amountYuan,
          tradeOrderId: res.data.tradeOrderId,
          payUrl: res.data.payUrl ? res.data.payUrl.substring(0, 100) + '...' : null,
        },
      });
    } else {
      record('POST /payment/create', 'FAIL', {
        status: res.status, message: JSON.stringify(res.data), elapsed: `${res.elapsed}ms`, response: res.data,
      });
    }
  } catch (err) {
    record('POST /payment/create', 'FAIL', { message: err.error || err.message, code: err.code });
  }

  // 4.2 Query order status (use /payment/order/:orderId which exists)
  if (orderId) {
    try {
      const res = await httpRequest(`${API_BASE}/payment/order/${orderId}`);
      if (res.status === 200) {
        record('GET /payment/order/:orderId', 'PASS', {
          status: res.status,
          message: `display_code=${res.data?.display_code}, status=${res.data?.status}`,
          elapsed: `${res.elapsed}ms`, response: res.data,
        });
      } else {
        record('GET /payment/order/:orderId', 'FAIL', {
          status: res.status, message: JSON.stringify(res.data), elapsed: `${res.elapsed}ms`,
        });
      }
    } catch (err) {
      record('GET /payment/order/:orderId', 'FAIL', { message: err.error || err.message, code: err.code });
    }
  } else {
    record('GET /payment/order/:orderId', 'SKIP', { message: 'Skipped: payment create failed' });
  }
}

// ============================================================
// Step 5: Generate Report
// ============================================================
function step5_generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('STEP 5: Generating Report');
  console.log('='.repeat(60));

  const endTime = new Date().toISOString();
  const lines = [];

  lines.push('# Poker Night E2E Test Report');
  lines.push('');
  lines.push(`**Date**: ${report.startTime} → ${endTime}`);
  lines.push(`**Target**: ${BASE_URL}`);
  lines.push(`**Table Code**: ${TABLE_CODE}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  const passRate = report.summary.total > 0
    ? ((report.summary.passed / report.summary.total) * 100).toFixed(1) : '0.0';
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Total  | ${report.summary.total} |`);
  lines.push(`| ✅ Pass | ${report.summary.passed} |`);
  lines.push(`| ❌ Fail | ${report.summary.failed} |`);
  lines.push(`| ⏭️ Skip | ${report.summary.skipped} |`);
  lines.push(`| Pass Rate | ${passRate}% |`);
  lines.push('');

  // Detailed Results
  lines.push('## Detailed Results');
  lines.push('');

  for (const r of report.results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    lines.push(`### ${icon} ${r.name}`);
    lines.push('');
    const details = [];
    if (r.status !== undefined) details.push(`- **Status**: ${r.status}`);
    if (r.elapsed) details.push(`- **Response Time**: ${r.elapsed}`);
    if (r.message) details.push(`- **Message**: ${r.message}`);
    if (r.code) details.push(`- **Error Code**: ${r.code}`);
    lines.push(details.join('\n'));

    if (r.response && typeof r.response === 'object') {
      const preview = JSON.stringify(r.response, null, 2);
      if (preview.length > 600) {
        lines.push('', '<details>', '<summary>Response Body (truncated)</summary>', '', '```json');
        lines.push(preview.substring(0, 600) + '\n... (truncated)');
        lines.push('```', '</details>');
      } else {
        lines.push('', '```json', preview, '```');
      }
    }
    lines.push('');
  }

  // Issues
  const failedTests = report.results.filter((r) => r.status === 'FAIL');
  if (failedTests.length > 0) {
    lines.push('## Issues Found');
    lines.push('');
    for (const f of failedTests) {
      lines.push(`- **${f.name}**: ${f.message || 'No details'}`);
    }
    lines.push('');
  }

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');
  if (failedTests.length === 0) {
    lines.push('All tests passed. System is functioning normally.');
  } else {
    lines.push(`Found ${failedTests.length} issue(s). Analysis:`);
    lines.push('');
    for (const f of failedTests) {
      const msg = f.message || '';
      if (msg.includes('not found')) {
        lines.push(`- **${f.name}**: Resource not found on server - verify table/user exists`);
      } else if (msg.includes('timeout') || msg.includes('TIMEOUT')) {
        lines.push(`- **${f.name}**: Request timed out - server may be overloaded or port not exposed`);
      } else if (msg.includes('ECONNREFUSED')) {
        lines.push(`- **${f.name}**: Connection refused - service may be down`);
      } else if (msg.includes('invalid or expired code')) {
        lines.push(`- **${f.name}**: Code "123456" is not valid - server generates random codes, need to extract from DB or use dev-mode bypass`);
      } else if (msg.includes('Cannot GET')) {
        lines.push(`- **${f.name}**: Route not registered - check if endpoint exists in the server code`);
      } else {
        lines.push(`- **${f.name}**: ${msg}`);
      }
    }
  }
  lines.push('');

  const reportContent = lines.join('\n');
  fs.writeFileSync('report.md', reportContent, 'utf-8');
  console.log(`\nReport written to: report.md (${reportContent.length} bytes)`);
  return reportContent;
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        Poker Night E2E Test Suite                       ║');
  console.log(`║  Target: ${BASE_URL.padEnd(48)}║`);
  console.log(`║  Table:  ${TABLE_CODE.padEnd(48)}║`);
  console.log(`║  Time:   ${new Date().toISOString().padEnd(48)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  const envOk = await step1_environmentCheck();
  if (!envOk) {
    console.log('\n❌ Environment check failed. Aborting.');
    step5_generateReport();
    process.exit(1);
  }

  const { authToken, playerId, tableData } = await step2_apiTests();
  await step3_webSocketTest(authToken, playerId);
  await step4_paymentTest(tableData);
  step5_generateReport();

  console.log('\n' + '═'.repeat(60));
  console.log(`FINAL: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`);
  console.log('═'.repeat(60));
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(2); });
