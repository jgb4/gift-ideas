import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { EditGiftDialog } from "@/components/EditGiftDialog"
import { GiftRow } from "@/components/GiftRow"
import { Login } from "@/components/Login"
import { AddPersonDialog, ConfirmDialog, type Confirm } from "@/components/SmallDialogs"
import { UsageDialog, monthFigure } from "@/components/UsageDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  HOLIDAYS, SignedOut, api, asUrl, fmt, getSession, getToken, logSearch, newCategory, priceNum, rid,
  sameName, setSignedOutHandler, setToken, store, type DB, type Gift, type Usage,
} from "@/lib/gifts"
import { cn } from "@/lib/utils"

export function HolidayApp({ holiday }: { holiday: string }) {
  const [authed, setAuthed] = useState(!!getToken())
  useEffect(() => setSignedOutHandler(() => setAuthed(false)), [])
  if (!authed) return <Login title={holiday} onUnlock={() => setAuthed(true)} />
  return <Lists holiday={holiday} onLock={() => { setToken(null); setAuthed(false) }} />
}

type SaveState = "ok" | "busy" | "bad"

function Lists({ holiday, onLock }: { holiday: string; onLock: () => void }) {
  const db = useRef<DB | null>(null)
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("ok")
  const selKey = "gift-sel-" + holiday.toLowerCase()
  const [profId, setProfId] = useState<string | null>(() => {
    try { return JSON.parse(store.get(selKey) || "{}").prof || null } catch { return null }
  })
  const [usage, setUsage] = useState<Usage | null>(null)
  const [session, setSession] = useState(getSession)
  const [usageOpen, setUsageOpen] = useState(false)
  const [editing, setEditing] = useState<Gift | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [addingPerson, setAddingPerson] = useState(false)
  const [draft, setDraft] = useState("")
  const saveTimer = useRef<number | null>(null)
  const queueBusy = useRef(false)
  const alive = useRef(true)

  const cat = () => db.current?.categories.find((c) => sameName(c.name, holiday))

  // Make sure this page's holiday exists in the shared data.
  function ensureCategory() {
    if (!db.current?.categories) db.current = { categories: [] }
    if (!cat()) { db.current.categories.push(newCategory(holiday)); return true }
    return false
  }

  const loadUsage = useCallback(async () => {
    try { setUsage(await api<Usage>("/api/usage")) } catch { /* not critical */ }
  }, [])

  // Saves only this holiday into the latest data, so the other holiday's page can't be overwritten.
  function save() {
    setSaveState("busy")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      saveTimer.current = null
      try {
        const mine = cat()
        const fresh = await api<DB>("/api/data").catch(() => null)
        if (fresh?.categories && mine) {
          const k = fresh.categories.findIndex((c) => c.id === mine.id)
          if (k >= 0) fresh.categories[k] = mine; else fresh.categories.push(mine)
          db.current = fresh
        }
        await api("/api/data", { method: "PUT", body: JSON.stringify(db.current) })
        setSaveState("ok")
      } catch (e) {
        if (!(e instanceof SignedOut)) { setSaveState("bad"); console.error(e) }
      }
    }, 1200)
  }
  const change = (fn: () => void) => { fn(); save(); rerender() }

  const findGift = (id: string) => {
    for (const p of cat()?.profiles || []) { const g = p.items.find((x) => x.id === id); if (g) return { p, g } }
    return null
  }

  // AI synthesis, one gift at a time, done by the server.
  async function runQueue() {
    if (queueBusy.current) return
    queueBusy.current = true
    try {
      for (;;) {
        if (!alive.current) return
        const c = cat()
        let next: { p: { name: string; special: boolean }; g: Gift } | null = null
        for (const p of c?.profiles || []) for (const g of p.items) if (!next && g.status === "processing") next = { p, g }
        if (!next) break
        const who = next.p.special ? "me (my own wishlist)" : `${next.p.name} (${holiday})`
        let result: Partial<Gift> & { error?: string | null }
        try {
          result = await api("/api/synthesize", {
            method: "POST",
            body: JSON.stringify({ input: next.g.sourceUrl || next.g.query, forWhom: who, mode: next.g.mode || "auto" }),
          })
        } catch (e) {
          if (e instanceof SignedOut || !alive.current) return
          result = { error: "Something went wrong: " + (e as Error).message }
        }
        const live = findGift(next.g.id)?.g // may have been deleted meanwhile
        if (live) change(() => Object.assign(live, result, { status: "ready", mode: null }))
        if (result.searched) {
          logSearch(result.name || next.g.name, result.searchQueries)
          setSession(getSession())
          loadUsage()
        }
      }
    } finally {
      queueBusy.current = false
    }
  }

  useEffect(() => {
    alive.current = true
    ;(async () => {
      try {
        db.current = await api<DB>("/api/data")
        if (ensureCategory()) await api("/api/data", { method: "PUT", body: JSON.stringify(db.current) })
        rerender(); runQueue(); loadUsage()
      } catch (e) {
        if (!(e instanceof SignedOut)) setLoadError((e as Error).message)
      }
    })()
    // Pick up changes made on another device when you come back to this tab.
    const onFocus = async () => {
      if (!db.current || saveTimer.current || queueBusy.current) return
      try { const fresh = await api<DB>("/api/data"); if (fresh?.categories) { db.current = fresh; ensureCategory(); rerender() } } catch { /* ignore */ }
    }
    addEventListener("focus", onFocus)
    return () => { alive.current = false; removeEventListener("focus", onFocus) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const c = cat()
  const prof = c?.profiles.find((p) => p.id === profId) || c?.profiles[0]
  const selectProf = (id: string) => { setProfId(id); store.set(selKey, JSON.stringify({ prof: id })) }
  const month = monthFigure(usage)

  function addGift(e: React.FormEvent) {
    e.preventDefault()
    const input = draft.trim()
    if (!input || !prof) return
    const url = asUrl(input)
    change(() => prof.items.unshift({
      id: rid(), sourceUrl: url, query: url ? null : input.slice(0, 500), name: input.slice(0, 80), description: "",
      price: "", image: null, links: [], status: "processing", purchased: false, addedAt: new Date().toISOString(),
    }))
    setDraft("")
    runQueue()
  }

  const header = (
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 px-4 text-sm sm:h-12 sm:flex-nowrap">
        <a href="../" className="py-3 font-semibold tracking-tight whitespace-nowrap sm:py-0">Gift Ideas</a>
        <nav className="order-last flex w-full items-center gap-4 pb-3 sm:order-none sm:w-auto sm:pb-0">
          {HOLIDAYS.map((h) => {
            const hc = db.current?.categories.find((x) => sameName(x.name, h.name))
            const n = hc ? hc.profiles.reduce((s, p) => s + p.items.length, 0) : null
            const active = sameName(h.name, holiday)
            return (
              <a key={h.path} href={`../${h.path}/`} aria-current={active ? "page" : undefined}
                className={cn("transition-colors hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}>
                {h.name}{n != null && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{n}</span>}
              </a>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <span className={cn("hidden text-xs sm:inline", saveState === "bad" ? "text-destructive" : "text-muted-foreground")}>
            {saveState === "busy" ? "Saving…" : saveState === "bad" ? "Couldn't save" : "Saved"}
          </span>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setUsageOpen(true); loadUsage() }}>
            <span className="hidden tabular-nums sm:inline">
              Searches: {fmt(session.q)} session · {fmt(month.n)} month{month.label === "this site" ? " (this site)" : ""}
            </span>
            <span className="tabular-nums sm:hidden">Searches {fmt(session.q)}/{fmt(month.n)}</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onLock}>Lock</Button>
        </div>
      </div>
    </header>
  )

  if (loadError) return <>{header}<p className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">Couldn't load your lists ({loadError}). Reload to try again.</p></>
  if (!c) return <>{header}<p className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">Loading your lists…</p></>

  const total = prof ? prof.items.filter((i) => !i.purchased).reduce((s, i) => s + priceNum(i.price), 0) : 0
  const bought = prof ? prof.items.filter((i) => i.purchased).length : 0

  return (
    <>
      {header}
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {c.profiles.length ? "Pick a person, then add gift ideas." : "Add the people you're shopping for."}
        </p>

        <div className="mt-6 flex items-center gap-2 overflow-x-auto border-b">
          {c.profiles.length > 0 && (
            <Tabs value={prof?.id} onValueChange={selectProf}>
              <TabsList variant="line">
                {c.profiles.map((p) => (
                  <TabsTrigger key={p.id} value={p.id}>
                    {p.name}<span className="text-xs text-muted-foreground tabular-nums">{p.items.length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <Button variant="ghost" size="sm" className="mb-1 shrink-0 text-muted-foreground" onClick={() => setAddingPerson(true)}>
            Add person
          </Button>
        </div>

        {prof && (
          <section className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="flex items-center gap-2 text-base font-medium">
                {prof.special ? "My wishlist" : prof.name}
                {prof.special && <Badge variant="outline">Just for me</Badge>}
              </h2>
              <p className="text-sm text-muted-foreground tabular-nums">
                {prof.items.length} ideas · {bought} bought · about ${Math.round(total).toLocaleString()} left
              </p>
            </div>

            <form onSubmit={addGift} className="mt-4 flex gap-2">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off"
                placeholder="Paste a product link, or describe a gift (e.g. “cozy wool slippers, size 9”)" />
              <Button type="submit" disabled={!draft.trim()}>Add gift</Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              AI finds the product, writes a short description, estimates the price and adds places to buy, in about 5 to 20 seconds.
              Use Find stores on a gift to search the web for the best stores and current prices.
            </p>

            {prof.items.length ? (
              <ul className="mt-6 divide-y border-y">
                {prof.items.map((g) => (
                  <GiftRow key={g.id} gift={g}
                    onToggleBought={() => change(() => { g.purchased = !g.purchased })}
                    onFindStores={() => { change(() => Object.assign(g, { status: "processing", mode: "stores", error: null })); runQueue() }}
                    onEdit={() => setEditing(g)}
                    onRemove={() => setConfirm({
                      title: "Remove this gift?", description: g.name, action: "Remove",
                      run: () => change(() => { prof.items = prof.items.filter((x) => x.id !== g.id) }),
                    })}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-6 border-y py-12 text-center text-sm text-muted-foreground">No gifts yet. Paste a link or describe a gift above.</p>
            )}

            {!prof.special && (
              <Button variant="link" size="sm" className="mt-6 px-0 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirm({
                  title: `Remove ${prof.name}?`, description: `This deletes their ${prof.items.length} gift ideas from ${c.name}.`, action: "Remove",
                  run: () => change(() => { c.profiles = c.profiles.filter((x) => x.id !== prof.id) }),
                })}>
                Remove {prof.name} from this list
              </Button>
            )}
          </section>
        )}
      </main>

      <EditGiftDialog gift={editing} onClose={() => setEditing(null)}
        onRerun={(text) => {
          const g = editing; if (!g) return
          const url = asUrl(text)
          change(() => Object.assign(g, { sourceUrl: url, query: url ? null : text.slice(0, 500), status: "processing", mode: null, error: null }))
          setEditing(null); runQueue()
        }}
        onSave={(fields) => {
          const g = editing; if (!g) return
          change(() => Object.assign(g, fields, { error: null }))
          setEditing(null)
        }}
      />
      <UsageDialog open={usageOpen} onOpenChange={setUsageOpen} usage={usage} session={session} />
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
      <AddPersonDialog open={addingPerson} holiday={c.name} onClose={() => setAddingPerson(false)}
        onAdd={(name) => {
          const p = { id: rid(), name, special: false, items: [] }
          change(() => c.profiles.push(p)); selectProf(p.id); setAddingPerson(false)
        }} />
    </>
  )
}
