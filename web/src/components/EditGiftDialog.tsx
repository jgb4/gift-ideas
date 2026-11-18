import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { parseLinks, type Gift } from "@/lib/gifts"

type Props = {
  gift: Gift | null
  onClose: () => void
  onRerun: (request: string) => void
  onSave: (fields: Pick<Gift, "name" | "description" | "price" | "image" | "links">) => void
}

export function EditGiftDialog({ gift, onClose, onRerun, onSave }: Props) {
  const [f, setF] = useState({ request: "", name: "", description: "", price: "", image: "", links: "" })
  useEffect(() => {
    if (!gift) return
    setF({
      request: gift.sourceUrl || gift.query || gift.name || "",
      name: gift.name || "", description: gift.description || "", price: gift.price || "", image: gift.image || "",
      links: (gift.links || []).map((l) => `${l.store} | ${l.url}`).join("\n"),
    })
  }, [gift])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }))

  return (
    <Dialog open={!!gift} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit gift</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="e-request">Link or description</Label>
          <Textarea id="e-request" rows={2} value={f.request} onChange={set("request")} placeholder="A link or a description" />
          <Button variant="secondary" size="sm" disabled={!f.request.trim()} onClick={() => onRerun(f.request.trim())}>
            Redo with AI
          </Button>
        </div>

        <Separator />

        <form id="edit-gift" className="grid gap-3" onSubmit={(e) => {
          e.preventDefault()
          onSave({ name: f.name, description: f.description, price: f.price, image: f.image || null, links: parseLinks(f.links) })
        }}>
          <div className="grid gap-1.5"><Label htmlFor="e-name">Name</Label><Input id="e-name" value={f.name} onChange={set("name")} /></div>
          <div className="grid gap-1.5"><Label htmlFor="e-desc">Description</Label><Textarea id="e-desc" rows={2} value={f.description} onChange={set("description")} /></div>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="grid gap-1.5"><Label htmlFor="e-price">Price</Label><Input id="e-price" placeholder="$49" value={f.price} onChange={set("price")} /></div>
            <div className="grid gap-1.5"><Label htmlFor="e-image">Image URL</Label><Input id="e-image" value={f.image} onChange={set("image")} /></div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="e-links">Links</Label>
            <Textarea id="e-links" rows={3} value={f.links} onChange={set("links")} placeholder="Store | URL (one per line)" className="font-mono text-xs" />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-gift">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
