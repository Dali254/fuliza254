# Fertilizer Program — M-Pesa payments (cPanel or Vercel)

A farmer picks a plan, a popup collects their ID + M-Pesa number, they pay with an
M-Pesa STK push (via PayHero), and on confirmed payment the request is recorded
with a "wait 24 hours" message.

One Express app (`app.js`) powers everything and runs on **both** cPanel and Vercel.

## Files

```
index.html      The page (modern UI, popup, real payments). Editable block at the top.
app.js          The server: serves the page + the PayHero endpoints. Runs everywhere.
lib/plans.js    The prices (edit here). The server uses these so amounts can't be faked.
lib/store.js    Remembers payment status. In memory by default; Redis only on Vercel.
api/index.js    Vercel entry point (re-exports app.js). Not used on cPanel.
vercel.json     Vercel routing.
package.json    Dependencies: express (+ @upstash/redis, only used on Vercel).
.env.example    The environment variables to set.
```

## Preview the look (no setup)

Open `index.html` and temporarily set `DEMO_MODE = true` near the top to walk the
whole flow without a server. Set it back to `false` for real payments.

---

## Option A — cPanel ("Setup Node.js App")

1. Upload this folder to your account (e.g. into a folder under your home dir).
2. cPanel → **Setup Node.js App** → **Create Application**:
   - **Node.js version:** 18 or newer.
   - **Application root:** the folder you uploaded.
   - **Application startup file:** `app.js`
   - **Application URL:** your domain or subdomain root (so `/api/...` resolves).
3. In that same screen, add **Environment Variables**:
   - `PAYHERO_AUTH` (keep the word `Basic ` in front)
   - `PAYHERO_CHANNEL_ID`
   - `PAYHERO_CALLBACK_URL` = `https://yourdomain.com/api/callback`
   - (No Redis needed here.)
4. Click **Run NPM Install**, then **Start** (or Restart) the app.

That's it. The app serves the page and handles payments from one process, and keeps
payment status in memory — no database required.

## Option B — Vercel

1. Create a free **Upstash Redis** database (or add **Vercel KV**) — serverless needs
   a shared store. You get a REST URL + token.
2. Push this folder to GitHub and import it into Vercel.
3. Set Environment Variables (see `.env.example`): the three `PAYHERO_*` values plus
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   (Vercel KV uses `KV_REST_API_URL` / `KV_REST_API_TOKEN` — also supported).
   Set `PAYHERO_CALLBACK_URL` to `https://your-app.vercel.app/api/callback`.
4. Deploy.

---

## Changing prices

Edit `lib/plans.js`. That single list is what the server charges and what the page
shows, so they can't disagree.

## Changing the background

Edit `HERO_IMAGE` near the top of `index.html` — any image URL (or a file you add
to the folder). A green gradient shows underneath if the image fails to load.

## Notes

- Needs Node 18+ (built-in `fetch`). On cPanel, pick Node 18+ in the version dropdown.
- The callback URL must be reachable from the internet. On both cPanel (your domain)
  and Vercel (your deployment URL) it already is — no tunneling.
- Each farmer's confirmed requests also persist in their own browser (localStorage).
  For a permanent record of all requests, add a database write in the `/api/callback`
  handler inside `app.js`.
