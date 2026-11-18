import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { host, type Gift } from "@/lib/gifts"
import { cn } from "@/lib/utils"

type Props = {
  gift: Gift
  onToggleBought: () => void
  onFindStores: () => void
  onEdit: () => void
  onRemove: () => void
}

function Thumb({ gift }: { gift: Gift }) {
  const letter = (gift.name || "").trim()[0]?.toUpperCase() || ""
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = gift.image && failed !== gift.image
  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-medium text-muted-foreground">
      {showImage
        ? <img src={gift.image!} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full bg-white object-contain"
            onError={() => setFailed(gift.image)} />
        : letter}
    </div>
  )
}

export function GiftRow({ gift, onToggleBought, onFindStores, onEdit, onRemove }: Props) {
  if (gift.status === "processing") {
    const what = gift.mode === "stores"
      ? `Searching stores for ${gift.name}`
      : gift.sourceUrl ? `Reading ${host(gift.sourceUrl)}` : `Finding “${gift.query || gift.name}”`
    return (
      <li className="flex items-start gap-4 py-4">
        <Skeleton className="size-12 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-sm text-muted-foreground">{what}…</p>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onRemove}>Remove</Button>
      </li>
    )
  }

  return (
    <li className={cn("flex items-start gap-4 py-4", gift.purchased && "opacity-60")}>
      <Thumb gift={gift} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm font-medium [overflow-wrap:anywhere]", gift.purchased && "line-through")}>{gift.name}</p>
          {gift.purchased && <Badge variant="secondary">Bought</Badge>}
        </div>
        {gift.description && <p className="mt-0.5 text-sm text-muted-foreground">{gift.description}</p>}
        {!!gift.links?.length && (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {gift.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener" className="text-brand hover:underline">
                {l.store || "Store"}{l.price && <span className="ml-1 text-muted-foreground">{l.price}</span>}
              </a>
            ))}
          </div>
        )}
        {gift.error && <p className="mt-1.5 text-xs text-destructive">{gift.error}</p>}
        {gift.searched && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {gift.searchQueries
              ? `${gift.searchQueries} Google search${gift.searchQueries === 1 ? "" : "es"} for this gift`
              : "Searched (Google didn't report how many)"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <div className="pt-0.5 text-right">
          <p className="text-sm font-medium tabular-nums">{gift.price || "—"}</p>
          <p className="text-xs text-muted-foreground">estimated</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Gift actions"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onToggleBought}>{gift.purchased ? "Mark not bought" : "Mark bought"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onFindStores}>Find stores</DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>Remove</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
