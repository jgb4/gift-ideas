// Data model, API client and small helpers shared by the pages.

export type Link = { store: string; url: string; price?: string | null; verified?: boolean }
export type Gift = {
  id: string
  sourceUrl: string | null
  query: string | null
  name: string
  description: string
  price: string
  image: string | null
  links: Link[]
  status: "processing" | "ready"
  mode?: "auto" | "stores" | null
  purchased: boolean
  error?: string | null
  searched?: boolean
  searchQueries?: number
  addedAt?: string
}
export type Profile = { id: string; name: string; special: boolean; items: Gift[] }
export type Category = { id: string; name: string; profiles: Profile[] }
export type DB = { categories: Category[] }

export const HOLIDAYS = [
  { name: "Hanukkah", path: "hanukkah" },
  { name: "Birthdays", path: "birthdays" },
]

// The API (Cloudflare Worker) checks the password, stores the lists and runs the AI.
const API = location.hostname === "localhost"
  ? "http://localhost:8787"
  : "https://gift-ideas-api.gift-ideas-api.workers.dev"
const TOKEN_KEY = "gift-token"

export const store = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string | null) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* private mode */ }
  },
}

export function getToken() {
  try { return store.get(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token: string | null, remember = true) {
  store.set(TOKEN_KEY, null)
  try { sessionStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
  if (!token) return
  if (remember) store.set(TOKEN_KEY, token)
  else try { sessionStorage.setItem(TOKEN_KEY, token) } catch { /* ignore */ }
}

export class SignedOut extends Error {}
let onSignedOut: () => void = () => {}
export const setSignedOutHandler = (fn: () => void) => { onSignedOut = fn }

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (getToken() || ""), ...(opts.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== "/api/login") { setToken(null); onSignedOut(); throw new SignedOut("Signed out") }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

export const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function newCategory(name: string): Category {
  const p = (n: string, special = false): Profile => ({ id: rid(), name: n, special, items: [] })
  return {
    id: rid(), name,
    profiles: name === "Hanukkah" ? [p("Me", true), p("Emma"), p("Andrew"), p("Mom"), p("Dad")] : [],
  }
}

export const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function priceNum(p: string) {
  const m = String(p || "").replace(/,/g, "").match(/\d+(\.\d+)?/g)
  if (!m) return 0
  const n = m.map(Number)
  return n.length > 1 ? (n[0] + n[1]) / 2 : n[0]
}

export const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "") } catch { return "Store" } }

export function asUrl(input: string) {
  if (/\s/.test(input)) return null
  for (const c of [input, "https://" + input]) {
    try { const u = new URL(c); if (/^https?:$/.test(u.protocol) && u.hostname.includes(".")) return u.href } catch { /* not a URL */ }
  }
  return null
}

// A photo for the gift: the saved one, or one built from a store link whose photos live at a
// predictable address (TCGplayer pages are empty to the server, but their image CDN isn't).
export function giftImage(gift: Gift): string | null {
  if (gift.image) return gift.image
  for (const l of gift.links || []) {
    const tcg = l.url.match(/tcgplayer\.com\/product\/(\d+)/)
    if (tcg) return `https://tcgplayer-cdn.tcgplayer.com/product/${tcg[1]}_in_1000x1000.jpg`
  }
  return null
}

// The one link to show. If the server confirmed some links (page opens, same item, in stock),
// pick the cheapest of those, ignoring prices under half the priciest (likely wrong). Otherwise
// take the AI's first pick: the cheapest unchecked link is often an official store that's sold out.
export function bestLink(gift: Gift): Link | null {
  const links = (gift.links || []).filter((l) => !/amazon\.com\/s\?|google\.com\/search/.test(l.url))
  const ok = links.filter((l) => l.verified)
  const priced = ok.filter((l) => priceNum(l.price || "") > 0)
  const top = Math.max(0, ...priced.map((l) => priceNum(l.price!)))
  const sane = priced.filter((l) => priceNum(l.price!) >= top / 2)
  if (sane.length) return sane.reduce((a, b) => (priceNum(b.price!) < priceNum(a.price!) ? b : a))
  return ok[0] || links[0] || (gift.sourceUrl ? { store: host(gift.sourceUrl), url: gift.sourceUrl } : null)
}

// "$24.99" -> "$25", "$1,299.50" -> "$1,300"; ranges and whole numbers are left alone.
export const roundPrice = (p?: string | null) =>
  String(p || "").replace(/\d[\d,]*\.\d+/g, (m) => Math.ceil(Number(m.replace(/,/g, ""))).toLocaleString("en-US"))
