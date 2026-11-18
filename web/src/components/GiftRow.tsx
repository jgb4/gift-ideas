import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { host, roundPrice, type Gift } from "@/lib/gifts"
import { cn } from "@/lib/utils"

type Props = {
  gift: Gift
  onToggleBought: () => void
  onFindStores: () => void
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

export function GiftRow({ gift, onToggleBought, onFindStores, onEdit, onRemove }: Props) {
  if (gift.status === "processing") {
    const what = gift.mode === "stores" ? "Finding stores" : gift.sourceUrl ? host(gift.sourceUrl) : gift.query || gift.name
    return (
      <li className="flex items-center gap-3 py-3">
        <Skeleton className="size-16 shrink-0 rounded-md" />
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{what}…</p>
      </li>
    )
  }

  // Search-result pages (Amazon/Google search) aren't real stores; hide them.
  const links = (gift.links || []).filter((l) => !/amazon\.com\/s\?|google\.com\/search/.test(l.url))
  const price = roundPrice(gift.price)
  const main = gift.sourceUrl || links[0]?.url
  return (
    <li className={cn("flex items-start gap-3 py-3", gift.purchased && "opacity-50")}>
      {main ? <a href={main} target="_blank" rel="noopener"><Thumb gift={gift} /></a> : <Thumb gift={gift} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className={cn("min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]", gift.purchased && "line-through")}>{gift.name}</p>
          {price && <span className="shrink-0 text-sm tabular-nums">{price}</span>}
        </div>
        {gift.description && <p className="mt-0.5 truncate text-sm text-muted-foreground">{gift.description}</p>}
        {!!links.length && (
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener" className="text-brand hover:underline">
                {l.store || host(l.url)}{l.price && roundPrice(l.price) !== price && <span className="ml-1 text-muted-foreground">{roundPrice(l.price)}</span>}
              </a>
            ))}
          </div>
        )}
        {gift.error && <p className="mt-1 text-xs text-destructive">{gift.error}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Gift actions" className="-mr-2 text-muted-foreground"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onToggleBought}>{gift.purchased ? "Not bought" : "Bought"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onFindStores}>Find stores</DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
