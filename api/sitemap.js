/**
 * GET /sitemap.xml  (rewritten to /api/sitemap in vercel.json)
 *
 * The catalogue is rendered in the browser from Supabase, so a crawler that
 * only reads the HTML never discovers a single product URL. This generates the
 * sitemap from the live products table on every request, which means it can
 * never go stale as the owners add and sell stock — no build step, nothing to
 * remember to regenerate.
 *
 * Sold products are excluded: each item is one-of-a-kind, so a sold listing is
 * a dead end for a visitor arriving from search.
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SITE_URL   canonical origin, e.g. "https://zakachalkata.com"
 *              (falls back to the request's own host)
 */

const { createClient } = require("@supabase/supabase-js");

const STATIC_PAGES = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/store.html", priority: "0.9", changefreq: "daily" },
    { path: "/about.html", priority: "0.6", changefreq: "monthly" },
    { path: "/contact.html", priority: "0.5", changefreq: "monthly" },
    { path: "/terms.html", priority: "0.3", changefreq: "yearly" },
    { path: "/withdrawal.html", priority: "0.3", changefreq: "yearly" },
    { path: "/privacy.html", priority: "0.3", changefreq: "yearly" },
    { path: "/cookies.html", priority: "0.3", changefreq: "yearly" },
];

function xmlEscape(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function originFrom(req) {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    return `${proto}://${host}`;
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return res.status(405).send("Method not allowed");
    }

    const origin = originFrom(req);
    const urls = STATIC_PAGES.map((p) => ({
        loc: origin + p.path,
        priority: p.priority,
        changefreq: p.changefreq,
        lastmod: null,
    }));

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { data, error } = await supabase
                .from("products")
                .select("id, created_at")
                .eq("is_sold", false)
                .order("created_at", { ascending: false })
                .limit(5000);

            if (!error && Array.isArray(data)) {
                for (const p of data) {
                    urls.push({
                        loc: `${origin}/p/${p.id}`,
                        priority: "0.8",
                        changefreq: "weekly",
                        lastmod: p.created_at ? String(p.created_at).slice(0, 10) : null,
                    });
                }
            }
        } catch (err) {
            // A sitemap without products beats a 500: search engines retry,
            // and the static pages above still get indexed meanwhile.
            console.error("sitemap: could not read products —", err && err.message);
        }
    }

    const body =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls
            .map(
                (u) =>
                    "  <url>\n" +
                    `    <loc>${xmlEscape(u.loc)}</loc>\n` +
                    (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
                    `    <changefreq>${u.changefreq}</changefreq>\n` +
                    `    <priority>${u.priority}</priority>\n` +
                    "  </url>"
            )
            .join("\n") +
        "\n</urlset>\n";

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(body);
};
