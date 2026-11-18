import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ago, fmt, money, type SessionLog, type Usage } from "@/lib/gifts"

export function monthFigure(usage: Usage | null) {
  const a = usage?.account
  if (a?.connected && !a.error) return { n: a.searches || 0, label: "account" }
  return { n: usage?.siteMonth?.q || 0, label: "this site" }
}

type Props = { open: boolean; onOpenChange: (o: boolean) => void; usage: Usage | null; session: SessionLog }

export function UsageDialog({ open, onOpenChange, usage, session }: Props) {
  const u = usage || {}, a = u.account || {}
  const monthName = new Date().toLocaleString("en-US", { month: "long" })
  const month = monthFigure(usage)
  const free = u.freeMonthly || 5000

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Search usage</DialogTitle>
          <DialogDescription>
            {u.searchOn ? "Live Google Search is on." : "Live search is off right now (billing not on, or Google refused it), so gifts use the free mode."}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">This session: {fmt(session.q)} search{session.q === 1 ? "" : "es"}</h3>
          {session.log.length ? (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Gift</TableHead><TableHead className="text-right">Searches</TableHead><TableHead className="text-right">When</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {session.log.map((e, k) => (
                  <TableRow key={k}>
                    <TableCell className="max-w-56 truncate">{e.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.q ? fmt(e.q) : "?"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No searches yet this session.</p>}
        </section>

        <Separator />

        <section className="space-y-2">
          <h3 className="text-sm font-medium">{monthName}, whole Google account</h3>
          {!a.connected ? (
            <p className="text-sm text-muted-foreground">
              Account-wide numbers aren't connected yet (they come from Google Cloud's billing export). Showing this site only.
            </p>
          ) : a.error ? (
            <p className="text-sm text-destructive">Couldn't read Google's billing data: {a.error}</p>
          ) : (
            <>
              <Table>
                <TableBody>
                  <TableRow><TableCell>Google searches (all projects)</TableCell><TableCell className="text-right tabular-nums">{fmt(a.searches)}{a.unit && !/request|count/i.test(a.unit) ? ` ${a.unit}` : ""}</TableCell></TableRow>
                  <TableRow><TableCell>Search cost after free allowance</TableCell><TableCell className="text-right tabular-nums">{money(a.searchCost, a.currency)}</TableCell></TableRow>
                  <TableRow><TableCell>All Gemini cost after credits</TableCell><TableCell className="text-right tabular-nums">{money(a.geminiCost, a.currency)}</TableCell></TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Google's data last updated {ago(a.asOf)} (it lags a few hours to a day). Checked {ago(a.checkedAt)}; refreshes hourly.
              </p>
            </>
          )}
          <p className="text-sm text-muted-foreground">This site in {monthName} (instant): {fmt(u.siteMonth?.q)} searches</p>
        </section>

        <section className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Free monthly searches used</span>
            <span className="tabular-nums">{fmt(month.n)} of {fmt(free)}</span>
          </div>
          <Progress value={Math.min(100, (month.n / free) * 100)} />
        </section>
      </DialogContent>
    </Dialog>
  )
}
