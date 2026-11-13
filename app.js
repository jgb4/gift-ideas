// ---------- page ----------
// Each holiday has its own page (hanukkah/, birthdays/) that sets <body data-holiday="...">.
const HOLIDAYS = [{ name: "Hanukkah", path: "hanukkah" }, { name: "Birthdays", path: "birthdays" }];
const HOLIDAY = document.body.dataset.holiday;
document.title = HOLIDAY + " gift ideas";
document.body.insertAdjacentHTML("afterbegin", `
<div class="gate" id="lock" hidden>
  <form class="gate-card" id="lockForm">
    <h1>${HOLIDAY}</h1>
    <p>This list is private. Enter the password.</p>
    <input type="password" id="pw" placeholder="Password" autocomplete="current-password" autofocus />
    <label><input type="checkbox" id="remember" checked /> Remember this device</label>
    <button class="primary" id="unlockBtn">Unlock</button>
    <div class="err" id="lockErr"></div>
  </form>
</div>
<div class="app" id="app" hidden><aside id="sidebar"></aside><main id="main"></main></div>
<dialog id="usageDlg">
  <form method="dialog">
    <strong>Search usage</strong>
    <div id="usageBody"></div>
    <div class="row"><button class="primary" value="close">Close</button></div>
  </form>
</dialog>
<dialog id="edit">
  <form method="dialog" id="editForm">
    <strong>Edit gift</strong>
    <label>What you asked for (a link or a description). Change it if you like, then look it up again</label>
    <textarea name="input" rows="2"></textarea>
    <div class="row" style="justify-content:flex-start;margin-top:8px"><button type="button" class="primary" id="rerunBtn">Look it up again</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0 4px">
    <label>Name</label><input name="name" />
    <label>Short description</label><textarea name="description" rows="3"></textarea>
    <label>Estimated price</label><input name="price" placeholder="$49" />
    <label>Picture URL</label><input name="image" />
    <label>Where to buy (one per line: Store | URL)</label><textarea name="links" rows="3"></textarea>
    <div class="row"><button value="cancel" class="icon">Cancel</button><button value="save" class="primary">Save</button></div>
  </form>
</dialog>`);

// ---------- config ----------
// The API (Cloudflare Worker) checks the password, stores the lists and runs the AI.
const API = location.hostname === "localhost" ? "http://localhost:8787" : "https://gift-ideas-api.gift-ideas-api.workers.dev";
const TOKEN_KEY = "gift-token";

const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
const show = (id) => ["lock", "app"].forEach((x) => ($("#" + x).hidden = x !== id));
let token = ls.get(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token || ""), ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/login") { lockNow(); throw new Error("Signed out"); }
  if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
  return data;
}

// ---------- password (checked by the server) ----------
$("#lockForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#unlockBtn").disabled = true; $("#lockErr").textContent = "";
  try {
    const r = await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#pw").value }) });
    token = r.token;
    if ($("#remember").checked) ls.set(TOKEN_KEY, token); else sessionStorage.setItem(TOKEN_KEY, token);
    start();
  } catch (err) { $("#lockErr").textContent = err.message; $("#pw").select(); }
  finally { $("#unlockBtn").disabled = false; }
};
function lockNow() { try { sessionStorage.removeItem(SESSION_KEY); } catch {} token = null; ls.set(TOKEN_KEY, null); sessionStorage.removeItem(TOKEN_KEY); show("lock"); }

// ---------- storage ----------
let db = null, sel = { prof: null }, saveTimer = null, saveState = "ok";
const SEL_KEY = "gift-sel-" + HOLIDAY.toLowerCase();
function newCategory(name) {
  const p = (n, special = false) => ({ id: rid(), name: n, special, items: [] });
  return { id: rid(), name, profiles: name === "Hanukkah" ? [p("Me", true), p("Emma"), p("Andrew"), p("Mom"), p("Dad")] : [] };
}
// Make sure this page's holiday exists in the shared data.
function ensureCategory() {
  if (!db?.categories) db = { categories: [] };
  if (!currentCat()) { db.categories.push(newCategory(HOLIDAY)); return true; }
  return false;
}
async function start() {
  show("app");
  $("#sidebar").innerHTML = ""; $("#main").innerHTML = `<p class="sub">Loading your lists…</p>`;
  try {
    db = await api("/api/data");
    if (ensureCategory()) await api("/api/data", { method: "PUT", body: JSON.stringify(db) });
  } catch (e) { if (token) $("#main").innerHTML = `<div class="empty">Couldn't load your lists (${esc(e.message)}). Reload to try again.</div>`; return; }
  try { Object.assign(sel, JSON.parse(ls.get(SEL_KEY) || "{}")); } catch {}
  fixSel(); render(); runQueue(); loadUsage();
}
// Pick up changes made on another device when you come back to this tab.
addEventListener("focus", async () => {
  if (!db || saveTimer || queueBusy) return;
  try { const fresh = await api("/api/data"); if (fresh?.categories) { db = fresh; ensureCategory(); fixSel(); render(); } } catch {}
});
function save() {
  saveState = "busy"; renderStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const mine = currentCat();
      const fresh = await api("/api/data").catch(() => null);
      if (fresh?.categories && mine) {
        const k = fresh.categories.findIndex((c) => c.id === mine.id);
        if (k >= 0) fresh.categories[k] = mine; else fresh.categories.push(mine);
        db = fresh;
      }
      await api("/api/data", { method: "PUT", body: JSON.stringify(db) }); saveState = "ok";
    } catch (e) { saveState = "bad"; console.error(e); }
    renderStatus();
  }, 1200);
}

// ---------- helpers ----------
const cats = () => db.categories;
const currentCat = () => cats().find((c) => c.name.toLowerCase() === HOLIDAY.toLowerCase());
const currentProf = () => currentCat()?.profiles.find((p) => p.id === sel.prof);
function fixSel() {
  if (!currentProf()) sel.prof = currentCat()?.profiles[0]?.id;
}
function select(prof) { sel.prof = prof; ls.set(SEL_KEY, JSON.stringify(sel)); render(); }
function findItem(id) { const c = currentCat(); if (c) for (const p of c.profiles) { const i = p.items.find((x) => x.id === id); if (i) return { c, p, i }; } }
function priceNum(p) { const m = String(p || "").replace(/,/g, "").match(/\d+(\.\d+)?/g); if (!m) return 0; const n = m.map(Number); return n.length > 1 ? (n[0] + n[1]) / 2 : n[0]; }
const letter = (i) => (String(i.name || "").trim()[0] || "").toUpperCase();
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "Store"; } };
function asUrl(input) {
  if (/\s/.test(input)) return null;
  for (const c of [input, "https://" + input]) { try { const u = new URL(c); if (/^https?:$/.test(u.protocol) && u.hostname.includes(".")) return u.href; } catch {} }
  return null;
}

// ---------- AI synthesis (one gift at a time, done by the server) ----------
let queueBusy = false;
async function runQueue() {
  if (queueBusy) return;
  queueBusy = true;
  try {
    for (;;) {
      let next = null;
      const c = currentCat();
      if (c) for (const p of c.profiles) for (const i of p.items) if (!next && i.status === "processing") next = { c, p, i };
      if (!next) break;
      const who = next.p.special ? "me (my own wishlist)" : `${next.p.name} (${next.c.name})`;
      let result;
      try { result = await api("/api/synthesize", { method: "POST", body: JSON.stringify({ input: next.i.sourceUrl || next.i.query, forWhom: who, mode: next.i.mode || "auto" }) }); }
      catch (e) { if (!token) return; result = { error: "Something went wrong: " + e.message }; }
      const live = findItem(next.i.id)?.i; // may have been deleted meanwhile
      if (live) { Object.assign(live, result, { status: "ready", mode: null }); save(); render(); }
      if (result.searched) { logSearch(result.name || next.i.name, result.searchQueries); loadUsage(); }
    }
  } finally { queueBusy = false; }
}

// ---------- search usage ----------
// Session: every search since you opened/unlocked the site, kept in this tab (instant).
// Month: Google's own account-wide numbers from the billing export (lags hours–1 day), or this site's count until that's connected.
let usage = null;
const SESSION_KEY = "gift-search-session";
const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || { q: 0, log: [] }; } catch { return { q: 0, log: [] }; } };
function logSearch(name, q) {
  const s = getSession();
  s.q += q || 0; s.log.unshift({ name, q: q || 0, at: Date.now() }); s.log = s.log.slice(0, 200);
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  renderUsageBtn();
}
async function loadUsage() { try { usage = await api("/api/usage"); renderUsageBtn(); } catch {} }
const fmt = (n) => Number(n || 0).toLocaleString();
const money = (n, cur = "USD") => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2 });
const ago = (iso) => { if (!iso) return "unknown"; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function monthFigure() {
  const a = usage?.account;
  if (a?.connected && !a.error) return { n: a.searches, label: "account" };
  return { n: usage?.siteMonth?.q || 0, label: "this site" };
}
function renderUsageBtn() {
  const b = $("#usageBtn"); if (!b) return;
  const m = monthFigure();
  b.textContent = `Searches: session ${fmt(getSession().q)} · month ${fmt(m.n)}${m.label === "this site" ? " (this site)" : ""}`;
}
async function openUsage() {
  await loadUsage();
  const s = getSession(), u = usage || {}, a = u.account || {};
  const monthName = new Date().toLocaleString("en-US", { month: "long" });
  const accountHtml = !a.connected
    ? `<p class="small">Account-wide numbers aren't connected yet (they come from Google Cloud's billing export). Showing this site only.</p>`
    : a.error ? `<p class="note">Couldn't read Google's billing data: ${esc(a.error)}</p>`
    : `<table class="usage-table">
        <tr><td>Google searches (all projects)</td><td class="n">${fmt(a.searches)}${a.unit && !/request|count/i.test(a.unit) ? " " + esc(a.unit) : ""}</td></tr>
        <tr><td>Search cost after free allowance</td><td class="n">${money(a.searchCost, a.currency)}</td></tr>
        <tr><td>All Gemini cost after credits</td><td class="n">${money(a.geminiCost, a.currency)}</td></tr>
      </table>
      <p class="small">Google's data last updated ${ago(a.asOf)} (it lags a few hours to a day). Checked ${ago(a.checkedAt)}; refreshes hourly.</p>`;
  const freePct = Math.min(100, (monthFigure().n / (u.freeMonthly || 5000)) * 100);
  $("#usageBody").innerHTML = `
    <p class="small">${u.searchOn ? "Live Google Search is on." : "Live search is off right now (billing not on, or Google refused it), so gifts use the free mode."}</p>
    <h3 style="margin:16px 0 4px;font-size:15px">This session: ${fmt(s.q)} search${s.q === 1 ? "" : "es"}</h3>
    ${s.log.length ? `<table class="usage-table"><tr><th>Gift</th><th class="n">Searches</th><th class="n">When</th></tr>
      ${s.log.map((e) => `<tr><td>${esc(e.name)}</td><td class="n">${e.q ? fmt(e.q) : "?"}</td><td class="n">${new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td></tr>`).join("")}</table>`
      : `<p class="small">No searches yet this session.</p>`}
    <h3 style="margin:16px 0 4px;font-size:15px">${monthName}, whole Google account</h3>
    ${accountHtml}
    <div class="small">This site in ${monthName} (instant): ${fmt(u.siteMonth?.q)} searches</div>
    <div class="small" style="margin-top:8px">Free monthly searches used: ${fmt(monthFigure().n)} of ${fmt(u.freeMonthly || 5000)}</div>
    <div class="bar"><span style="width:${freePct}%"></span></div>`;
  $("#usageDlg").showModal();
}

// ---------- render ----------
function renderStatus() {
  const el = $("#syncStatus"); if (!el) return;
  el.innerHTML = saveState === "busy" ? `<span class="dot busy"></span>Saving…` : saveState === "bad" ? `<span class="dot bad"></span>Couldn't save` : `<span class="dot"></span>Saved`;
}

function render() {
  const sb = $("#sidebar");
  sb.innerHTML = `<a class="brand" href="../" style="text-decoration:none;color:inherit">Gift <span>Ideas</span></a>` +
    HOLIDAYS.map((h) => {
      const c = cats().find((x) => x.name.toLowerCase() === h.name.toLowerCase());
      const n = c ? c.profiles.reduce((s, p) => s + p.items.length, 0) : 0;
      return `<a class="cat ${h.name === HOLIDAY ? "active" : ""}" href="../${h.path}/">${esc(h.name)}<span class="count">${n}</span></a>`;
    }).join("") + `
    <div class="side-foot"><button id="usageBtn" title="Search usage"></button><span id="syncStatus"></span><button id="lockBtn">Lock</button></div>`;
  $("#lockBtn").onclick = lockNow;
  $("#usageBtn").onclick = openUsage;
  renderUsageBtn();
  renderStatus();

  const m = $("#main");
  const cat = currentCat();
  if (!cat) { m.innerHTML = `<div class="empty">Couldn't find this list.</div>`; return; }
  const prof = currentProf();
  m.className = prof?.special ? "special-theme" : "";
  m.innerHTML = `
    <h1 class="cat-title">${esc(cat.name)}</h1>
    <p class="sub">${cat.profiles.length ? "Pick a person, then add gift ideas." : "Add the people you're shopping for."}</p>
    <div class="profiles">
      ${cat.profiles.map((p) => `<button class="chip ${p.special ? "special" : ""} ${p.id === sel.prof ? "active" : ""}" data-prof="${p.id}">
        <span class="av">${p.special ? "ME" : esc(initials(p.name))}</span>${esc(p.name)} <small>${p.items.length}</small></button>`).join("")}
      <button class="chip add" id="addProf">+ Add person</button>
    </div>
    ${prof ? profileView(prof) : ""}`;
  m.querySelectorAll("[data-prof]").forEach((b) => (b.onclick = () => select(b.dataset.prof)));
  $("#addProf").onclick = () => addProfile(cat);
  if (prof) wireProfile(prof, cat);
}

function profileView(p) {
  const total = p.items.filter((i) => !i.purchased).reduce((s, i) => s + priceNum(i.price), 0);
  const bought = p.items.filter((i) => i.purchased).length;
  return `
    <div class="profile-head">
      <h2>${p.special ? "My wishlist" : esc(p.name)}${p.special ? `<span class="badge">Just for me</span>` : ""}</h2>
      <div class="stats"><b>${p.items.length}</b> ideas · <b>${bought}</b> bought · about <b>$${Math.round(total).toLocaleString()}</b> left</div>
    </div>
    <form class="add-link" id="addForm">
      <input id="gift" type="text" required placeholder="Paste a product link, or describe a gift (e.g. &quot;cozy wool slippers, size 9&quot;)…" autocomplete="off" />
      <button class="primary" id="addBtn">Add gift</button>
    </form>
    <p class="hint">AI finds the product, writes a quick description, estimates the price and adds places to buy. Tap Find stores on any gift to search the web for the best stores and current prices. It takes about 5–20 seconds per gift.</p>
    <div class="list">
      ${p.items.length ? p.items.map(giftRow).join("") : `<div class="empty">No gifts yet. Paste a link or describe a gift above.</div>`}
    </div>
    ${p.special ? "" : `<button class="danger-link" id="delProf">Remove ${esc(p.name)} from this list</button>`}`;
}

function giftRow(i) {
  if (i.status === "processing") return `
    <div class="gift loading">
      <div class="thumb"></div>
      <div><div class="gname">${i.sourceUrl ? `${i.mode === "stores" ? "Searching stores for " + esc(i.name) : "Reading " + esc(host(i.sourceUrl))}…` : `${i.mode === "stores" ? "Searching stores for" : "Finding"} “${esc(i.query || i.name)}”…`}</div><div class="shimmer" style="width:70%"></div><div class="shimmer" style="width:45%"></div>
      ${i.sourceUrl ? `<div class="links"><a href="${esc(i.sourceUrl)}" target="_blank" rel="noopener">Original link</a></div>` : ""}</div>
      <div class="right"><div class="actions"><button class="icon" data-del="${i.id}" title="Remove">Remove</button></div></div>
    </div>`;
  return `
    <div class="gift ${i.purchased ? "bought" : ""}">
      <div class="thumb">${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-f="${esc(letter(i))}" onerror="this.parentNode.textContent=this.dataset.f">` : esc(letter(i))}</div>
      <div>
        <div class="gname">${esc(i.name)}</div>
        ${i.description ? `<p class="gdesc">${esc(i.description)}</p>` : ""}
        <div class="links">${(i.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.store || "Store")}${l.price ? `<span class="lp">${esc(l.price)}</span>` : ""}</a>`).join("")}</div>
        ${i.error ? `<div class="note">${esc(i.error)}</div>` : ""}
        ${i.searched ? `<div class="meta">${i.searchQueries ? `${i.searchQueries} Google search${i.searchQueries === 1 ? "" : "es"} for this gift` : "Searched (Google didn't report how many)"}</div>` : ""}
      </div>
      <div class="right">
        <div class="price">${esc(i.price || "—")}<small>estimated</small></div>
        <div class="actions">
          <button class="icon ${i.purchased ? "on" : ""}" data-buy="${i.id}">${i.purchased ? "Bought" : "Mark bought"}</button>
          <button class="icon" data-stores="${i.id}" title="Search the web for the best stores and current prices">Find stores</button>
          <button class="icon" data-edit="${i.id}">Edit</button>
          <button class="icon" data-del="${i.id}" title="Remove">Remove</button>
        </div>
      </div>
    </div>`;
}

function wireProfile(p, cat) {
  $("#addForm").onsubmit = (e) => {
    e.preventDefault();
    const input = $("#gift").value.trim(); if (!input) return;
    const url = asUrl(input);
    p.items.unshift({ id: rid(), sourceUrl: url, query: url ? null : input.slice(0, 500), name: input.slice(0, 80), description: "", price: "", image: null, links: [], status: "processing", purchased: false, addedAt: new Date().toISOString() });
    save(); render(); $("#gift").focus(); runQueue();
  };
  const item = (id) => p.items.find((i) => i.id === id);
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    if (!confirm("Remove this gift?")) return;
    p.items = p.items.filter((i) => i.id !== b.dataset.del); save(); render();
  }));
  document.querySelectorAll("[data-buy]").forEach((b) => (b.onclick = () => { const i = item(b.dataset.buy); i.purchased = !i.purchased; save(); render(); }));
  document.querySelectorAll("[data-stores]").forEach((b) => (b.onclick = () => { const i = item(b.dataset.stores); i.status = "processing"; i.mode = "stores"; i.error = null; save(); render(); runQueue(); }));
  document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openEdit(item(b.dataset.edit))));
  const del = $("#delProf");
  if (del) del.onclick = () => {
    if (!confirm(`Remove ${p.name} and their ${p.items.length} gift ideas?`)) return;
    cat.profiles = cat.profiles.filter((x) => x.id !== p.id); save(); select(cat.profiles[0]?.id);
  };
}

function openEdit(i) {
  const f = $("#editForm"), d = $("#edit");
  f.name.value = i.name || ""; f.description.value = i.description || ""; f.price.value = i.price || ""; f.image.value = i.image || "";
  f.links.value = (i.links || []).map((l) => `${l.store} | ${l.url}`).join("\n");
  f.input.value = i.sourceUrl || i.query || i.name || "";
  d.returnValue = "";
  $("#rerunBtn").onclick = () => d.close("rerun");
  d.onclose = () => {
    if (d.returnValue === "rerun") {
      const text = f.input.value.trim(); if (!text) return;
      const url = asUrl(text);
      Object.assign(i, { sourceUrl: url, query: url ? null : text.slice(0, 500), status: "processing", mode: null, error: null });
      save(); render(); runQueue();
      return;
    }
    if (d.returnValue !== "save") return;
    const links = f.links.value.split("\n").map((line) => { const [a, b] = line.split("|").map((s) => s.trim()); return b ? { store: a, url: b } : a ? { store: host(a), url: a } : null; }).filter((l) => l && /^https?:\/\//.test(l.url));
    Object.assign(i, { name: f.name.value, description: f.description.value, price: f.price.value, image: f.image.value || null, links, error: null });
    save(); render();
  };
  d.showModal();
}

function addProfile(cat) {
  const name = prompt(`Who are you shopping for in ${cat.name}?`)?.trim(); if (!name) return;
  const p = { id: rid(), name, special: false, items: [] }; cat.profiles.push(p); save(); select(p.id);
}

// ---------- boot ----------
if (token) start(); else show("lock");
