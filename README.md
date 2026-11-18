# Gift Ideas

A private gift-shopping list. Paste a product link or describe a gift; AI (Google Gemini, free tier)
finds the product, writes a short description, estimates the price and adds places to buy.

- `web/`: the site's source (React, Tailwind, shadcn/ui). `cd web && npm install && npm run build`
  writes the built pages (`index.html`, `hanukkah/`, `birthdays/`, `assets/`) to the repo root, which GitHub Pages serves.
- `worker/`: a Cloudflare Worker that checks the password, stores the lists (Workers KV) and calls Gemini.
  Secrets live in Cloudflare, never in this repo.

## Deploy the worker
    cd worker
    npx wrangler login
    npx wrangler kv namespace create GIFTS     # put the id in wrangler.toml
    npx wrangler deploy
    npx wrangler secret put GEMINI_API_KEY     # from aistudio.google.com/apikey
    npx wrangler secret put PW_SALT / PW_HASH / SESSION_SECRET

On the Gemini free tier there is no live Google Search, so store links are Amazon / Google Shopping
searches plus any verified product page. With billing on, live search turns on automatically.
