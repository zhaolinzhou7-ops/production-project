"use strict";

/* 方案页: 求解保存 / 列表 / 甘特查看 / 对比。 */

let scenariosCache = [];
let pollTimer = null;

document.getElementById("btn-sc-solve").addEventListener("click", solveScenario);
document.querySelector('.tabs [data-tab="scenarios"]').addEventListener("click", refreshScenarios);

function scStatus(text) {
  document.getElementById("sc-status").textContent = text;
}

async function refreshScenarios() {
  scenariosCache = await apiGet("/api/scenarios");
  const tbody = document.querySelector("#scenarios-table tbody");
  tbody.innerHTML = "";
  scenariosCache.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td>${s.id}</td><td>${escText(s.name)}</td>` +
      `<td>${s.kind === "simulation" ? "模拟" : "基准"}` +
      `${s.base_scenario_id ? ` (基于#${s.base_scenario_id})` : ""}</td>` +
      `<td>${s.created_at.replace("T", " ").slice(0, 16)}</td>` +
      `<td>${s.status}</td><td>${s.makespan}</td>` +
      `<td>${s.total_tardiness}</td><td>${s.total_changeover}</td><td></td>`;
    const cell = tr.lastElementChild;
    cell.appendChild(scButton("甘特", () => viewScenario(s.id)));
    if (s.base_scenario_id) {
      cell.appendChild(scButton("对比基准", () => compareScenarios(s.base_scenario_id, s.id)));
    }
    cell.appendChild(scButton("删除", () => deleteScenario(s.id)));
    tbody.appendChild(tr);
  });

  const baseSel = document.getElementById("sc-base");
  const current = baseSel.value;
  baseSel.innerHTML = '<option value="">— 无 —</option>';
  scenariosCache.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `#${s.id} ${s.name}`;
    baseSel.appendChild(opt);
  });
  baseSel.value = current;
}

async function solveScenario() {
  const name = document.getElementById("sc-name").value.trim();
  if (!name) { alert("请填写方案名称"); return; }

  const downtimes = [];
  const dtText = document.getElementById("sc-downtimes").value.trim();
  if (dtText) {
    for (const line of dtText.split("\n")) {
      const [mid, s, e] = line.split(",").map((v) => v && v.trim());
      if (!mid || !s || !e) { alert(`停机行格式错误: ${line}`); return; }
      downtimes.push({
        machine_id: mid,
        start: s.replace(" ", "T"),
        end: e.replace(" ", "T"),
      });
    }
  }

  const base = document.getElementById("sc-base").value;
  const freeze = document.getElementById("sc-freeze").checked;
  const body = {
    name,
    kind: base || freeze || downtimes.length ? "simulation" : "baseline",
    base_scenario_id: base ? parseInt(base, 10) : null,
    time_limit_seconds: parseFloat(document.getElementById("sc-limit").value) || 20,
    freeze_progress: freeze,
    extra_downtimes: downtimes,
  };

  const btn = document.getElementById("btn-sc-solve");
  btn.disabled = true;
  scStatus("已提交, 求解中…");
  try {
    const run = await apiSend("/api/scenarios/solve", "POST", body);
    pollRun(run.run_id, btn);
  } catch (e) {
    btn.disabled = false;
    scStatus("");
    alert("提交失败: " + e.message);
  }
}

function pollRun(runId, btn) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    let run;
    try {
      run = await apiGet(`/api/runs/${runId}`);
    } catch (e) {
      clearInterval(pollTimer);
      btn.disabled = false;
      scStatus("查询失败: " + e.message);
      return;
    }
    if (run.status === "running") return;
    clearInterval(pollTimer);
    btn.disabled = false;
    if (run.status === "done") {
      scStatus(`完成, 已保存为方案 #${run.scenario_id}`);
      await refreshScenarios();
      const created = scenariosCache.find((s) => s.id === run.scenario_id);
      if (created && created.base_scenario_id) {
        compareScenarios(created.base_scenario_id, created.id);
      }
    } else if (run.status === "conflict") {
      scStatus("");
      alert(
        "冻结冲突, 未求解:\n" +
        run.conflicts.map((c) => `- ${c.message}`).join("\n")
      );
    } else {
      scStatus("");
      alert("求解失败: " + (run.error || "未知错误"));
    }
  }, 1500);
}

async function viewScenario(id) {
  const detail = await apiGet(`/api/scenarios/${id}`);
  document.getElementById("sc-gantt-panel").hidden = false;
  document.getElementById("sc-gantt-title").textContent =
    `方案 #${detail.id} ${detail.name} — 甘特图 (${detail.status})`;
  drawGantt({
    container: document.getElementById("sc-gantt"),
    legendContainer: document.getElementById("sc-legend"),
    lanes: lanesFromOps(detail.operations),
    ops: detail.operations,
    makespan: detail.makespan,
    scheduleStart: detail.schedule_start,
  });
  document.getElementById("sc-gantt-panel").scrollIntoView({ behavior: "smooth" });
}

async function compareScenarios(aId, bId) {
  let cmp;
  try {
    cmp = await apiGet(`/api/scenarios/compare?a=${aId}&b=${bId}`);
  } catch (e) {
    alert("对比失败: " + e.message);
    return;
  }
  document.getElementById("sc-compare-panel").hidden = false;
  document.getElementById("sc-compare-title").textContent =
    `方案对比: A=#${cmp.a.id} ${cmp.a.name}  vs  B=#${cmp.b.id} ${cmp.b.name}`;

  const kpis = document.getElementById("sc-compare-kpis");
  const dMk = cmp.b.makespan - cmp.a.makespan;
  const dTd = cmp.b.total_tardiness - cmp.a.total_tardiness;
  kpis.innerHTML = [
    ["总完工 A→B", `${cmp.a.makespan} → ${cmp.b.makespan} (${dMk >= 0 ? "+" : ""}${dMk})`],
    ["加权拖期 A→B", `${cmp.a.total_tardiness} → ${cmp.b.total_tardiness} (${dTd >= 0 ? "+" : ""}${dTd})`],
    ["移动工序数", String(cmp.moved_operations)],
  ].map(([k, v]) =>
    `<div class="kpi"><span class="kpi-label">${k}</span><span class="kpi-val">${v}</span></div>`
  ).join("");

  const tbody = document.querySelector("#sc-compare-table tbody");
  tbody.innerHTML = "";
  cmp.orders.forEach((o) => {
    const tr = document.createElement("tr");
    const delta = o.delta_completion;
    const deltaText = delta === null || delta === undefined
      ? (o.completion_a === null ? "新增" : "移除")
      : (delta > 0 ? `+${delta}` : String(delta));
    const cls = delta > 0 ? "tardy" : delta < 0 ? "ontime" : "";
    tr.innerHTML =
      `<td>${o.order_id}</td><td>${escText(o.order_name)}</td>` +
      `<td>${o.completion_a ?? "-"}</td><td>${o.completion_b ?? "-"}</td>` +
      `<td class="${cls}">${deltaText}</td>` +
      `<td>${o.tardiness_a ?? "-"}</td><td>${o.tardiness_b ?? "-"}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("sc-compare-panel").scrollIntoView({ behavior: "smooth" });
}

async function deleteScenario(id) {
  if (!confirm(`确定删除方案 #${id} ?`)) return;
  try {
    await apiSend(`/api/scenarios/${id}`, "DELETE");
    await refreshScenarios();
  } catch (e) {
    alert("删除失败: " + e.message);
  }
}

function scButton(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "mini";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function escText(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}
