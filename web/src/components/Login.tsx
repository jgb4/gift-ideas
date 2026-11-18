import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, setToken } from "@/lib/gifts"

export function Login({ title, onUnlock }: { title: string; onUnlock: () => void }) {
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError("")
    try {
      const r = await api<{ token: string }>("/api/login", { method: "POST", body: JSON.stringify({ password }) })
      setToken(r.token, remember)
      onUnlock()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">This list is private. Enter the password.</p>
        </div>
        <Input type="password" placeholder="Password" autoComplete="current-password" autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-center gap-2">
          <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
          <Label htmlFor="remember" className="font-normal text-muted-foreground">Remember this device</Label>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? "Unlocking…" : "Unlock"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </main>
  )
}
