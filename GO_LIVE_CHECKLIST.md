# Go-live checklist

Short version — details in `SETUP.md`.

1. **Supabase**: new project under the owners' account, region **Frankfurt**.
   SQL Editor → run all of `supabase/schema.sql`.
2. **Admin users**: Authentication → Users → Add user (Auto Confirm), then
   `insert into public.admins (user_id) select id from auth.users where email = '…';`
   Turn off "Allow new users to sign up".
3. **`js/config.js`**: Project URL + publishable key.
4. **Resend**: API key; verified sender or `onboarding@resend.dev`.
5. **Vercel env vars**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `RESEND_API_KEY`, `OWNER_EMAIL`, `FROM_EMAIL`, `SITE_URL`. Redeploy.
6. **Test**: a product, an event, gallery photos, a test order, a contact
   message.
7. **Domain**: Vercel → Settings → Domains.
