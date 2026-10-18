/* =====================================================================
   SITE CONFIG — the one place the browser learns which Supabase project
   to talk to. Every page that reads data loads this file: index, store,
   product, about and admin.

   Fill both values in from the owners' Supabase project
   (Dashboard → Project Settings → API; see SETUP.md, step 2).
   Both are PUBLIC values that are safe to ship in client-side code — they
   grant no write access on their own; Row Level Security + Supabase Auth
   decide that.

   The serverless functions in /api do not read this file: they use the
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables set in
   Vercel.
   ===================================================================== */

window.SITE_CONFIG = {
    SUPABASE_URL: "https://ozwydlffpvrcgnhdcjvw.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_wyBLx6NPlR8uk-jC-qyupQ_FeQzE37l",
};
