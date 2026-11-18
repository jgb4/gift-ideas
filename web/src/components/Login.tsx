import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, setToken } from "@/lib/gifts"

export function Login({ title, onUnlock }: { title: string; onUnlock: () => void }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError("")
    try {
      const r = await api<{ token: string }>("/api/login", { method: "POST", body: JSON.stringify({ password }) })
      setToken(r.token)
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
        <h1 className="text-center text-xl font-semibold tracking-tight">{title}</h1>
        <Input type="password" placeholder="Password" autoComplete="current-password" autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? "Opening…" : "Open"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </main>
  )
}
