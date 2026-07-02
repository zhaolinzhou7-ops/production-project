"use strict";

// 当前加载的排产请求数据 (机台 + 订单)
let currentData = null;

const COLORS = [
  "#4f8cff", "#36d399", "#fbbd23", "#f87272", "#a78bfa",
  "#22d3ee", "#fb923c", "#e879f9", "#84cc16", "#f472b6",
];

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
    weights: {
      makespan: parseFloat(document.getElementById("w-makespan").value),
      tardiness: parseFloat(document.getElementById("w-tardiness").value),
      changeover: parseFloat(document.getElementById("w-changeover").value),
      idle: parseFloat(document.getElementById("w-idle").value),
    },
    time_limit_seconds: parseFloat(document.getElementById("time-limit").value),
  };

  try {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    render(result);
  } catch (e) {
    alert("排产失败: " + e);
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
  const machines = currentData.machines;
  const ops = result.operations;
  const makespan = result.makespan;

  // 订单 -> 颜色
  const orderColor = {};
  currentData.orders.forEach((o, i) => {
    orderColor[o.id] = COLORS[i % COLORS.length];
  });

  const rowH = 44, padTop = 30, padLeft = 90, padRight = 30, padBottom = 30;
  const width = 1000;
  const plotW = width - padLeft - padRight;
  const height = padTop + machines.length * rowH + padBottom;
  const scale = plotW / Math.max(makespan, 1);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  // 时间轴
  const ticks = 10;
  for (let i = 0; i <= ticks; i++) {
    const t = Math.round((makespan / ticks) * i);
    const x = padLeft + t * scale;
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", x); line.setAttribute("x2", x);
    line.setAttribute("y1", padTop); line.setAttribute("y2", height - padBottom);
    line.setAttribute("class", "axis-line");
    svg.appendChild(line);
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", x); lbl.setAttribute("y", padTop - 8);
    lbl.setAttribute("text-anchor", "middle");
    lbl.setAttribute("class", "axis-label");
    lbl.textContent = t;
    svg.appendChild(lbl);
  }

  // 机台行标签
  const rowIndex = {};
  machines.forEach((m, i) => {
    rowIndex[m.id] = i;
    const y = padTop + i * rowH + rowH / 2;
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", padLeft - 10); lbl.setAttribute("y", y + 4);
    lbl.setAttribute("text-anchor", "end");
    lbl.textContent = m.name;
    svg.appendChild(lbl);
  });

  // 工序条
  ops.forEach((op) => {
    const row = rowIndex[op.machine_id];
    const y = padTop + row * rowH + 8;
    const barH = rowH - 18;

    // 换型段 (灰色)
    if (op.setup > 0) {
      const sx = padLeft + (op.start - op.setup) * scale;
      const setupRect = document.createElementNS(svgNS, "rect");
      setupRect.setAttribute("x", sx);
      setupRect.setAttribute("y", y);
      setupRect.setAttribute("width", Math.max(op.setup * scale, 1));
      setupRect.setAttribute("height", barH);
      setupRect.setAttribute("class", "setup-bar gantt-bar");
      setupRect.setAttribute("rx", 2);
      const st = document.createElementNS(svgNS, "title");
      st.textContent = `换型 ${op.setup}min (机台 ${op.machine_id})`;
      setupRect.appendChild(st);
      svg.appendChild(setupRect);
    }

    // 加工段
    const x = padLeft + op.start * scale;
    const w = Math.max(op.duration * scale, 1);
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", barH);
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", orderColor[op.order_id]);
    rect.setAttribute("class", "gantt-bar");
    const title = document.createElementNS(svgNS, "title");
    title.textContent =
      `${op.order_name} / ${op.operation_name}\n` +
      `机台 ${op.machine_id} · ${op.start}~${op.end} (${op.duration}min)` +
      (op.setup ? `\n换型 ${op.setup}min` : "");
    rect.appendChild(title);
    svg.appendChild(rect);

    if (w > 28) {
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", x + 4);
      t.setAttribute("y", y + barH / 2 + 4);
      t.textContent = op.order_id;
      svg.appendChild(t);
    }
  });

  const gantt = document.getElementById("gantt");
  gantt.innerHTML = "";
  gantt.appendChild(svg);

  // 图例
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  currentData.orders.forEach((o) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<span class="swatch" style="background:${orderColor[o.id]}"></span>${o.id} ${o.name}`;
    legend.appendChild(item);
  });
  const setupItem = document.createElement("div");
  setupItem.className = "item";
  setupItem.innerHTML = `<span class="swatch" style="background:#55617a"></span>换型时间`;
  legend.appendChild(setupItem);
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
