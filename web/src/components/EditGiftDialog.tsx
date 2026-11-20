import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { asUrl, bestLink, host, type Gift } from "@/lib/gifts"

type Props = {
  gift: Gift | null
  onClose: () => void
  onRerun: (request: string) => void
  onSave: (fields: Pick<Gift, "name" | "price" | "links">) => void
}

export function EditGiftDialog({ gift, onClose, onRerun, onSave }: Props) {
  const [f, setF] = useState({ request: "", name: "", price: "", link: "" })
  useEffect(() => {
    if (!gift) return
    setF({
      request: gift.sourceUrl || gift.query || gift.name || "",
      name: gift.name || "", price: bestLink(gift)?.price || gift.price || "", link: bestLink(gift)?.url || "",
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
            Regenerate
          </Button>
        </div>

        <Separator />

        <form id="edit-gift" className="grid gap-3" onSubmit={(e) => {
          e.preventDefault()
          const url = asUrl(f.link.trim())
          const store = url && gift ? bestLink(gift)?.url === url ? bestLink(gift)!.store : host(url) : ""
          onSave({ name: f.name, price: f.price, links: url ? [{ store, url, price: f.price }] : [] })
        }}>
          <div className="grid gap-1.5"><Label htmlFor="e-name">Name</Label><Input id="e-name" value={f.name} onChange={set("name")} /></div>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="grid gap-1.5"><Label htmlFor="e-price">Price</Label><Input id="e-price" placeholder="$49" value={f.price} onChange={set("price")} /></div>
            <div className="grid gap-1.5"><Label htmlFor="e-link">Link</Label><Input id="e-link" value={f.link} onChange={set("link")} /></div>
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
