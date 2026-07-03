"use strict";

/* 报表页: 方案 KPI 概览 + 交期预警看板 + Excel 导出。 */

document.getElementById("btn-rp-load").addEventListener("click", loadReports);
document.querySelector('.tabs [data-tab="reports"]').addEventListener("click", refreshReportScenarios);

async function refreshReportScenarios() {
  const scenarios = await apiGet("/api/scenarios");
  const sel = document.getElementById("rp-scenario");
  const current = sel.value;
  sel.innerHTML = '<option value="">— 选择方案 —</option>';
  scenarios.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `#${s.id} ${s.name} (${s.kind === "simulation" ? "模拟" : "基准"})`;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
  else if (scenarios.length) sel.value = scenarios[0].id;
}

async function loadReports() {
  const sid = document.getElementById("rp-scenario").value;
  if (!sid) { alert("请先选择方案 (在「方案」页求解并保存)"); return; }

  let kpi, risk;
  try {
    [kpi, risk] = await Promise.all([
      apiGet(`/api/reports/kpi?scenario_id=${sid}`),
      apiGet(`/api/reports/delivery-risk?scenario_id=${sid}`),
    ]);
  } catch (e) {
    alert("加载报表失败: " + e.message);
    return;
  }

  const exportLink = document.getElementById("rp-export");
  exportLink.href = `/api/export/scenario/${sid}.xlsx`;
  exportLink.hidden = false;

  // ---- KPI 卡片 ----
  document.getElementById("rp-kpi-panel").hidden = false;
  const pct = Math.round(kpi.on_time_rate * 100);
  document.getElementById("rp-kpis").innerHTML = [
    ["准交率", `${pct}%`, pct >= 95 ? "ontime" : pct >= 80 ? "" : "tardy"],
    ["订单数 (拖期)", `${kpi.order_count} (${kpi.tardy_count})`, ""],
    ["总完工(min)", String(kpi.makespan), ""],
    ["加权拖期", String(kpi.total_tardiness), kpi.total_tardiness > 0 ? "tardy" : "ontime"],
    ["换型总量(min)", String(kpi.total_changeover), ""],
  ].map(([k, v, cls]) =>
    `<div class="kpi"><span class="kpi-label">${k}</span>` +
    `<span class="kpi-val ${cls}">${v}</span></div>`
  ).join("");

  const util = document.getElementById("rp-util");
  util.innerHTML = "";
  kpi.machines.forEach((m) => {
    const p = Math.round(m.utilization * 100);
    const row = document.createElement("div");
    row.className = "util-row";
    row.innerHTML =
      `<span class="util-name">${m.machine_id}</span>` +
      `<span class="util-bar"><span class="util-fill" style="width:${p}%"></span></span>` +
      `<span class="util-pct">${p}%</span>`;
    util.appendChild(row);
  });

  // ---- 交期预警看板 ----
  document.getElementById("rp-risk-panel").hidden = false;
  document.getElementById("rp-risk-summary").textContent =
    `红 ${risk.red} / 黄 ${risk.yellow} / 绿 ${risk.green}`;
  const tbody = document.querySelector("#rp-risk-table tbody");
  tbody.innerHTML = "";
  const badge = {
    red: '<span class="risk-badge risk-red">拖期</span>',
    yellow: '<span class="risk-badge risk-yellow">紧张</span>',
    green: '<span class="risk-badge risk-green">安全</span>',
  };
  risk.orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${badge[o.risk]}</td><td>${o.order_id}</td><td>${rpEsc(o.order_name)}</td>` +
      `<td>${rpFmt(o.due)}</td><td>${rpFmt(o.completion)}</td>` +
      `<td class="${o.slack_min < 0 ? "tardy" : ""}">${o.slack_min}min</td>` +
      `<td class="${o.tardiness_min > 0 ? "tardy" : "ontime"}">` +
      `${o.tardiness_min > 0 ? "+" + o.tardiness_min + "min" : "-"}</td>`;
    tbody.appendChild(tr);
  });
}

function rpFmt(iso) {
  return iso ? iso.replace("T", " ").slice(0, 16) : "-";
}

function rpEsc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
