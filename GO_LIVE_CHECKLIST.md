# Go-live checklist

Condensed version — full detail with explanations in `SETUP.md`.

1. **Supabase** ([supabase.com](https://supabase.com)) — new project, region
   **Frankfurt**. Open SQL Editor, paste & run `supabase/schema.sql`. This
   creates your tables and a sample product.

2. **Connect the frontend** — Supabase → Settings → API → copy Project URL
   + anon key → paste into `js/config.js`.

3. **Create your admin login** — Supabase → Authentication → Users → Add
   user (your email + a password, toggle Auto Confirm). That's your login
   for `admin/login.html`.

4. **Resend** ([resend.com](https://resend.com)) — free account, grab an
   API key. For sending email you can use `onboarding@resend.dev`
   immediately, or verify your own domain later — no code change needed
   either way.

5. **Deploy to Vercel** — push this folder to GitHub and import it in
   Vercel (or run `npx vercel` from inside the folder). Then in Vercel →
   Settings → Environment Variables, add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `OWNER_EMAIL`
   - `FROM_EMAIL`

   (values explained in `.env.example`)

6. **Test it** — place a test order on a live product page, confirm the
   email lands, confirm it shows up in the admin Orders tab.

7. **Point your domain at it** in Vercel → Settings → Domains, whenever
   it's ready.

The one thing that genuinely can't be filled in ahead of time: the **owner
email address** for order notifications — that goes in `OWNER_EMAIL` at
step 5. Everything else is mechanical.
