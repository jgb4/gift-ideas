// Gift Ideas API (Cloudflare Worker)
// - POST /api/login        password -> session token (password checked here, never in the browser)
// - GET/PUT /api/data      the gift lists, stored in Workers KV
// - POST /api/synthesize   link or description -> { name, description, price, image, links }
//
// Secrets (set with `wrangler secret put`): GEMINI_API_KEY, SESSION_SECRET, PW_SALT, PW_HASH
// Vars (wrangler.toml): ALLOWED_ORIGINS, GEMINI_MODEL, DAILY_SEARCH_CAP
// Optional for local testing only: GEMINI_STUB=1 returns a canned AI answer.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TOKEN_DAYS = 60;
const enc = new TextEncoder();

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "",
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const path = new URL(req.url).pathname;
    try {
      if (path === "/api/login" && req.method === "POST") return json(...(await login(req, env)));

      if (!(await authed(req, env))) return json({ error: "Not signed in" }, 401);

      if (path === "/api/usage" && req.method === "GET") return json(await usageReport(env));
      if (path === "/api/data" && req.method === "GET") return json((await env.GIFTS.get("db", "json")) || null);
      if (path === "/api/data" && req.method === "PUT") {
        const body = await req.text();
        if (body.length > 5_000_000) return json({ error: "Too large" }, 413);
        const db = JSON.parse(body);
        if (!Array.isArray(db?.categories)) return json({ error: "Bad data" }, 400);
        await env.GIFTS.put("db", body);
        return json({ ok: true });
      }
      if (path === "/api/synthesize" && req.method === "POST") {
        const { input, forWhom, mode } = await req.json();
        if (!input || typeof input !== "string") return json({ error: "input required" }, 400);
        return json(await synthesize(input.trim().slice(0, 1000), String(forWhom || "someone").slice(0, 100), mode === "stores" ? "stores" : "auto", env));
      }
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },
};

// ---------- auth ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
function sameString(a, b) { // constant-time-ish compare
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function login(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const failKey = "fail:" + ip;
  const fails = Number((await env.GIFTS.get(failKey)) || 0);
  if (fails >= 10) return [{ error: "Too many tries. Wait 15 minutes." }, 429];
  const { password } = await req.json().catch(() => ({}));
  const ok = typeof password === "string" && sameString(await sha256(env.PW_SALT + ":" + password), env.PW_HASH || "");
  if (!ok) {
    await env.GIFTS.put(failKey, String(fails + 1), { expirationTtl: 900 });
    return [{ error: "Wrong password." }, 401];
  }
  const exp = String(Date.now() + TOKEN_DAYS * 864e5);
  return [{ token: exp + "." + (await hmac(env.SESSION_SECRET, exp)) }, 200];
}
async function authed(req, env) {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const [exp, sig] = t.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return sameString(sig, await hmac(env.SESSION_SECRET, exp));
}

// ---------- page reading (free, no AI) ----------
const decode = (s = "") => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "Store"; } };

async function readPage(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "en-US,en" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
  const out = { ok: res.ok, finalUrl: res.url || url, metas: {}, ld: [], title: "", text: "" };
  if (!(res.headers.get("content-type") || "").includes("html")) return finish(out);
  await new HTMLRewriter()
    .on("meta", { element(e) {
      const k = (e.getAttribute("property") || e.getAttribute("name") || e.getAttribute("itemprop") || "").toLowerCase();
      const v = e.getAttribute("content");
      if (k && v && !(k in out.metas)) out.metas[k] = decode(v);
    } })
    .on('script[type="application/ld+json"]', { element() { out.ld.push(""); }, text(t) { if (out.ld.length) out.ld[out.ld.length - 1] += t.text; } })
    .on("title", { text(t) { if (out.title.length < 300) out.title += t.text; } })
    .on("h1, h2, p, li", { text(t) { if (out.text.length < 5000) out.text += t.text + (t.lastInTextNode ? " " : ""); } })
    .transform(res).arrayBuffer();
  return finish(out);
}
function finish(o) {
  const walk = (n) => {
    if (!n || typeof n !== "object") return null;
    if (Array.isArray(n)) { for (const x of n) { const r = walk(x); if (r) return r; } return null; }
    if ([].concat(n["@type"] || []).some((t) => /product/i.test(t))) return n;
    return walk(n["@graph"]) || walk(n.mainEntity);
  };
  let ld = null;
  for (const s of o.ld) { try { ld = walk(JSON.parse(s)); if (ld) break; } catch {} }
  const m = o.metas;
  let price = null;
  if (ld?.offers) { const f = [].concat(ld.offers)[0]; const a = f?.price ?? f?.lowPrice; if (a != null) price = (f.priceCurrency && f.priceCurrency !== "USD" ? f.priceCurrency + " " : "$") + a; }
  const amt = m["product:price:amount"] || m["og:price:amount"]; if (!price && amt) price = "$" + amt;
  let image = ld?.image ? [].concat(ld.image)[0] : null; if (image && typeof image === "object") image = image.url || image.contentUrl;
  image = image || m["og:image"] || m["twitter:image"] || null;
  try { image = image ? new URL(image, o.finalUrl).href : null; } catch { image = null; }
  return {
    ok: o.ok, finalUrl: o.finalUrl, image, price,
    name: decode(ld?.name || m["og:title"] || o.title || "") || null,
    description: decode(ld?.description || m["og:description"] || m["description"] || "") || null,
    isProduct: !!(ld || m["og:type"] === "product" || price),
    text: decode(o.text).replace(/\s+/g, " ").slice(0, 4000),
  };
}

// ---------- Gemini ----------
async function gemini(env, prompt, useSearch) {
  if (env.GEMINI_STUB === "1") return stubAnswer(prompt, useSearch);
  const body = { model: env.GEMINI_MODEL || "gemini-3.5-flash-lite", input: prompt };
  if (useSearch) body.tools = [{ type: "google_search" }];
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY, "Api-Revision": "2026-05-20" },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let j = {}; try { j = JSON.parse(raw); } catch {}
  if (Array.isArray(j)) j = j[0] || {}; // errors sometimes come wrapped in an array
  if (!r.ok) { const e = new Error(j?.error?.message || j?.message || `Gemini error ${r.status}: ${raw.slice(0, 300)}`); e.status = r.status; throw e; }
  const texts = [];
  if (typeof j.output_text === "string") texts.push(j.output_text);
  for (const s of j.steps || []) if (s.type === "model_output") for (const c of s.content || []) if (c.text) texts.push(c.text);
  for (const c of j.candidates || []) for (const p of c.content?.parts || []) if (p.text) texts.push(p.text); // older response shape
  const text = texts.join("\n");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI reply had no JSON");
  const out = JSON.parse(match[0]);
  // How many Google searches Gemini actually ran for this answer.
  let queries = 0;
  for (const s of j.steps || []) if (s.type === "google_search_call") queries += Array.isArray(s.arguments?.queries) ? s.arguments.queries.length : 1;
  for (const c of j.candidates || []) queries += c.groundingMetadata?.webSearchQueries?.length || 0;
  out.__queries = queries;
  return out;
}

// ---------- search budget ----------
// Live search only works once billing is on; if Google refuses it, we retry in an hour.
// DAILY_SEARCH_CAP (default 200) bounds how many searched lookups run per day (Pacific time).
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const cap = (env) => Number(env.DAILY_SEARCH_CAP || 200);
// Usage lives in one KV record: { days: {"2026-11-13": {l, q}}, months: {"2026-11": {l, q}}, total: {l, q} }
// l = searched lookups (what the daily cap counts), q = Google search queries Gemini ran.
async function getUsage(env) {
  const u = (await env.GIFTS.get("usage", "json")) || {};
  return { days: u.days || {}, months: u.months || {}, total: u.total || { l: 0, q: 0 } };
}
async function canSearch(env) {
  if (env.GEMINI_STUB === "1" ? env.STUB_SEARCH !== "1" : await env.GIFTS.get("search-off")) return false;
  return ((await getUsage(env)).days[today()]?.l || 0) < cap(env);
}
async function countSearch(env, queries) {
  const u = await getUsage(env);
  const d = today(), m = d.slice(0, 7);
  for (const rec of [(u.days[d] ||= { l: 0, q: 0 }), (u.months[m] ||= { l: 0, q: 0 }), u.total]) { rec.l += 1; rec.q += queries; }
  for (const k of Object.keys(u.days).sort().slice(0, -62)) delete u.days[k]; // keep ~2 months of daily detail
  await env.GIFTS.put("usage", JSON.stringify(u));
}
async function usageReport(env) {
  const u = await getUsage(env);
  return {
    siteMonth: u.months[today().slice(0, 7)] || { l: 0, q: 0 },
    freeMonthly: 5000,
    searchOn: env.GEMINI_STUB === "1" ? env.STUB_SEARCH === "1" : !(await env.GIFTS.get("search-off")),
    account: await accountUsage(env),
  };
}

// ---------- account-wide usage (Google Cloud billing export in BigQuery) ----------
// Optional secrets: GCP_SA_KEY (service account JSON with BigQuery Data Viewer + Job User)
// and BQ_TABLE ("project.dataset.gcp_billing_export_v1_XXXXXX"). Cached for an hour.
async function accountUsage(env) {
  if (!env.GCP_SA_KEY || !env.BQ_TABLE) return { connected: false };
  const cached = await env.GIFTS.get("acct-usage", "json");
  if (cached) return cached;
  let out;
  try {
    if (!/^[\w.-]+\*?$/.test(env.BQ_TABLE)) throw new Error("BQ_TABLE looks wrong");
    const sa = JSON.parse(env.GCP_SA_KEY);
    const token = await googleToken(sa);
    const net = "cost + IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)";
    const query = `SELECT
        SUM(IF(LOWER(sku.description) LIKE '%grounding%', usage.amount, 0)) AS searches,
        ANY_VALUE(IF(LOWER(sku.description) LIKE '%grounding%', usage.unit, NULL)) AS unit,
        SUM(IF(LOWER(sku.description) LIKE '%grounding%', ${net}, 0)) AS search_cost,
        SUM(${net}) AS gemini_cost,
        ANY_VALUE(currency) AS currency,
        MAX(export_time) AS as_of
      FROM \`${env.BQ_TABLE}\`
      WHERE invoice.month = FORMAT_DATE('%Y%m', CURRENT_DATE('America/Los_Angeles'))
        AND (LOWER(service.description) LIKE '%gemini%' OR LOWER(service.description) LIKE '%generative language%')`;
    const r = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${sa.project_id}/queries`, {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 20000 }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "BigQuery error " + r.status);
    const v = (j.rows?.[0]?.f || []).map((x) => x.v);
    out = { connected: true, searches: Number(v[0] || 0), unit: v[1] || null, searchCost: Number(v[2] || 0), geminiCost: Number(v[3] || 0),
      currency: v[4] || "USD", asOf: v[5] ? new Date(Number(v[5]) * 1000).toISOString() : null, checkedAt: new Date().toISOString() };
    await env.GIFTS.put("acct-usage", JSON.stringify(out), { expirationTtl: 3600 });
  } catch (e) {
    out = { connected: true, error: e.message, checkedAt: new Date().toISOString() };
    await env.GIFTS.put("acct-usage", JSON.stringify(out), { expirationTtl: 600 });
  }
  return out;
}

async function googleToken(sa) {
  const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const part = (o) => b64u(enc.encode(JSON.stringify(o)));
  const unsigned = part({ alg: "RS256", typ: "JWT" }) + "." + part({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/bigquery", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + unsigned + "." + b64u(sig),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google sign-in for billing data failed: " + (j.error_description || j.error || r.status));
  return j.access_token;
}

const FIELDS = `"name": "short clear product name",
  "description": "one or two short sentences: what it is and why it's a nice gift",
  "price": "estimated typical US price, e.g. \\"$49\\" or \\"$40–60\\"",`;

function prompt(input, url, page, forWhom, withSearch) {
  const what = url
    ? `They pasted this link: ${url}
What the page says (may be empty if the site blocks readers): ${JSON.stringify(page ? { name: page.name, description: page.description, price: page.price } : null)}
Page text excerpt: """${page?.text?.slice(0, 3000) || ""}"""
Identify the exact product (the link text itself often names it).`
    : `They typed this gift idea: """${input}"""
Turn it into one specific, real, currently sold product that best matches.
- If they name a brand, pick from that brand's current lineup (check the brand's own website).
- Words like "best", "top", "nicest", "premium", "fanciest" mean the brand's top-of-the-line / flagship model, not its most popular or cheapest one.
- If the idea is vague with no brand, pick a popular, well-reviewed option that fits.`;
  const tail = withSearch
    ? `Search the web for the current price and the best places to buy it (reputable retailers, best price or availability).
Every link must be a direct product page for this exact model, never a homepage, category or search page. If the brand sells it on its own site, list that product page first.
Reply with ONLY a JSON object:
{ ${FIELDS}
  "image": "direct product image URL you found, or null",
  "links": [{"store": "Store name", "url": "https://...", "price": "$.. or null"}],
  "searchQuery": "short brand + model search query" }
1 to 3 links, best first. Only URLs you actually found.`
    : `Reply with ONLY a JSON object:
{ ${FIELDS}
  "productUrls": ["up to 3 likely direct product page URLs: the brand's own shop first, then retailers like REI, Best Buy, Nordstrom, Uncommon Goods, Etsy"],
  "searchQuery": "short brand + model search query" }`;
  return `Someone is building a gift list (gift for: ${forWhom}).\n${what}\n${tail}`;
}

// Sites that block page readers; skip them when hunting for a photo.
const BLOCKS_READERS = /(^|\.)(amazon|walmart|target|google|ebay)\./i;

// mode "auto": search only when it adds something (typed ideas, or links whose page can't be read).
// mode "stores": the "Find best stores" button, always searches if allowed.
async function synthesize(input, forWhom, mode, env) {
  const url = asUrl(input);
  let page = null;
  if (url) { try { page = await readPage(url); } catch {} }
  const pageIsGood = !!(page?.ok && page.isProduct && page.name);

  const wantSearch = mode === "stores" || !url || !pageIsGood;
  let ai = null, usedSearch = false, error = null, note = null, queries = 0;
  if (wantSearch && (await canSearch(env))) {
    try { ai = await gemini(env, prompt(input, url, page, forWhom, true), true); usedSearch = true; queries = ai.__queries || 0; console.log("search ok", queries, "queries"); await countSearch(env, queries); }
    catch (e) { console.log("search failed", e.status, e.message); if ([400, 403].includes(e.status)) await env.GIFTS.put("search-off", "1", { expirationTtl: 3600 }); }
  } else if (mode === "stores") note = "Live store search isn't available right now (billing off or today's search limit reached).";
  if (!ai) {
    try { ai = await gemini(env, prompt(input, url, page, forWhom, false), false); }
    catch (e) { console.log("gemini failed", e.status, e.message); error = e.status === 402 ? "Gemini needs prepaid credit: add some in AI Studio (Billing), then press ↻." : e.status === 429 ? "Gemini's daily limit is used up. Try ↻ tomorrow." : `AI couldn't finish (${e.message}). Try ↻ or edit by hand.`; }
  }

  const name = String(ai?.name || page?.name || input).slice(0, 120);
  const links = [];
  const add = (l) => { if (l?.url && /^https?:\/\//.test(l.url) && !links.some((x) => host(x.url) === host(l.url))) links.push(l); };
  if (url) add({ store: host(page?.finalUrl || url), url: page?.finalUrl || url, price: page?.price || null });

  let image = page?.image || null;
  let checks = 0;
  const tryPage = async (u, keepLink) => {
    if (checks >= 4 || !asUrl(u) || BLOCKS_READERS.test(host(u))) return;
    checks++;
    try {
      const p = await readPage(u);
      if (!(p.ok && p.isProduct && new URL(p.finalUrl).pathname.length > 1)) return;
      if (keepLink) add({ store: host(p.finalUrl), url: p.finalUrl, price: p.price });
      if (!image && p.image) image = p.image;
      if (!links.find((l) => host(l.url) === host(p.finalUrl))?.price && p.price) { const l = links.find((x) => host(x.url) === host(p.finalUrl)); if (l) l.price = p.price; }
    } catch {}
  };
  if (usedSearch) {
    const isHome = (u) => { try { return new URL(u).pathname.replace(/\/+$/, "") === ""; } catch { return true; } };
    for (const l of Array.isArray(ai?.links) ? ai.links : []) if (!isHome(l.url)) add({ store: l.store || host(l.url), url: l.url, price: l.price || null });
    for (const l of [...links]) { if (image) break; await tryPage(l.url, false); }
    image = image || ai?.image || null;
  } else {
    // No live search: only keep guessed pages that really exist and look like products.
    for (const u of (Array.isArray(ai?.productUrls) ? ai.productUrls : []).slice(0, 3)) {
      if (links.length >= 2 && image) break;
      await tryPage(u, true);
    }
  }
  const q = encodeURIComponent(ai?.searchQuery || name);
  if (links.length < 3) add({ store: "Amazon", url: `https://www.amazon.com/s?k=${q}`, price: null });
  if (links.length < 3) add({ store: "Google Shopping", url: `https://www.google.com/search?tbm=shop&q=${q}`, price: null });

  return {
    name,
    description: String(ai?.description || page?.description || "").slice(0, 400),
    price: String(page?.price || links.find((l) => l.price)?.price || ai?.price || ""),
    image,
    links: links.slice(0, 3),
    sourceUrl: url,
    searched: usedSearch,
    searchQueries: queries,
    error: error || note,
  };
}

function asUrl(input) {
  if (!input || /\s/.test(input)) return null;
  for (const c of [input, "https://" + input]) {
    try { const u = new URL(c); if (/^https?:$/.test(u.protocol) && u.hostname.includes(".")) return u.href; } catch {}
  }
  return null;
}

function stubAnswer(p, search) {
  if (search) return { __queries: 2, name: "Glerups Felt Slipper", description: "Warm boiled-wool slippers.", price: "$90", image: null, searchQuery: "Glerups felt slipper",
    links: [{ store: "Allbirds (test)", url: "https://www.allbirds.com/products/mens-wool-runners", price: null }, { store: "Amazon", url: "https://www.amazon.com/dp/B000TEST", price: "$85" }] };
  if (p.includes("slippers")) return { name: "Glerups Felt Slipper", description: "Warm boiled-wool slippers with a soft leather sole.", price: "$90", searchQuery: "Glerups felt slipper",
    productUrls: ["https://www.glerups.com/", "https://www.allbirds.com/products/mens-wool-runners"] };
  return { name: "Stub Product", description: "Stub description.", price: "$10", productUrls: [], searchQuery: "stub product" };
}
