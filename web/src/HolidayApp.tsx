import { useEffect, useReducer, useRef, useState } from "react"
import { EditGiftDialog } from "@/components/EditGiftDialog"
import { GiftRow } from "@/components/GiftRow"
import { Login } from "@/components/Login"
import { PersonTabs } from "@/components/PersonTabs"
import { AddPersonDialog, ConfirmDialog, type Confirm } from "@/components/SmallDialogs"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SignedOut, api, asUrl, getToken, isMe, newCategory, rid,
  sameName, setSignedOutHandler, store, type DB, type Gift,
} from "@/lib/gifts"

export function HolidayApp({ holiday }: { holiday: string }) {
  const [authed, setAuthed] = useState(!!getToken())
  useEffect(() => setSignedOutHandler(() => setAuthed(false)), [])
  if (!authed) return <Login title={holiday} onUnlock={() => setAuthed(true)} />
  return <Lists holiday={holiday} />
}

type SaveState = "ok" | "busy" | "bad"

function Lists({ holiday }: { holiday: string }) {
  const db = useRef<DB | null>(null)
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("ok")
  const selKey = "gift-sel-" + holiday.toLowerCase()
  const [profId, setProfId] = useState<string | null>(() => {
    try { return JSON.parse(store.get(selKey) || "{}").prof || null } catch { return null }
  })
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
        const who = isMe(next.p) ? "me (my own wishlist)" : `${next.p.name} (${holiday})`
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
        rerender(); runQueue()
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
    <header className="flex items-baseline gap-4">
      <h1 className="text-xl font-semibold tracking-tight">{holiday}</h1>
      <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
        {saveState === "bad" && <span className="text-destructive">Couldn't save</span>}
        <a href="../" className="hover:text-foreground">Gift Ideas</a>
      </div>
    </header>
  )

  const shell = (body: React.ReactNode) => <main className="mx-auto max-w-2xl px-4 pt-8 pb-16">{header}{body}</main>

  if (loadError) return shell(<p className="mt-8 text-sm text-muted-foreground">Couldn't load ({loadError}). Reload to try again.</p>)
  if (!c) return shell(null)

  return (
    <>
      {shell(<>
        <div className="mt-4 flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]">
          {c.profiles.length > 0 && (
            <PersonTabs profiles={c.profiles} value={prof?.id} onSelect={selectProf}
              onReorder={(ids) => change(() => {
                c.profiles = ids.map((id) => c.profiles.find((p) => p.id === id)!).filter(Boolean)
              })} />
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Add person" className="mb-1 shrink-0 text-muted-foreground"
            onClick={() => setAddingPerson(true)}><Plus /></Button>
        </div>

        {prof && (
          <>
            <form onSubmit={addGift} className="mt-5">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" enterKeyHint="go"
                placeholder="Paste a link or describe a gift" />
            </form>
            {prof.items.length > 0 && (
              <ul className="mt-3 divide-y">
                {prof.items.map((g) => (
                  <GiftRow key={g.id} gift={g}
                    onToggleBought={() => change(() => { g.purchased = !g.purchased })}
                    onEdit={() => setEditing(g)}
                    onRemove={() => setConfirm({
                      title: "Remove this gift?", description: g.name, action: "Remove",
                      run: () => change(() => { prof.items = prof.items.filter((x) => x.id !== g.id) }),
                    })}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </>)}

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
      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
      <AddPersonDialog open={addingPerson} onClose={() => setAddingPerson(false)}
        onAdd={(name) => {
          const p = { id: rid(), name, special: sameName(name, "me"), items: [] }
          change(() => c.profiles.push(p)); selectProf(p.id); setAddingPerson(false)
        }} />
    </>
  )
}
