# Backend setup — read this first

I built out the full backend overnight: database schema, the live product
catalog wiring, the order → email flow, the admin panel, and the GDPR
privacy page. Everything is in this folder. None of it is "live" yet because
it needs your accounts/keys — that's a ~30–45 minute job, all clicking
through dashboards, no coding. Steps below, in order.

## What's here

```
index.html, store.html, product.html, contact.html, privacy.html   ← public site
admin/login.html, admin/dashboard.html                              ← admin panel
api/create-order.js                                                 ← serverless function (order email)
js/config.js, js/supabase-client.js, js/catalog.js                  ← frontend ↔ Supabase glue
supabase/schema.sql                                                 ← run this once in Supabase
package.json, vercel.json, .env.example, .gitignore
```

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → New project.
2. **Region: choose Frankfurt (EU Central)** — required for GDPR data residency, per the project brief.
3. Set a strong database password and save it somewhere safe.
4. Once the project is ready: open **SQL Editor → New query**, paste the
   entire contents of `supabase/schema.sql`, and click **Run**. This creates
   the `products` and `orders` tables, locks them down with Row Level
   Security, creates the `product-images` storage bucket, and adds two
   sample products so you can see the catalog working immediately.

## 2. Connect the frontend to Supabase

1. In Supabase: **Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `js/config.js` in this folder and paste them in:
   ```js
   window.SITE_CONFIG = {
       SUPABASE_URL: "https://xxxxxxxx.supabase.co",
       SUPABASE_ANON_KEY: "eyJ...",
   };
   ```
4. Save. That's it — `store.html` and `product.html` will now load real
   products instead of the old mock data.

## 3. Create your admin login

The admin panel (`admin/login.html`) only works for accounts that already
exist in Supabase — there's no public sign-up, which is exactly what you
want (only you should be able to manage products).

1. Supabase → **Authentication → Users → Add user**.
2. Enter your email + a password, and toggle **Auto Confirm User** on.
3. Open `admin/login.html` (locally or once deployed) and sign in.
4. From the dashboard you can add/edit/delete products, upload photos
   (drag in multiple files — the first one becomes the catalog thumbnail),
   set a discount price, and change status (available / reserved / sold /
   hidden). There's also an **Orders** tab showing every order that's come
   in, with a status dropdown (new → contacted → confirmed/cancelled).
5. Delete the two sample products once you've added real inventory.

## 4. Set up Resend (order emails)

1. Create a free account at [resend.com](https://resend.com) (3,000
   emails/month free — plenty for this volume).
2. **API Keys → Create API key** — copy it.
3. For the **From** address: either verify your own domain in Resend
   (Domains → Add Domain, then add the DNS records they give you at your
   domain registrar), or for now use `onboarding@resend.dev` as `FROM_EMAIL`
   to get started immediately — switch to your real domain whenever it's
   convenient, no code changes needed.

## 5. Deploy to Vercel

1. Push this whole folder to a GitHub repo (or use the Vercel CLI: `npx vercel`
   from inside this folder — it'll prompt you to log in and create a
   project).
2. In the Vercel dashboard for the new project, go to **Settings →
   Environment Variables** and add these (see `.env.example` for the full
   list with comments):

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | same as in `js/config.js` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key (**secret**, never put this in `js/config.js`) |
   | `RESEND_API_KEY` | from step 4 |
   | `OWNER_EMAIL` | **the email address that should receive new-order notifications — I didn't have this, see Open Items below** |
   | `FROM_EMAIL` | `onboarding@resend.dev` or your verified sender |
   | `SEND_CUSTOMER_CONFIRMATION` | `true` (optional — sends the customer a confirmation email too; set to `false` to skip) |

3. Deploy. Vercel auto-detects `api/create-order.js` as a serverless
   function — no extra config needed.
4. Once deployed, test the full flow: open a product page on the live URL,
   submit a test order, confirm you get the email, and check it shows up
   under the Orders tab in the admin panel with the product automatically
   flipped to "reserved".
5. Add your custom domain under **Settings → Domains** whenever it's ready.

## What I changed / built (so review goes faster)

- **Replaced the hardcoded mock product array** in `store.html` with a live
  fetch from Supabase. Brand filter options now populate dynamically from
  whatever's actually in your inventory.
- **Fixed `product.html`** to load the correct product by ID from the URL
  (`product.html?id=...`) instead of always showing the same Prada jacket —
  this was previously a static mockup with no real per-product linking.
  Gallery, price, description, and the accordion (size/measurements,
  color/material, tags, authenticity) are all built from real data now.
- **Wired the order form to a real backend.** Submitting now calls
  `/api/create-order`, which re-validates everything server-side (never
  trusts client-submitted price), logs the order in Supabase, marks the
  product "reserved" so it can't be double-sold, and emails you via Resend
  — matching the "reserve for 24 hours" copy that was already in the UI.
- **Built the full admin panel** (`admin/login.html` + `admin/dashboard.html`):
  Supabase-Auth-gated, product CRUD with multi-photo upload to Storage,
  discount pricing, tags, status, and an orders log.
- **Wrote `privacy.html`** — GDPR-compliant policy in Bulgarian, linked from
  the order form's consent checkbox (the checkbox already existed in the
  template; the page it linked to didn't).
- **Fixed broken asset paths**: `logo.jpeg` and `bazar-promo.png` were
  referenced in the HTML but didn't exist anywhere in the project — I found
  them among the uploaded files (just oddly named) and restored them to the
  right filenames/location.
- **Database schema** (`supabase/schema.sql`): products (with discount
  price, tags, multi-image, condition, measurements, status) and orders,
  with Row Level Security so the public can only read non-hidden products,
  only you (logged in) can write products, and orders can only be created
  by the serverless function (service role) — never directly from the
  browser.

## Open items I couldn't resolve myself (need your input)

These were already flagged as open in the project knowledgebase and still
need a decision from you or the client:

1. **Owner notification email address** — I used a placeholder
   (`owner@example.com`) in `.env.example`. Set the real one in Vercel's
   `OWNER_EMAIL` variable (comma-separate if more than one person should
   get order emails).
2. **Domain + final hosting choice** — I built everything assuming Vercel
   (matches the agreed stack and has zero-config serverless functions).
   Netlify would work too but needs minor adjustments to `vercel.json`'s
   equivalent. Let me know if you want to switch.
3. **Product categories** — I kept the 9 categories already in the
   store.html filter UI (jackets, dresses, tops, jeans, shoes, accessories,
   bags, knitwear, skirts). Add/remove from the `<select id="f_category">`
   in `admin/dashboard.html` and the matching filter in `store.html` if the
   real catalog needs different ones.
4. **Visual design** — untouched, used exactly what was already built.
5. **Privacy policy placeholders** — `privacy.html` has two
   `[бракети]`-style placeholders (business/owner name + contact email) you
   should fill in before going live — search the file for `[`.

## A note on the sample data

`schema.sql` inserts 2 placeholder products (a Prada jacket, a Chanel bag)
so you can confirm the catalog renders before you've added real inventory.
Delete them from the admin panel once you've got real products in.
