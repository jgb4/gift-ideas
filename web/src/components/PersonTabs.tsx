import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "cn"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isMe, type Profile } from "@/lib/gifts"

type Press = {
  id: string; pointerId: number; x: number; y: number
  touch: boolean; timer: number | null; dragging: boolean
}

// The person tabs. Drag one to reorder (mouse: just drag; touch: press and hold, then drag;
// keyboard: Alt + arrow keys). "Me" gets a small dot.
export function PersonTabs({ profiles, value, onSelect, onReorder }: {
  profiles: Profile[]
  value?: string
  onSelect: (id: string) => void
  onReorder: (ids: string[]) => void
}) {
  const [order, setOrder] = useState<string[] | null>(null) // live order while dragging
  const [dragId, setDragId] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const press = useRef<Press | null>(null)
  const before = useRef<Map<string, number> | null>(null)
  const latest = useRef<string[] | null>(null) // same as `order`, readable without waiting for a render

  const ids = order || profiles.map((p) => p.id)
  const byId = new Map(profiles.map((p) => [p.id, p]))

  // Remember where each tab sits so the move can be animated after the next render.
  const snapshot = () => { before.current = new Map([...els.current].map(([id, el]) => [id, el.offsetLeft])) }

  // Slide tabs from where they were to where they are now.
  useLayoutEffect(() => {
    const prev = before.current; before.current = null
    if (!prev) return
    for (const [id, el] of els.current) {
      const dx = (prev.get(id) ?? el.offsetLeft) - el.offsetLeft
      if (dx) el.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 160, easing: "cubic-bezier(.2,.8,.2,1)" })
    }
  })

  // While a touch drag is on, stop the page and the tab strip from scrolling.
  useEffect(() => {
    const block = (e: TouchEvent) => { if (press.current?.dragging) e.preventDefault() }
    document.addEventListener("touchmove", block, { passive: false })
    return () => document.removeEventListener("touchmove", block)
  }, [])

  const startDrag = () => {
    const p = press.current; if (!p) return
    p.dragging = true
    try { els.current.get(p.id)?.setPointerCapture(p.pointerId) } catch { /* pointer already gone */ }
    latest.current = profiles.map((x) => x.id)
    setDragId(p.id); setOrder(latest.current)
    navigator.vibrate?.(10)
  }

  const end = () => {
    const p = press.current; press.current = null
    if (p?.timer) clearTimeout(p.timer)
    const final = latest.current; latest.current = null
    if (p?.dragging && final && final.join() !== profiles.map((x) => x.id).join()) onReorder(final)
    setDragId(null); setOrder(null)
  }

  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 || profiles.length < 2) return
    const touch = e.pointerType !== "mouse"
    press.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch, timer: null, dragging: false }
    if (touch) press.current.timer = window.setTimeout(startDrag, 280)
    else try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ } // keep getting moves after a fast flick off the tab
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current
    if (!p || e.pointerId !== p.pointerId) return
    const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
    if (!p.dragging) {
      if (p.touch) { if (moved > 8) end() } // moving before the hold means scrolling
      else if (moved > 5) startDrag()
      if (!p.dragging) return
    }
    // Slot = how many of the other tabs sit left of the pointer.
    const cur = latest.current || profiles.map((x) => x.id)
    const box = list.current?.getBoundingClientRect(); if (!box) return
    const x = e.clientX - box.left
    const others = cur.filter((id) => id !== p.id)
    const slot = others.filter((id) => { const el = els.current.get(id); return el && el.offsetLeft + el.offsetWidth / 2 < x }).length
    const next = [...others.slice(0, slot), p.id, ...others.slice(slot)]
    if (next.join() !== cur.join()) { snapshot(); setOrder(next); latest.current = next }
  }

  const onKeyDown = (id: string) => (e: React.KeyboardEvent) => {
    if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return
    e.preventDefault()
    const cur = profiles.map((x) => x.id), i = cur.indexOf(id), j = i + (e.key === "ArrowLeft" ? -1 : 1)
    if (j < 0 || j >= cur.length) return
    ;[cur[i], cur[j]] = [cur[j], cur[i]]
    snapshot(); onReorder(cur)
    requestAnimationFrame(() => els.current.get(id)?.focus())
  }

  return (
    <Tabs value={value} onValueChange={onSelect}>
      <TabsList variant="line" ref={list} className="relative">
        {/* DOM order stays put while dragging (moving the node would drop the pointer); `order` places it. */}
        {profiles.map(({ id }) => {
          const p = byId.get(id)!
          return (
            <TabsTrigger key={id} value={id} style={{ order: ids.indexOf(id) }}
              ref={(el) => { if (el) els.current.set(id, el); else els.current.delete(id) }}
              onPointerDown={onPointerDown(id)} onPointerMove={onPointerMove}
              onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => press.current?.dragging && end()}
              onKeyDown={onKeyDown(id)} onContextMenu={(e) => press.current?.touch && e.preventDefault()}
              aria-roledescription="draggable tab"
              className={cn(
                "select-none [-webkit-touch-callout:none] focus-visible:border-transparent focus-visible:text-foreground focus-visible:ring-0 focus-visible:outline-none",
                dragId === id && "cursor-grabbing opacity-50",
              )}>
              {p.name}
              {isMe(p) && <span aria-hidden className="size-1 rounded-full bg-foreground/40" />}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
