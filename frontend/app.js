"use strict";

// 当前加载的排产请求数据 (机台 + 订单)
let currentData = null;

document.getElementById("btn-sample").addEventListener("click", loadSample);
document.getElementById("btn-load-db").addEventListener("click", loadFromDb);
document.getElementById("btn-run").addEventListener("click", runSchedule);

function setDataStatus(text) {
  document.getElementById("data-status").textContent = text;
}

async function loadSample() {
  currentData = await apiGet("/api/sample");
  setDataStatus(
    `已加载样例: ${currentData.machines.length} 台机台 / ${currentData.orders.length} 个订单`
  );
}

async function loadFromDb() {
  const limit = document.getElementById("time-limit").value;
  try {
    currentData = await apiGet(
      `/api/data/schedule-request?time_limit_seconds=${encodeURIComponent(limit)}`
    );
    setDataStatus(
      `已从数据库加载: ${currentData.machines.length} 台机台 / ${currentData.orders.length} 个订单`
    );
  } catch (e) {
    setDataStatus("");
    alert("加载失败: " + e.message);
    throw e;
  }
}

async function runSchedule() {
  if (!currentData) {
    // 优先用数据库数据, 库空则退回样例
    try {
      await loadFromDb();
    } catch (_) {
      await loadSample();
    }
  }
  const btn = document.getElementById("btn-run");
  btn.disabled = true;
  btn.textContent = "排产中…";

  const payload = {
    machines: currentData.machines,
    orders: currentData.orders,
    resources: currentData.resources || [],
    schedule_start: currentData.schedule_start || null,
    weights: {
      makespan: parseFloat(document.getElementById("w-makespan").value),
      tardiness: parseFloat(document.getElementById("w-tardiness").value),
      changeover: parseFloat(document.getElementById("w-changeover").value),
      idle: parseFloat(document.getElementById("w-idle").value),
    },
    time_limit_seconds: parseFloat(document.getElementById("time-limit").value),
  };

  try {
    const result = await apiSend("/api/schedule", "POST", payload);
    render(result);
  } catch (e) {
    alert("排产失败: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "开始排产";
  }
}

function render(result) {
  // KPI
  document.getElementById("kpis").hidden = false;
  document.getElementById("kpi-status").textContent = result.status;
  document.getElementById("kpi-makespan").textContent = result.makespan;
  document.getElementById("kpi-tardiness").textContent = result.total_tardiness;
  document.getElementById("kpi-changeover").textContent = result.total_changeover;
  document.getElementById("kpi-time").textContent = result.solve_time_seconds;

  if (result.status === "INFEASIBLE" || result.operations.length === 0) {
    document.getElementById("gantt-panel").hidden = true;
    alert("无可行排产方案 (状态: " + result.status + ")");
    return;
  }

  renderGantt(result);
  renderOrders(result);
  renderUtil(result);
}

function renderGantt(result) {
  document.getElementById("gantt-panel").hidden = false;
  const lanes = currentData.machines.map((m) => ({
    id: m.id, name: m.name, windows: m.downtime_windows || [],
  }));
  if (result.operations.some((op) => op.machine_id === OUTSOURCE_ID)) {
    lanes.push({ id: OUTSOURCE_ID, name: "外协", windows: [] });
  }
  drawGantt({
    container: document.getElementById("gantt"),
    legendContainer: document.getElementById("legend"),
    lanes,
    ops: result.operations,
    makespan: result.makespan,
    scheduleStart: currentData.schedule_start,
    orders: currentData.orders,
  });
}

function renderOrders(result) {
  document.getElementById("orders-panel").hidden = false;
  const tbody = document.querySelector("#orders-table tbody");
  tbody.innerHTML = "";
  result.orders.forEach((o) => {
    const tr = document.createElement("tr");
    const tardy = o.tardiness > 0;
    tr.innerHTML =
      `<td>${o.order_id}</td><td>${o.order_name}</td><td>${o.due_date}</td>` +
      `<td>${o.completion}</td>` +
      `<td class="${tardy ? "tardy" : "ontime"}">${tardy ? "+" + o.tardiness : "准时"}</td>`;
    tbody.appendChild(tr);
  });
}

function renderUtil(result) {
  document.getElementById("util-panel").hidden = false;
  const div = document.getElementById("util");
  div.innerHTML = "";
  result.machine_utilization.forEach((m) => {
    const pct = Math.round(m.utilization * 100);
    const row = document.createElement("div");
    row.className = "util-row";
    row.innerHTML =
      `<span class="util-name">${m.machine_name}</span>` +
      `<span class="util-bar"><span class="util-fill" style="width:${pct}%"></span></span>` +
      `<span class="util-pct">${pct}%</span>`;
    div.appendChild(row);
  });
}
