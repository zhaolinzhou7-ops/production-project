"use strict";

/* 可复用 SVG 甘特图组件 (排产页 / 方案查看共用)。 */

const GANTT_COLORS = [
  "#4f8cff", "#36d399", "#fbbd23", "#f87272", "#a78bfa",
  "#22d3ee", "#fb923c", "#e879f9", "#84cc16", "#f472b6",
];
const OUTSOURCE_ID = "OUTSOURCE";

/**
 * 绘制甘特图。
 * opts: {
 *   container, legendContainer?: DOM 元素,
 *   lanes: [{id, name, windows: [{start,end}]}],
 *   ops: [{operation_id, operation_name, order_id, order_name,
 *          machine_id, start, setup, duration, end, frozen?}],
 *   makespan, scheduleStart?: ISO 字符串,
 *   orders?: [{id, name}] (图例顺序/颜色),
 * }
 */
function drawGantt(opts) {
  const { container, lanes, ops, makespan } = opts;
  const orderIds = (opts.orders || []).map((o) => o.id);
  ops.forEach((op) => {
    if (!orderIds.includes(op.order_id)) orderIds.push(op.order_id);
  });
  const orderColor = {};
  orderIds.forEach((oid, i) => { orderColor[oid] = GANTT_COLORS[i % GANTT_COLORS.length]; });

  const rowH = 44, padTop = 30, padLeft = 90, padRight = 30, padBottom = 30;
  const width = 1000;
  const plotW = width - padLeft - padRight;
  const height = padTop + lanes.length * rowH + padBottom;
  const scale = plotW / Math.max(makespan, 1);
  const startMs = opts.scheduleStart ? new Date(opts.scheduleStart).getTime() : null;

  const fmtTick = (t) => {
    if (startMs === null) return String(t);
    const d = new Date(startMs + t * 60000);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  // 时间轴
  const ticks = startMs === null ? 10 : 6;
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
    lbl.textContent = fmtTick(t);
    svg.appendChild(lbl);
  }

  // 泳道标签 + 停机底纹
  const rowIndex = {};
  lanes.forEach((lane, i) => {
    rowIndex[lane.id] = i;
    const y = padTop + i * rowH + rowH / 2;
    const lbl = document.createElementNS(svgNS, "text");
    lbl.setAttribute("x", padLeft - 10); lbl.setAttribute("y", y + 4);
    lbl.setAttribute("text-anchor", "end");
    lbl.textContent = lane.name;
    svg.appendChild(lbl);

    (lane.windows || []).forEach((w) => {
      if (w.start >= makespan) return;
      const x = padLeft + w.start * scale;
      const wpx = Math.max((Math.min(w.end, makespan) - w.start) * scale, 1);
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", padTop + i * rowH + 3);
      rect.setAttribute("width", wpx);
      rect.setAttribute("height", rowH - 8);
      rect.setAttribute("class", "downtime-bar");
      const title = document.createElementNS(svgNS, "title");
      title.textContent = `停机/班次外 ${fmtTick(w.start)} ~ ${fmtTick(Math.min(w.end, makespan))}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });
  });

  // 工序条
  ops.forEach((op) => {
    const row = rowIndex[op.machine_id];
    if (row === undefined) return;
    const y = padTop + row * rowH + 8;
    const barH = rowH - 18;

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

    const x = padLeft + op.start * scale;
    const w = Math.max(op.duration * scale, 1);
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", w);
    rect.setAttribute("height", barH);
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", orderColor[op.order_id]);
    rect.setAttribute("class", "gantt-bar" + (op.frozen ? " frozen-bar" : ""));
    const where = op.machine_id === OUTSOURCE_ID ? "外协" : `机台 ${op.machine_id}`;
    const title = document.createElementNS(svgNS, "title");
    title.textContent =
      `${op.order_name} / ${op.operation_name}${op.frozen ? " [冻结]" : ""}\n` +
      `${where} · ${fmtTick(op.start)}~${fmtTick(op.end)} (${op.duration}min)` +
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

  container.innerHTML = "";
  container.appendChild(svg);

  // 图例
  if (opts.legendContainer) {
    const legend = opts.legendContainer;
    legend.innerHTML = "";
    const names = {};
    (opts.orders || []).forEach((o) => { names[o.id] = o.name; });
    ops.forEach((op) => { if (!names[op.order_id]) names[op.order_id] = op.order_name; });
    orderIds.forEach((oid) => {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `<span class="swatch" style="background:${orderColor[oid]}"></span>${oid} ${names[oid] || ""}`;
      legend.appendChild(item);
    });
    const setupItem = document.createElement("div");
    setupItem.className = "item";
    setupItem.innerHTML = `<span class="swatch" style="background:#55617a"></span>换型时间`;
    legend.appendChild(setupItem);
  }
}

/** 从工序集合推导泳道 (方案查看用, 无停机窗信息)。 */
function lanesFromOps(ops) {
  const ids = [];
  ops.forEach((op) => { if (!ids.includes(op.machine_id)) ids.push(op.machine_id); });
  ids.sort((a, b) => (a === OUTSOURCE_ID) - (b === OUTSOURCE_ID) || a.localeCompare(b));
  return ids.map((id) => ({ id, name: id === OUTSOURCE_ID ? "外协" : id, windows: [] }));
}
