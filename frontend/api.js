"use strict";

/** 公共 fetch 封装: 非 2xx 时抛出带后端 detail 的错误。 */
async function apiGet(url) {
  const res = await fetch(url);
  return handleResponse(res);
}

async function apiSend(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleResponse(res);
}

async function apiUpload(url, file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { method: "POST", body: form });
  return handleResponse(res);
}

async function handleResponse(res) {
  if (res.ok) return res.json();
  let detail = res.statusText;
  try {
    const body = await res.json();
    if (body.detail) {
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    }
  } catch (_) { /* 非 JSON 响应 */ }
  throw new Error(detail);
}

/** 顶部 tab 切换。 */
document.querySelectorAll(".tabs .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-page").forEach((p) => (p.hidden = true));
    document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
  });
});
