import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { HolidayApp } from "./HolidayApp"
import { HOLIDAYS } from "@/lib/gifts"

function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Gift Ideas</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pick a holiday.</p>
      <ul className="mt-6 divide-y border-y">
        {HOLIDAYS.map((h) => (
          <li key={h.path}>
            <a href={`${h.path}/`} className="block py-3 text-sm font-medium hover:text-brand">
              {h.name}
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}

const { page, holiday } = document.body.dataset
createRoot(document.getElementById("root")!).render(
  <StrictMode>{page === "holiday" && holiday ? <HolidayApp holiday={holiday} /> : <Home />}</StrictMode>,
)
