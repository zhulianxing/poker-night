/* ============================================
   Poker Night Merchant Dashboard - App Logic
   API paths aligned with backend /api/v1/merchant/*
   ============================================ */

(function () {
  'use strict';

  // ---- Config ----
  // Nginx proxy: /merchant/api/v1/ → /api/v1/
  // So /merchant/api/v1/merchant/xxx → backend /api/v1/merchant/xxx
  const API_BASE = '/merchant/api/v1/merchant';
  const PAGE_SIZE = 15;

  // ---- State ----
  let currentRoute = 'dashboard';
  let ordersPage = 1;
  let ordersTotal = 0;

  // ---- Init ----
  function init() {
    const token = localStorage.getItem('pn_merchant_token');
    if (!token) {
      window.location.href = 'login.html';
      return;
    }

    // Show merchant info
    const info = JSON.parse(localStorage.getItem('pn_merchant_info') || '{}');
    const el = document.getElementById('merchantInfo');
    if (el) el.textContent = info.name || info.email || '商户';

    // Clock
    updateClock();
    setInterval(updateClock, 60000);

    // Nav events
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        navigateTo(item.dataset.route);
      });
    });

    // Mobile toggle
    const toggle = document.getElementById('mobileToggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logout);
    }

    // Modal close on overlay click
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
      });
    }

    // Initial route
    const hash = window.location.hash.slice(1);
    navigateTo(hash || 'dashboard');

    window.addEventListener('hashchange', () => {
      const h = window.location.hash.slice(1);
      if (h) navigateTo(h);
    });
  }

  function updateClock() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const el = document.getElementById('currentTime');
    if (el) el.textContent = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  // ---- Router ----
  function navigateTo(route) {
    currentRoute = route;
    window.location.hash = route;

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === route);
    });

    const titles = {
      dashboard: '数据看板',
      orders: '订单管理',
      devices: '设备管理',
      settlements: '结算管理',
      refunds: '退款管理'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[route] || '数据看板';

    // Close sidebar on mobile
    document.getElementById('sidebar')?.classList.remove('open');

    const content = document.getElementById('contentArea');
    if (!content) return;
    content.innerHTML = '<div class="loading">加载中</div>';

    switch (route) {
      case 'dashboard': renderDashboard(content); break;
      case 'orders': renderOrders(content); break;
      case 'devices': renderDevices(content); break;
      case 'settlements': renderSettlements(content); break;
      case 'refunds': renderRefunds(content); break;
      default: renderDashboard(content);
    }
  }

  // ---- API ----
  async function api(path, options) {
    const token = localStorage.getItem('pn_merchant_token');
    const opts = options || {};
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(API_BASE + path, opts);
      if (res.status === 401) {
        showToast('登录已过期，请重新登录', 'error');
        setTimeout(() => { localStorage.removeItem('pn_merchant_token'); window.location.href = 'login.html'; }, 1500);
        return null;
      }
      return res.json();
    } catch (err) {
      console.error('API error:', err);
      return null;
    }
  }

  // ---- Toast ----
  function showToast(msg, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ---- Modal ----
  function openModal(title, bodyHTML, actionsHTML) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modalContent');
    if (!overlay || !modal) return;
    modal.innerHTML = `<div class="modal-title">${title}</div>${bodyHTML}<div class="modal-actions">${actionsHTML || ''}</div>`;
    overlay.classList.add('show');
  }

  function closeModal() {
    document.getElementById('modalOverlay')?.classList.remove('show');
  }

  // ---- Logout ----
  function logout() {
    localStorage.removeItem('pn_merchant_token');
    localStorage.removeItem('pn_merchant_info');
    window.location.href = 'login.html';
  }

  // ============================================
  // Dashboard
  // ============================================
  async function renderDashboard(container) {
    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">今日订单数</div>
          <div class="stat-value" id="todayOrders">--</div>
          <div class="stat-sub" id="todayOrdersSub">单</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">今日流水总额</div>
          <div class="stat-value gold" id="todayRevenue">--</div>
          <div class="stat-sub" id="todayRevenueSub">元</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">待结算金额</div>
          <div class="stat-value warning" id="pendingSettlement">--</div>
          <div class="stat-sub" id="pendingSettlementSub">元</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">本周赛事场次</div>
          <div class="stat-value" id="weekMatches">--</div>
          <div class="stat-sub" id="weekMatchesSub">场</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">本周客流量</div>
          <div class="stat-value" id="weekTraffic">--</div>
          <div class="stat-sub" id="weekTrafficSub">人次</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">绑定设备数</div>
          <div class="stat-value success" id="totalDevices">--</div>
          <div class="stat-sub" id="totalDevicesSub">台</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">最近 7 天订单趋势</div>
        <div class="chart-container">
          <canvas id="chartCanvas"></canvas>
        </div>
      </div>
    `;

    // 加载真实数据
    const data = await api('/dashboard');
    if (data) {
      document.getElementById('todayOrders').textContent = data.todayOrders ?? 0;
      document.getElementById('todayRevenue').textContent = '¥' + formatYuan(data.todayRevenue);
      document.getElementById('pendingSettlement').textContent = '¥' + formatYuan(data.pendingSettlement);
      document.getElementById('weekMatches').textContent = data.weekMatches ?? 0;
      document.getElementById('weekTraffic').textContent = data.weekTraffic ?? 0;
      document.getElementById('totalDevices').textContent = data.totalDevices ?? 0;

      drawChart(data.chartData || []);
    } else {
      // 降级显示 demo 数据
      fillDashboardDemo();
      drawChart(getDemoChartData());
    }
  }

  function fillDashboardDemo() {
    document.getElementById('todayOrders').textContent = '--';
    document.getElementById('todayRevenue').textContent = '¥--';
    document.getElementById('pendingSettlement').textContent = '¥--';
    document.getElementById('weekMatches').textContent = '--';
    document.getElementById('weekTraffic').textContent = '--';
    document.getElementById('totalDevices').textContent = '--';
  }

  function getDemoChartData() {
    return [
      { date: 'D-6', orders: 32, revenue: 2240 },
      { date: 'D-5', orders: 38, revenue: 2660 },
      { date: 'D-4', orders: 45, revenue: 3150 },
      { date: 'D-3', orders: 41, revenue: 2870 },
      { date: 'D-2', orders: 52, revenue: 3640 },
      { date: 'D-1', orders: 39, revenue: 2730 },
      { date: '今天', orders: 47, revenue: 3290 }
    ];
  }

  // ---- Chart ----
  function drawChart(data) {
    const canvas = document.getElementById('chartCanvas');
    if (!canvas || !data.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    const maxVal = Math.max(...data.map(d => d.orders), 10);
    const barW = Math.min(chartW / data.length * 0.6, 40);
    const gap = (chartW - barW * data.length) / (data.length + 1);

    // Y axis
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px -apple-system';
    ctx.textAlign = 'right';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = Math.round(maxVal * i / steps);
      const y = padding.top + chartH - (chartH * i / steps);
      ctx.fillText(val, padding.left - 8, y + 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();
    }

    // Bars
    data.forEach((d, i) => {
      const x = padding.left + gap + (barW + gap) * i;
      const barH = (d.orders / maxVal) * chartH;
      const y = padding.top + chartH - barH;

      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#FFD700');
      grad.addColorStop(1, 'rgba(255,215,0,0.3)');
      ctx.fillStyle = grad;

      const r = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, y + barH);
      ctx.lineTo(x, y + barH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px -apple-system';
      ctx.textAlign = 'center';
      ctx.fillText(d.orders, x + barW / 2, y - 6);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(d.date, x + barW / 2, H - padding.bottom + 18);
    });
  }

  // ============================================
  // Orders
  // ============================================
  async function renderOrders(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>订单列表</span>
          <button class="btn btn-outline btn-sm" id="exportCSV">导出 CSV</button>
        </div>
        <div class="filters">
          <div class="filter-group">
            <label>开始日期</label>
            <input type="date" id="filterDateStart">
          </div>
          <div class="filter-group">
            <label>结束日期</label>
            <input type="date" id="filterDateEnd">
          </div>
          <div class="filter-group">
            <label>状态</label>
            <select id="filterStatus">
              <option value="">全部</option>
              <option value="paid">已支付</option>
              <option value="refunded">已退款</option>
              <option value="pending">待支付</option>
            </select>
          </div>
          <button class="btn btn-gold btn-sm" id="filterBtn">查询</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>订单号</th>
                <th>时间</th>
                <th>付费账号</th>
                <th>金额(元)</th>
                <th>70%分成(元)</th>
                <th>赛事编号</th>
                <th>设备SN</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody id="ordersTbody">
              <tr><td colspan="8"><div class="loading">加载中</div></td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="ordersPagination"></div>
      </div>
    `;

    document.getElementById('filterBtn')?.addEventListener('click', () => {
      ordersPage = 1;
      loadOrders();
    });
    document.getElementById('exportCSV')?.addEventListener('click', exportOrdersCSV);

    loadOrders();
  }

  let ordersCache = [];

  async function loadOrders() {
    const tbody = document.getElementById('ordersTbody');
    if (!tbody) return;

    const dateStart = document.getElementById('filterDateStart')?.value || '';
    const dateEnd = document.getElementById('filterDateEnd')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';

    const params = new URLSearchParams({ page: ordersPage, pageSize: PAGE_SIZE });
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    if (status) params.set('status', status);

    const data = await api('/orders?' + params.toString());
    if (data && data.list) {
      ordersCache = data.list;
      ordersTotal = data.total || 0;
      renderOrdersTable();
    } else {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">暂无订单数据</div></td></tr>';
    }
  }

  function renderOrdersTable() {
    const tbody = document.getElementById('ordersTbody');
    if (!tbody) return;

    if (!ordersCache.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><p>暂无订单数据</p></div></td></tr>';
      renderOrdersPagination();
      return;
    }

    const statusMap = {
      paid: { label: '已支付', class: 'badge-success' },
      refunded: { label: '已退款', class: 'badge-danger' },
      pending: { label: '待支付', class: 'badge-warning' },
      cancelled: { label: '已取消', class: 'badge-muted' },
    };

    tbody.innerHTML = ordersCache.map(o => {
      const s = statusMap[o.status] || { label: o.status, class: 'badge-muted' };
      return `<tr>
        <td title="${o.orderNo}">${o.orderNo ? o.orderNo.substring(0, 20) : '--'}</td>
        <td>${o.time || '--'}</td>
        <td>${o.account || '--'}</td>
        <td>¥${toYuan(o.amount)}</td>
        <td>¥${toYuan(o.venueIncome)}</td>
        <td>${o.matchId || '--'}</td>
        <td>${o.deviceSN || '--'}</td>
        <td><span class="badge ${s.class}">${s.label}</span></td>
      </tr>`;
    }).join('');

    renderOrdersPagination();
  }

  function renderOrdersPagination() {
    const el = document.getElementById('ordersPagination');
    if (!el) return;

    const totalPages = Math.max(1, Math.ceil(ordersTotal / PAGE_SIZE));
    if (totalPages <= 1) {
      el.innerHTML = `<span>共 ${ordersTotal} 条</span>`;
      return;
    }

    let buttons = '';
    buttons += `<button ${ordersPage <= 1 ? 'disabled' : ''} onclick="window._pnApp.goOrdersPage(${ordersPage - 1})">上一页</button>`;

    let startP = Math.max(1, ordersPage - 2);
    let endP = Math.min(totalPages, startP + 4);
    startP = Math.max(1, endP - 4);

    for (let i = startP; i <= endP; i++) {
      buttons += `<button class="${i === ordersPage ? 'active' : ''}" onclick="window._pnApp.goOrdersPage(${i})">${i}</button>`;
    }

    buttons += `<button ${ordersPage >= totalPages ? 'disabled' : ''} onclick="window._pnApp.goOrdersPage(${ordersPage + 1})">下一页</button>`;

    el.innerHTML = `<span>共 ${ordersTotal} 条，第 ${ordersPage}/${totalPages} 页</span><div class="pagination-buttons">${buttons}</div>`;
  }

  function goOrdersPage(page) {
    ordersPage = page;
    loadOrders();
  }

  function exportOrdersCSV() {
    if (!ordersCache.length) {
      showToast('暂无数据可导出', 'error');
      return;
    }

    let csv = '\uFEFF订单号,时间,付费账号,金额(元),70%分成(元),赛事编号,设备SN,状态\n';
    const statusLabel = { paid: '已支付', refunded: '已退款', pending: '待支付', cancelled: '已取消' };

    ordersCache.forEach(o => {
      csv += `${o.orderNo},${o.time},${o.account},${toYuan(o.amount)},${toYuan(o.venueIncome || o.amount * 0.7)},${o.matchId || ''},${o.deviceSN || ''},${statusLabel[o.status] || o.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV 导出成功', 'success');
  }

  // ============================================
  // Devices
  // ============================================
  let devicesList = [];

  async function renderDevices(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>设备列表</span>
          <button class="btn btn-gold btn-sm" id="bindDeviceBtn">+ 绑定新设备</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>设备SN</th>
                <th>桌号</th>
                <th>状态</th>
                <th>绑定时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="devicesTbody">
              <tr><td colspan="5"><div class="loading">加载中</div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('bindDeviceBtn')?.addEventListener('click', showBindDeviceModal);

    const data = await api('/devices');
    if (data && data.list) {
      devicesList = data.list;
      renderDevicesTable();
    } else {
      document.getElementById('devicesTbody').innerHTML =
        '<tr><td colspan="5"><div class="empty-state"><p>暂无绑定设备</p></div></td></tr>';
    }
  }

  function renderDevicesTable() {
    const tbody = document.getElementById('devicesTbody');
    if (!tbody) return;

    if (!devicesList.length) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>暂无绑定设备</p></div></td></tr>';
      return;
    }

    const statusMap = {
      idle: { label: '空闲', class: 'badge-info' },
      waiting: { label: '等待中', class: 'badge-warning' },
      playing: { label: '对局中', class: 'badge-success' },
      finished: { label: '已结束', class: 'badge-muted' },
      online: { label: '在线', class: 'badge-success' },
      offline: { label: '离线', class: 'badge-muted' },
    };

    tbody.innerHTML = devicesList.map(d => {
      const s = statusMap[d.status] || { label: d.status || '未知', class: 'badge-muted' };
      return `<tr>
        <td><code>${d.sn}</code></td>
        <td>${d.tableNo || '--'}</td>
        <td><span class="badge ${s.class}">${s.label}</span></td>
        <td>${d.bindTime || '--'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="window._pnApp.unbindDevice('${d.sn}')">解绑</button></td>
      </tr>`;
    }).join('');
  }

  function showBindDeviceModal() {
    openModal('绑定新设备',
      `<div class="form-group">
        <label>设备 SN</label>
        <input type="text" id="bindSN" placeholder="请输入设备序列号">
      </div>
      <div class="form-group">
        <label>桌号标签</label>
        <input type="text" id="bindTableNo" placeholder="如：吧台1号 / A1">
      </div>`,
      `<button class="btn btn-outline btn-sm" onclick="window._pnApp.closeModal()">取消</button>
       <button class="btn btn-gold btn-sm" onclick="window._pnApp.confirmBindDevice()">确认绑定</button>`
    );
  }

  async function confirmBindDevice() {
    const sn = document.getElementById('bindSN')?.value.trim();
    const tableLabel = document.getElementById('bindTableNo')?.value.trim();

    if (!sn) {
      showToast('请输入设备序列号', 'error');
      return;
    }

    const data = await api('/devices/bind', {
      method: 'POST',
      body: JSON.stringify({ deviceSn: sn, tableLabel: tableLabel || null })
    });

    if (data && data.success) {
      closeModal();
      showToast('设备绑定成功', 'success');
      // 重新加载设备列表
      const newData = await api('/devices');
      if (newData && newData.list) {
        devicesList = newData.list;
        renderDevicesTable();
      }
    } else {
      showToast(data?.error || '绑定失败', 'error');
    }
  }

  async function unbindDevice(sn) {
    if (!confirm(`确定解绑设备 ${sn} 吗？`)) return;

    const data = await api('/devices/unbind', {
      method: 'POST',
      body: JSON.stringify({ sn })
    });

    if (data && data.success) {
      showToast('设备已解绑', 'success');
      devicesList = devicesList.filter(d => d.sn !== sn);
      renderDevicesTable();
    } else {
      showToast(data?.error || '解绑失败', 'error');
    }
  }

  // ============================================
  // Settlements
  // ============================================
  let settlementsList = [];

  async function renderSettlements(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>结算周期</span>
          <button class="btn btn-gold btn-sm" id="withdrawBtn">申请提现</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>结算周期</th>
                <th>订单数</th>
                <th>总额(元)</th>
                <th>70%分成(元)</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="settlementsTbody">
              <tr><td colspan="6"><div class="loading">加载中</div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('withdrawBtn')?.addEventListener('click', showWithdrawModal);

    const data = await api('/settlements');
    if (data && data.list) {
      settlementsList = data.list;
      renderSettlementsTable();
    } else {
      document.getElementById('settlementsTbody').innerHTML =
        '<tr><td colspan="6"><div class="empty-state"><p>暂无结算记录</p></div></td></tr>';
    }
  }

  function renderSettlementsTable() {
    const tbody = document.getElementById('settlementsTbody');
    if (!tbody) return;

    if (!settlementsList.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>暂无结算记录</p></div></td></tr>';
      return;
    }

    const statusMap = {
      pending: { label: '待结算', class: 'badge-warning' },
      processing: { label: '处理中', class: 'badge-info' },
      confirmed: { label: '已确认', class: 'badge-info' },
      paid: { label: '已结算', class: 'badge-success' },
      completed: { label: '已完成', class: 'badge-success' },
      failed: { label: '失败', class: 'badge-danger' },
    };

    tbody.innerHTML = settlementsList.map(s => {
      const st = statusMap[s.status] || { label: s.status, class: 'badge-muted' };
      return `<tr>
        <td>${s.period}</td>
        <td>${s.orderCount}</td>
        <td>¥${toYuan(s.totalAmount)}</td>
        <td>¥${toYuan(s.merchantShare)}</td>
        <td><span class="badge ${st.class}">${st.label}</span></td>
        <td>${s.voucherUrl ? `<button class="btn btn-outline btn-sm" onclick="window._pnApp.viewVoucher('${s.voucherUrl}')">查看凭证</button>` : s.status === 'pending' ? `<button class="btn btn-gold btn-sm" onclick="window._pnApp.withdrawSettlement('${s.id}')">提现</button>` : '--'}</td>
      </tr>`;
    }).join('');
  }

  function showWithdrawModal() {
    const pending = settlementsList.filter(s => s.status === 'pending');
    const total = pending.reduce((sum, s) => sum + s.merchantShare, 0);

    if (pending.length === 0) {
      showToast('没有待结算的周期', 'error');
      return;
    }

    openModal('申请提现',
      `<div style="margin-bottom: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">可提现金额 (${pending.length} 个待结算周期)</div>
        <div style="font-size: 28px; font-weight: 700; color: var(--gold);">¥${toYuan(total)}</div>
      </div>
      <div class="form-group">
        <label>提现至（银行卡/支付宝）</label>
        <input type="text" id="withdrawTarget" placeholder="请输入收款账号">
      </div>
      <div class="form-group">
        <label>备注</label>
        <input type="text" id="withdrawNote" placeholder="选填">
      </div>`,
      `<button class="btn btn-outline btn-sm" onclick="window._pnApp.closeModal()">取消</button>
       <button class="btn btn-gold btn-sm" id="confirmWithdrawBtn">提交申请</button>`
    );

    document.getElementById('confirmWithdrawBtn')?.addEventListener('click', async () => {
      const target = document.getElementById('withdrawTarget')?.value.trim();
      if (!target) {
        showToast('请输入收款账号', 'error');
        return;
      }

      const note = document.getElementById('withdrawNote')?.value || '';

      // 逐个提交待结算周期的提现申请
      let success = 0;
      for (const s of pending) {
        const data = await api(`/settlements/${s.id}/withdraw`, {
          method: 'POST',
          body: JSON.stringify({ target, note })
        });
        if (data && data.success) success++;
      }

      closeModal();
      if (success > 0) {
        showToast(`已提交 ${success} 个周期的提现申请`, 'success');
        // 重新加载
        const newData = await api('/settlements');
        if (newData && newData.list) {
          settlementsList = newData.list;
          renderSettlementsTable();
        }
      } else {
        showToast('提现申请失败', 'error');
      }
    });
  }

  async function withdrawSettlement(id) {
    const data = await api(`/settlements/${id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ target: '商户银行卡', note: '' })
    });
    if (data && data.success) {
      showToast('提现申请已提交', 'success');
      const newData = await api('/settlements');
      if (newData && newData.list) {
        settlementsList = newData.list;
        renderSettlementsTable();
      }
    } else {
      showToast(data?.error || '提现失败', 'error');
    }
  }

  function viewVoucher(url) {
    openModal('转账凭证',
      `<div style="text-align:center;"><img src="${url}" style="max-width:100%;border-radius:8px;" alt="凭证"></div>`,
      `<button class="btn btn-outline btn-sm" onclick="window._pnApp.closeModal()">关闭</button>`
    );
  }

  // ============================================
  // Refunds
  // ============================================
  let refundsData = [];

  async function renderRefunds(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>退款管理</span>
          <button class="btn btn-gold btn-sm" id="refundBtn">发起退款</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>订单号</th>
                <th>金额(元)</th>
                <th>原因</th>
                <th>发起人</th>
                <th>退款时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody id="refundsTbody">
              <tr><td colspan="6"><div class="empty-state"><p>退款数据来源于订单列表中的已退款订单</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('refundBtn')?.addEventListener('click', showRefundModal);

    // 从订单列表加载已退款的订单
    const data = await api('/orders?status=refunded&pageSize=50');
    if (data && data.list) {
      refundsData = data.list;
      renderRefundsTable();
    }
  }

  function renderRefundsTable() {
    const tbody = document.getElementById('refundsTbody');
    if (!tbody) return;

    if (!refundsData.length) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>暂无退款记录</p></div></td></tr>';
      return;
    }

    tbody.innerHTML = refundsData.map(r => `<tr>
      <td>${r.orderNo || '--'}</td>
      <td>¥${toYuan(r.amount)}</td>
      <td>${r.refundReason || '--'}</td>
      <td>${r.refundInitiatedBy === 'admin' ? '平台' : r.refundInitiatedBy === 'merchant' ? '商户' : r.refundInitiatedBy || '--'}</td>
      <td>${r.time || '--'}</td>
      <td><span class="badge badge-danger">已退款</span></td>
    </tr>`).join('');
  }

  function showRefundModal() {
    openModal('发起退款',
      `<div class="form-group">
        <label>订单号 (UUID)</label>
        <input type="text" id="refundOrderNo" placeholder="请输入订单 ID (UUID)">
      </div>
      <div class="form-group">
        <label>退款原因</label>
        <input type="text" id="refundReason" placeholder="请输入退款原因">
      </div>`,
      `<button class="btn btn-outline btn-sm" onclick="window._pnApp.closeModal()">取消</button>
       <button class="btn btn-gold btn-sm" id="confirmRefundBtn">提交退款</button>`
    );

    document.getElementById('confirmRefundBtn')?.addEventListener('click', async () => {
      const orderId = document.getElementById('refundOrderNo')?.value.trim();
      const reason = document.getElementById('refundReason')?.value.trim();

      if (!orderId || !reason) {
        showToast('请填写完整信息', 'error');
        return;
      }

      const data = await api('/refund', {
        method: 'POST',
        body: JSON.stringify({ orderId, reason })
      });

      if (data && data.success) {
        closeModal();
        showToast('退款成功', 'success');
        // 重新加载退款列表
        const newData = await api('/orders?status=refunded&pageSize=50');
        if (newData && newData.list) {
          refundsData = newData.list;
          renderRefundsTable();
        }
      } else {
        showToast(data?.error || '退款失败', 'error');
      }
    });
  }

  // ---- Utils ----
  function formatYuan(cents) {
    return Number(cents || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function toYuan(cents) {
    return (cents / 100).toFixed(2);
  }

  function formatMoney(n) {
    return n;
  }

  // ---- Expose for inline onclick ----
  window._pnApp = {
    goOrdersPage,
    closeModal,
    confirmBindDevice,
    unbindDevice,
    withdrawSettlement,
    viewVoucher,
  };

  // ---- Start ----
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
