/* =====================================================================
   Shared Supabase browser client.
   Loaded after the Supabase UMD bundle + js/config.js on every page that
   needs database access (store.html, product.html, admin/*).
   ===================================================================== */

(function () {
    if (!window.supabase) {
        console.error(
            "[supabase-client] Supabase library not found. Make sure the " +
            "CDN script tag is included before js/supabase-client.js."
        );
        return;
    }

    if (!window.SITE_CONFIG || window.SITE_CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
        console.warn(
            "[supabase-client] js/config.js still has placeholder values. " +
            "Fill in SUPABASE_URL and SUPABASE_ANON_KEY — see SETUP.md."
        );
    }

    window.db = window.supabase.createClient(
        window.SITE_CONFIG.SUPABASE_URL,
        window.SITE_CONFIG.SUPABASE_ANON_KEY
    );
})();
