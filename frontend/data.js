"use strict";

/* 基础数据页: 机台/订单维护 + Excel 导入。 */

let editingMachineId = null; // null = 新增
let editingOrderId = null;
let ordersCache = [];

document.getElementById("btn-import").addEventListener("click", importExcel);
document.getElementById("btn-add-machine").addEventListener("click", () => openMachineDialog(null));
document.getElementById("btn-add-order").addEventListener("click", () => openOrderDialog(null));
document.getElementById("dlg-machine-save").addEventListener("click", saveMachine);
document.getElementById("dlg-order-save").addEventListener("click", saveOrder);
document.querySelector('.tabs [data-tab="data"]').addEventListener("click", refreshDataTab);

async function refreshDataTab() {
  await Promise.all([renderMachines(), renderOrdersData()]);
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

function openMachineDialog(machine) {
  editingMachineId = machine ? machine.id : null;
  document.getElementById("dlg-machine-title").textContent = machine ? "编辑机台" : "新增机台";
  document.getElementById("m-id").value = machine ? machine.id : "";
  document.getElementById("m-id").disabled = !!machine;
  document.getElementById("m-name").value = machine ? machine.name : "";
  document.getElementById("m-active").checked = machine ? machine.active : true;
  const lines = [];
  for (const [from, tos] of Object.entries(machine ? machine.setup_times : {})) {
    for (const [to, min] of Object.entries(tos)) lines.push(`${from},${to},${min}`);
  }
  document.getElementById("m-setup").value = lines.join("\n");
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

  const body = {
    id, name,
    active: document.getElementById("m-active").checked,
    setup_times: setup,
  };
  try {
    if (editingMachineId) await apiSend(`/api/machines/${encodeURIComponent(id)}`, "PUT", body);
    else await apiSend("/api/machines", "POST", body);
    document.getElementById("dlg-machine").close();
    await renderMachines();
  } catch (e) {
    alert("保存失败: " + e.message);
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
      .map((op) => `${op.seq}.${op.name}(${op.family})`)
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
    const machines = Object.entries(op.machines).map(([m, d]) => `${m}:${d}`).join(",");
    return `${op.seq}|${op.name}|${op.family}|${machines}`;
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
    if (parts.length !== 4) throw new Error(`工序行格式错误 (需 4 段): ${line}`);
    const seq = parseInt(parts[0], 10);
    if (Number.isNaN(seq) || seq < 0) throw new Error(`工序号无效: ${line}`);
    const machines = {};
    for (const pair of parts[3].split(",")) {
      const [mid, dur] = pair.split(":").map((s) => s && s.trim());
      const minutes = parseInt(dur, 10);
      if (!mid || Number.isNaN(minutes) || minutes <= 0) {
        throw new Error(`机台:分钟 格式错误: ${pair}`);
      }
      machines[mid] = minutes;
    }
    ops.push({ seq, name: parts[1], family: parts[2], machines });
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
