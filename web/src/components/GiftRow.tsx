import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { bestLink, host, roundPrice, type Gift } from "@/lib/gifts"
import { cn } from "@/lib/utils"

type Props = {
  gift: Gift
  onToggleBought: () => void
  onEdit: () => void
  onRemove: () => void
}

function Thumb({ gift }: { gift: Gift }) {
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = gift.image && failed !== gift.image
  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-white">
      {showImage && (
        <img src={gift.image!} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain"
          onError={() => setFailed(gift.image)} />
      )}
    </div>
  )
}

export function GiftRow({ gift, onToggleBought, onEdit, onRemove }: Props) {
  if (gift.status === "processing") {
    const what = gift.mode === "stores" ? "Finding stores" : gift.sourceUrl ? host(gift.sourceUrl) : gift.query || gift.name
    return (
      <li className="flex items-center gap-3 py-3">
        <Skeleton className="size-16 shrink-0 rounded-md" />
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{what}…</p>
      </li>
    )
  }

  const link = bestLink(gift)
  const price = roundPrice(link?.price || gift.price)
  return (
    <li className={cn("flex items-center gap-3 py-3", gift.purchased && "opacity-50")}>
      {link ? <a href={link.url} target="_blank" rel="noopener"><Thumb gift={gift} /></a> : <Thumb gift={gift} />}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium [overflow-wrap:anywhere]", gift.purchased && "line-through")}>{gift.name}</p>
        {link && (
          <a href={link.url} target="_blank" rel="noopener" className="text-xs text-brand hover:underline">{link.store || host(link.url)}</a>
        )}
        {gift.error && <p className="mt-1 text-xs text-destructive">{gift.error}</p>}
      </div>
      {price && <span className="shrink-0 text-sm tabular-nums">{price}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Gift actions" className="-mr-2 text-muted-foreground"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onToggleBought}>{gift.purchased ? "Not bought" : "Bought"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
