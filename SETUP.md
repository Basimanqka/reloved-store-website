# Setup — moving the site onto the owners' own Supabase project

The site is static HTML on Vercel, with Supabase for data, photos and the admin
login, and two Vercel functions in `/api` for orders and contact messages.
Setting it up on a fresh Supabase project the owners own takes about 30
minutes of clicking, no code.

## What's where

```
index.html            home: hero, "new on the rail" with the size picker, events block, story
about.html            "За нас": the shop story + photo gallery (photos come from the admin panel)
store.html            catalogue with filters (store.html?size=M&cat=outerwear presets them)
product.html          one piece; served as /p/<id> by api/product.js with proper meta tags
contact.html          contact details, map, message form
terms / withdrawal / privacy / cookies .html   legal pages (styles in legal.css)
admin.html            the admin panel: products, orders, events, gallery

css/site.css          palette, type, navbar, footer, buttons — shared by every public page
js/site.js            mobile menu + scroll reveals — shared by every public page
js/config.js          the Supabase URL + public key the browser uses   ← edit in step 2
js/data.js            small fetch helpers for index / about / store / product
img/                  shop photos and the cropped logo

api/create-order.js           order → database → email (Resend)
api/send-contact-message.js   contact form → email (Resend)
api/product.js, api/sitemap.js   /p/<id> pages and /sitemap.xml

supabase/schema.sql   the whole database in one file   ← run in step 1
```

## 1. Create the Supabase project

1. [supabase.com](https://supabase.com) → **New project**, under the owners'
   own account. **Region: Frankfurt (EU Central)** — required for GDPR.
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
   It creates the tables (products, orders, events, gallery_photos, admins,
   rate_limits), the security rules, the `check_rate_limit` function the API
   uses, and the two public photo buckets (`product-images`, `site-media`).
   It is safe to run again.
3. **Authentication → Users → Add user**: the owner's email + a password,
   with **Auto Confirm User** on. Repeat for each person who should use the
   admin panel.
4. Make those users admins — being logged in is not enough to change
   anything. In the SQL Editor, once per person:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'owner@example.com';
   ```
5. **Authentication → Sign In / Providers → Email**: turn off
   **Allow new users to sign up**. Nobody needs to register on this site.

## 2. Point the website at it

1. Supabase → **Project Settings → API**: copy the **Project URL** and the
   **publishable (anon) key**.
2. Paste both into `js/config.js`. These are public values; Row Level
   Security decides what they can do.

## 3. Resend (order and contact emails)

1. Free account at [resend.com](https://resend.com) → **API Keys → Create**.
2. For the sender, verify the shop's domain in Resend (Domains → Add
   Domain, then the DNS records it shows), or start with
   `onboarding@resend.dev`.

## 4. Vercel environment variables

Vercel → the project → **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | same as in `js/config.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` (**secret**, never in `js/config.js`) |
| `RESEND_API_KEY` | from step 3 |
| `OWNER_EMAIL` | who gets new orders and messages; comma-separate several |
| `FROM_EMAIL` | the verified sender, or `onboarding@resend.dev` |
| `SITE_URL` | `https://www.zakachalkata.com` (no trailing slash) |
| `SEND_CUSTOMER_CONFIRMATION` | `true` (default) or `false` |
| `TURNSTILE_SECRET_KEY` | optional captcha; also set `TURNSTILE_SITE_KEY` in `product.html` |

Redeploy after changing them.

## 5. Check it end to end

1. Log in at `/admin.html`, add a product with photos. It appears on the
   home page rail and in the store.
2. **Събития** tab: add an event with a photo. It shows on the home page in
   the fig-coloured block (up to 3, in the order set with the arrows).
   A post with a date disappears by itself the day after; unpublished posts
   never show; with nothing published the block is not shown at all.
3. **Галерия** tab: drop in a few shop photos and give each a caption.
   They appear on `/about.html`, and the first 7 rotate in the frame on the
   home page.
4. Place a test order on a product page: the email arrives, the order is in
   the **Поръчки** tab with its product, and the piece is marked sold.
5. Send a test message from `/contact.html`.

## Things the owners may want to change later

- **Opening hours and address** are written in `about.html` and
  `contact.html` (search for `Юрий Венелин`).
- **The About text** is fixed in `about.html`; it was drafted from what the
  site already said. Read it once and correct anything that is not quite
  right.
- **Hero photo**: `img/shop-rail.jpg` (portrait crop of the shop photo).
  Replace the file with another portrait photo of the same name to change it.
