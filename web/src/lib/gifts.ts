// Data model, API client and small helpers shared by the pages.

export type Link = { store: string; url: string; price?: string }
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
export const SESSION_KEY = "gift-search-session"

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
  if (!token) { try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ } return }
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

export function parseLinks(text: string): Link[] {
  return text.split("\n").map((line) => {
    const [a, b] = line.split("|").map((s) => s.trim())
    return b ? { store: a, url: b } : a ? { store: host(a), url: a } : null
  }).filter((l): l is Link => !!l && /^https?:\/\//.test(l.url))
}

// ---- search usage: this session's searches, kept in the tab (instant) ----
export type SessionLog = { q: number; log: { name: string; q: number; at: number }[] }
export function getSession(): SessionLog {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "") || { q: 0, log: [] } } catch { return { q: 0, log: [] } }
}
export function logSearch(name: string, q?: number) {
  const s = getSession()
  s.q += q || 0
  s.log.unshift({ name, q: q || 0, at: Date.now() })
  s.log = s.log.slice(0, 200)
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export type Usage = {
  siteMonth?: { l: number; q: number }
  freeMonthly?: number
  searchOn?: boolean
  account?: {
    connected?: boolean; error?: string; searches?: number; unit?: string
    searchCost?: number; geminiCost?: number; currency?: string; asOf?: string; checkedAt?: string
  }
}

export const fmt = (n?: number) => Number(n || 0).toLocaleString()
export const money = (n?: number, cur = "USD") =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2 })
export const ago = (iso?: string) => {
  if (!iso) return "unknown"
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
