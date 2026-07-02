"use strict";

/* 基础数据页: 机台/订单维护 + Excel 导入。 */

let editingMachineId = null; // null = 新增
let editingOrderId = null;
let ordersCache = [];

document.getElementById("btn-import").addEventListener("click", importExcel);
document.getElementById("btn-add-machine").addEventListener("click", () => openMachineDialog(null));
document.getElementById("btn-add-order").addEventListener("click", () => openOrderDialog(null));
document.getElementById("btn-add-calendar").addEventListener("click", () => openCalendarDialog(null));
document.getElementById("btn-add-resource").addEventListener("click", () => openResourceDialog(null));
document.getElementById("dlg-machine-save").addEventListener("click", saveMachine);
document.getElementById("dlg-order-save").addEventListener("click", saveOrder);
document.getElementById("dlg-calendar-save").addEventListener("click", saveCalendar);
document.getElementById("dlg-resource-save").addEventListener("click", saveResource);
document.querySelector('.tabs [data-tab="data"]').addEventListener("click", refreshDataTab);

async function refreshDataTab() {
  await Promise.all([
    renderMachines(), renderOrdersData(), renderCalendars(), renderResources(),
  ]);
}

// ---- Excel 导入 -------------------------------------------------------------

async function importExcel() {
  const fileInput = document.getElementById("import-file");
  const out = document.getElementById("import-result");
  if (!fileInput.files.length) {
    out.textContent = "请先选择 .xlsx 文件";
    return;
  }
  const mode = document.getElementById("import-mode").value;
  out.textContent = "导入中…";
  try {
    const report = await apiUpload(`/api/import/excel?mode=${mode}`, fileInput.files[0]);
    if (report.ok) {
      out.innerHTML =
        `<span class="ontime">导入成功</span>: 机台 ${report.machines} / ` +
        `订单 ${report.orders} / 工序 ${report.operations} (${report.mode})`;
      await refreshDataTab();
    } else {
      out.innerHTML =
        `<span class="tardy">导入失败, 未写入任何数据:</span><br/>` +
        report.errors
          .map((e) => `「${esc(e.sheet)}」第 ${e.row} 行: ${esc(e.message)}`)
          .join("<br/>");
    }
  } catch (e) {
    out.textContent = "导入失败: " + e.message;
  }
}

// ---- 机台 -------------------------------------------------------------------

async function renderMachines() {
  const machines = await apiGet("/api/machines");
  const tbody = document.querySelector("#machines-table tbody");
  tbody.innerHTML = "";
  machines.forEach((m) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${esc(m.id)}</td><td>${esc(m.name)}</td>` +
      `<td>${m.active ? "是" : '<span class="tardy">否</span>'}</td>` +
      `<td class="mono">${esc(setupSummary(m.setup_times))}</td><td></td>`;
    const cell = tr.lastElementChild;
    cell.appendChild(actionButton("编辑", () => openMachineDialog(m)));
    cell.appendChild(actionButton("删除", () => deleteMachine(m.id)));
    tbody.appendChild(tr);
  });
}

function setupSummary(matrix) {
  const parts = [];
  for (const [from, tos] of Object.entries(matrix || {})) {
    for (const [to, min] of Object.entries(tos)) parts.push(`${from}→${to}:${min}`);
  }
  return parts.join("  ") || "-";
}

async function openMachineDialog(machine) {
  editingMachineId = machine ? machine.id : null;
  document.getElementById("dlg-machine-title").textContent = machine ? "编辑机台" : "新增机台";
  document.getElementById("m-id").value = machine ? machine.id : "";
  document.getElementById("m-id").disabled = !!machine;
  document.getElementById("m-name").value = machine ? machine.name : "";
  document.getElementById("m-active").checked = machine ? machine.active : true;
  document.getElementById("m-calendar").value = machine && machine.calendar_id ? machine.calendar_id : "";
  const lines = [];
  for (const [from, tos] of Object.entries(machine ? machine.setup_times : {})) {
    for (const [to, min] of Object.entries(tos)) lines.push(`${from},${to},${min}`);
  }
  document.getElementById("m-setup").value = lines.join("\n");

  let dtLines = [];
  if (machine) {
    const downtimes = await apiGet(`/api/machines/${encodeURIComponent(machine.id)}/downtimes`);
    dtLines = downtimes.map((d) => `${fmtDt(d.start)},${fmtDt(d.end)},${d.reason || ""}`);
  }
  document.getElementById("m-downtime").value = dtLines.join("\n");
  document.getElementById("dlg-machine").showModal();
}

async function saveMachine(ev) {
  ev.preventDefault();
  const id = document.getElementById("m-id").value.trim();
  const name = document.getElementById("m-name").value.trim();
  if (!id || !name) { alert("ID 与名称不能为空"); return; }

  const setup = {};
  const text = document.getElementById("m-setup").value.trim();
  if (text) {
    for (const line of text.split("\n")) {
      const [from, to, min] = line.split(",").map((s) => s && s.trim());
      const minutes = parseInt(min, 10);
      if (!from || !to || Number.isNaN(minutes) || minutes < 0) {
        alert(`换型矩阵行格式错误: ${line}`);
        return;
      }
      (setup[from] = setup[from] || {})[to] = minutes;
    }
  }

  const downtimes = [];
  const dtText = document.getElementById("m-downtime").value.trim();
  if (dtText) {
    for (const line of dtText.split("\n")) {
      const [s, e, reason] = line.split(",").map((v) => v && v.trim());
      if (!s || !e) { alert(`停机行格式错误: ${line}`); return; }
      downtimes.push({ start: s.replace(" ", "T"), end: e.replace(" ", "T"), reason: reason || "" });
    }
  }

  const calId = document.getElementById("m-calendar").value.trim();
  const body = {
    id, name,
    active: document.getElementById("m-active").checked,
    calendar_id: calId || null,
    setup_times: setup,
  };
  try {
    if (editingMachineId) await apiSend(`/api/machines/${encodeURIComponent(id)}`, "PUT", body);
    else await apiSend("/api/machines", "POST", body);
    await apiSend(`/api/machines/${encodeURIComponent(id)}/downtimes`, "PUT", downtimes);
    document.getElementById("dlg-machine").close();
    await renderMachines();
  } catch (e) {
    alert("保存失败: " + e.message);
  }
}

// ---- 日历 -------------------------------------------------------------------

let calendarsCache = [];
let editingCalendarId = null;

async function renderCalendars() {
  calendarsCache = await apiGet("/api/calendars");
  const tbody = document.querySelector("#calendars-table tbody");
  tbody.innerHTML = "";
  calendarsCache.forEach((c) => {
    const rules = c.rules.map((r) => `周${r.weekday + 1} ${r.start}-${r.end}`).join("  ");
    const exc = c.exceptions
      .map((e) => `${e.date}${e.available ? ` 班 ${e.start || ""}-${e.end || ""}` : " 休"}`)
      .join("  ");
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${esc(c.id)}</td><td>${esc(c.name)}</td>` +
      `<td class="mono">${esc(rules) || "-"}</td><td class="mono">${esc(exc) || "-"}</td><td></td>`;
    const cell = tr.lastElementChild;
    cell.appendChild(actionButton("编辑", () => openCalendarDialog(c)));
    cell.appendChild(actionButton("删除", () => deleteCalendar(c.id)));
    tbody.appendChild(tr);
  });
}

function openCalendarDialog(cal) {
  editingCalendarId = cal ? cal.id : null;
  document.getElementById("dlg-calendar-title").textContent = cal ? "编辑日历" : "新增日历";
  document.getElementById("c-id").value = cal ? cal.id : "";
  document.getElementById("c-id").disabled = !!cal;
  document.getElementById("c-name").value = cal ? cal.name : "";
  document.getElementById("c-rules").value = (cal ? cal.rules : [])
    .map((r) => `${r.weekday + 1},${r.start},${r.end}`).join("\n");
  document.getElementById("c-exceptions").value = (cal ? cal.exceptions : [])
    .map((e) => e.available ? `${e.date},班,${e.start || ""},${e.end || ""}` : `${e.date},休`)
    .join("\n");
  document.getElementById("dlg-calendar").showModal();
}

async function saveCalendar(ev) {
  ev.preventDefault();
  const id = document.getElementById("c-id").value.trim();
  if (!id) { alert("日历 ID 不能为空"); return; }

  const rules = [];
  const rulesText = document.getElementById("c-rules").value.trim();
  if (rulesText) {
    for (const line of rulesText.split("\n")) {
      const [wd, s, e] = line.split(",").map((v) => v && v.trim());
      const weekday = parseInt(wd, 10);
      if (!(weekday >= 1 && weekday <= 7) || !s || !e) {
        alert(`周规则行格式错误: ${line}`);
        return;
      }
      rules.push({ weekday: weekday - 1, start: s, end: e });
    }
  }
  const exceptions = [];
  const excText = document.getElementById("c-exceptions").value.trim();
  if (excText) {
    for (const line of excText.split("\n")) {
      const parts = line.split(",").map((v) => v && v.trim());
      if (parts.length < 2 || !parts[0]) { alert(`例外行格式错误: ${line}`); return; }
      if (parts[1] === "休") {
        exceptions.push({ date: parts[0], available: false });
      } else {
        exceptions.push({
          date: parts[0], available: true,
          start: parts[2] || null, end: parts[3] || null,
        });
      }
    }
  }

  try {
    await apiSend(`/api/calendars/${encodeURIComponent(id)}`, "PUT", {
      id, name: document.getElementById("c-name").value.trim(), rules, exceptions,
    });
    document.getElementById("dlg-calendar").close();
    await renderCalendars();
  } catch (e) {
    alert("保存失败: " + e.message);
  }
}

async function deleteCalendar(id) {
  if (!confirm(`确定删除日历 ${id} ?`)) return;
  try {
    await apiSend(`/api/calendars/${encodeURIComponent(id)}`, "DELETE");
    await renderCalendars();
  } catch (e) {
    alert("删除失败: " + e.message);
  }
}

// ---- 资源 -------------------------------------------------------------------

let editingResourceId = null;

async function renderResources() {
  const resources = await apiGet("/api/resources");
  const tbody = document.querySelector("#resources-table tbody");
  tbody.innerHTML = "";
  resources.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${r.capacity}</td><td></td>`;
    const cell = tr.lastElementChild;
    cell.appendChild(actionButton("编辑", () => openResourceDialog(r)));
    cell.appendChild(actionButton("删除", () => deleteResource(r.id)));
    tbody.appendChild(tr);
  });
}

function openResourceDialog(res) {
  editingResourceId = res ? res.id : null;
  document.getElementById("dlg-resource-title").textContent = res ? "编辑资源" : "新增资源";
  document.getElementById("r-id").value = res ? res.id : "";
  document.getElementById("r-id").disabled = !!res;
  document.getElementById("r-name").value = res ? res.name : "";
  document.getElementById("r-capacity").value = res ? res.capacity : 1;
  document.getElementById("dlg-resource").showModal();
}

async function saveResource(ev) {
  ev.preventDefault();
  const id = document.getElementById("r-id").value.trim();
  const capacity = parseInt(document.getElementById("r-capacity").value, 10);
  if (!id || !(capacity >= 1)) { alert("请填写资源 ID 与数量"); return; }
  try {
    await apiSend(`/api/resources/${encodeURIComponent(id)}`, "PUT", {
      id, name: document.getElementById("r-name").value.trim(), capacity,
    });
    document.getElementById("dlg-resource").close();
    await renderResources();
  } catch (e) {
    alert("保存失败: " + e.message);
  }
}

async function deleteResource(id) {
  if (!confirm(`确定删除资源 ${id} ?`)) return;
  try {
    await apiSend(`/api/resources/${encodeURIComponent(id)}`, "DELETE");
    await renderResources();
  } catch (e) {
    alert("删除失败: " + e.message);
  }
}

async function deleteMachine(id) {
  if (!confirm(`确定删除机台 ${id} ?`)) return;
  try {
    await apiSend(`/api/machines/${encodeURIComponent(id)}`, "DELETE");
    await renderMachines();
  } catch (e) {
    alert("删除失败: " + e.message);
  }
}

// ---- 订单 -------------------------------------------------------------------

async function renderOrdersData() {
  ordersCache = await apiGet("/api/orders");
  const tbody = document.querySelector("#orders-data-table tbody");
  tbody.innerHTML = "";
  ordersCache.forEach((o) => {
    const opsText = o.operations
      .map((op) => `${op.seq}.${op.name}${op.is_outsourced ? "[外协]" : ""}(${op.family})`)
      .join(" → ");
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${esc(o.id)}</td><td>${esc(o.name)}</td>` +
      `<td>${fmtDt(o.due_date)}</td><td>${o.priority}</td>` +
      `<td>${statusBadge(o.status)}</td>` +
      `<td class="mono">${esc(opsText)}</td><td></td>`;
    const cell = tr.lastElementChild;
    cell.appendChild(actionButton("编辑", () => openOrderDialog(o)));
    cell.appendChild(actionButton("删除", () => deleteOrder(o.id)));
    tbody.appendChild(tr);
  });
}

function statusBadge(s) {
  if (s === "rush") return '<span class="tardy">急单</span>';
  if (s === "cancelled") return '<span class="muted">已取消</span>';
  return "正常";
}

function openOrderDialog(order) {
  editingOrderId = order ? order.id : null;
  document.getElementById("dlg-order-title").textContent = order ? "编辑订单" : "新增订单";
  document.getElementById("o-id").value = order ? order.id : "";
  document.getElementById("o-id").disabled = !!order;
  document.getElementById("o-name").value = order ? order.name : "";
  document.getElementById("o-due").value = order ? toLocalInput(order.due_date) : "";
  document.getElementById("o-priority").value = order ? order.priority : 1;
  document.getElementById("o-release").value =
    order && order.release_time ? toLocalInput(order.release_time) : "";
  document.getElementById("o-status").value = order ? order.status : "normal";
  const lines = (order ? order.operations : []).map((op) => {
    const body = op.is_outsourced
      ? `外协:${op.outsource_lead_min}`
      : Object.entries(op.machines).map(([m, d]) => `${m}:${d}`).join(",");
    const res = op.resource_id ? `|${op.resource_id}:${op.resource_qty || 1}` : "";
    return `${op.seq}|${op.name}|${op.family}|${body}${res}`;
  });
  document.getElementById("o-ops").value = lines.join("\n");
  document.getElementById("dlg-order").showModal();
}

function parseOpsText(text) {
  const ops = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length !== 4 && parts.length !== 5) {
      throw new Error(`工序行格式错误 (需 4-5 段): ${line}`);
    }
    const seq = parseInt(parts[0], 10);
    if (Number.isNaN(seq) || seq < 0) throw new Error(`工序号无效: ${line}`);

    const op = { seq, name: parts[1], family: parts[2], machines: {} };
    if (parts[3].startsWith("外协:")) {
      const lead = parseInt(parts[3].slice(3), 10);
      if (Number.isNaN(lead) || lead <= 0) throw new Error(`外协周期无效: ${parts[3]}`);
      op.is_outsourced = true;
      op.outsource_lead_min = lead;
    } else {
      for (const pair of parts[3].split(",")) {
        const [mid, dur] = pair.split(":").map((s) => s && s.trim());
        const minutes = parseInt(dur, 10);
        if (!mid || Number.isNaN(minutes) || minutes <= 0) {
          throw new Error(`机台:分钟 格式错误: ${pair}`);
        }
        op.machines[mid] = minutes;
      }
    }
    if (parts.length === 5 && parts[4]) {
      const [rid, qty] = parts[4].split(":").map((s) => s && s.trim());
      if (!rid) throw new Error(`资源段格式错误: ${parts[4]}`);
      op.resource_id = rid;
      op.resource_qty = parseInt(qty, 10) || 1;
    }
    ops.push(op);
  }
  if (!ops.length) throw new Error("至少要有一道工序");
  return ops;
}

async function saveOrder(ev) {
  ev.preventDefault();
  const id = document.getElementById("o-id").value.trim();
  const name = document.getElementById("o-name").value.trim();
  const due = document.getElementById("o-due").value;
  if (!id || !name || !due) { alert("ID/名称/交期不能为空"); return; }

  let operations;
  try {
    operations = parseOpsText(document.getElementById("o-ops").value);
  } catch (e) {
    alert(e.message);
    return;
  }
  const release = document.getElementById("o-release").value;
  const body = {
    id, name,
    due_date: due,
    priority: parseInt(document.getElementById("o-priority").value, 10) || 1,
    release_time: release || null,
    status: document.getElementById("o-status").value,
    operations,
  };
  try {
    if (editingOrderId) await apiSend(`/api/orders/${encodeURIComponent(id)}`, "PUT", body);
    else await apiSend("/api/orders", "POST", body);
    document.getElementById("dlg-order").close();
    await renderOrdersData();
  } catch (e) {
    alert("保存失败: " + e.message);
  }
}

async function deleteOrder(id) {
  if (!confirm(`确定删除订单 ${id} ?`)) return;
  try {
    await apiSend(`/api/orders/${encodeURIComponent(id)}`, "DELETE");
    await renderOrdersData();
  } catch (e) {
    alert("删除失败: " + e.message);
  }
}

// ---- 小工具 -----------------------------------------------------------------

function actionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "mini";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

function fmtDt(iso) {
  return iso ? iso.replace("T", " ").slice(0, 16) : "-";
}

function toLocalInput(iso) {
  return iso ? iso.slice(0, 16) : "";
}
