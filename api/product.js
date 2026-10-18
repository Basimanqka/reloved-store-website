/**
 * GET /p/:id   (rewritten to /api/product?id=:id in vercel.json)
 *
 * Why this exists: product.html renders in the browser from Supabase, so when
 * someone pastes a product link into Instagram, Messenger or Viber, the crawler
 * reads the raw HTML, finds only the generic shop metadata, and shows a grey
 * box. Crawlers do not run JavaScript, so no amount of client-side code fixes
 * it. This serves the same product.html with the product's own title,
 * description and photo already in the <head>.
 *
 * The page itself is unchanged — this only rewrites the metadata and hands the
 * id to the existing client-side code via window.__PRODUCT_ID__, so
 * /product.html?id=... keeps working exactly as before.
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SITE_URL   canonical origin, e.g. "https://zakachalkata.com"
 *
 * vercel.json must keep product.html bundled with this function:
 *   "functions": { "api/product.js": { "includeFiles": "product.html" } }
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedShell = null;

function readShell() {
    if (cachedShell) return cachedShell;
    cachedShell = fs.readFileSync(path.join(process.cwd(), "product.html"), "utf8");
    return cachedShell;
}

function attrEscape(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function originFrom(req) {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    return `${proto}://${host}`;
}

/** One or two sentences a person would actually want to read in a link preview. */
function buildDescription(p) {
    const bits = [];
    if (p.condition) bits.push(`Състояние: ${p.condition}`);
    if (p.size) bits.push(`размер ${p.size}`);
    const head = [p.brand, p.name].filter(Boolean).join(" ");
    const price = p.price != null ? `${Number(p.price).toFixed(2)} €` : null;
    const lead = [head, price].filter(Boolean).join(" — ");

    let desc = (p.description || "").replace(/\s+/g, " ").trim();
    if (!desc) desc = bits.join(", ");
    const full = [lead, desc].filter(Boolean).join(". ");
    return full.length > 300 ? full.slice(0, 297).trimEnd() + "…" : full;
}

module.exports = async function handler(req, res) {
    const id = (req.query && req.query.id) || "";
    const origin = originFrom(req);

    // Anything that isn't a product id goes to the catalogue rather than 404ing
    // a link someone may have shared with a typo.
    if (!UUID_RE.test(id)) {
        res.setHeader("Location", "/store.html");
        return res.status(302).end();
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

    let product = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { data } = await supabase
                .from("products")
                .select("id, brand, name, description, price, original_price, condition, size, color, image_urls, is_sold")
                .eq("id", id)
                .maybeSingle();
            product = data || null;
        } catch (err) {
            console.error("product og: supabase read failed —", err && err.message);
        }
    }

    let shell;
    try {
        shell = readShell();
    } catch (err) {
        // If product.html wasn't bundled, never show an error page — fall back
        // to the plain client-rendered route. Link previews degrade; the shop
        // keeps working.
        console.error("product og: product.html not readable —", err && err.message);
        res.setHeader("Location", `/product.html?id=${encodeURIComponent(id)}`);
        return res.status(302).end();
    }

    const url = `${origin}/p/${id}`;
    let title = "Закачалката — Продукт";
    let desc = "Внимателно избрана препродадена дизайнерска мода. Всеки артикул е единствен.";
    let image = `${origin}/og-image.png`;

    if (product) {
        const head = [product.brand, product.name].filter(Boolean).join(" ") || "Продукт";
        const price = product.price != null ? ` — ${Number(product.price).toFixed(2)} €` : "";
        title = `${head}${price} · Закачалката`;
        desc = buildDescription(product);
        if (Array.isArray(product.image_urls) && product.image_urls[0]) {
            image = product.image_urls[0];
        }
    }

    const meta = [
        // /p/<id> is one level deep, so product.html's relative references
        // (logo.jpeg, index.html, store.html, contact.html) would 404 without this.
        '<base href="/" />',
        `<title>${attrEscape(title)}</title>`,
        `<meta name="description" content="${attrEscape(desc)}" />`,
        `<link rel="canonical" href="${attrEscape(url)}" />`,
        product && product.is_sold
            ? '<meta name="robots" content="noindex, follow" />'
            : '<meta name="robots" content="index, follow" />',
        '<meta property="og:type" content="product" />',
        '<meta property="og:site_name" content="Закачалката" />',
        '<meta property="og:locale" content="bg_BG" />',
        `<meta property="og:title" content="${attrEscape(title)}" />`,
        `<meta property="og:description" content="${attrEscape(desc)}" />`,
        `<meta property="og:url" content="${attrEscape(url)}" />`,
        `<meta property="og:image" content="${attrEscape(image)}" />`,
        '<meta name="twitter:card" content="summary_large_image" />',
        product && product.price != null
            ? `<meta property="product:price:amount" content="${attrEscape(Number(product.price).toFixed(2))}" />` +
              '<meta property="product:price:currency" content="EUR" />'
            : "",
        product
            ? `<meta property="product:availability" content="${product.is_sold ? "oos" : "in stock"}" />`
            : "",
        `<script>window.__PRODUCT_ID__ = ${JSON.stringify(id)};</script>`,
    ]
        .filter(Boolean)
        .join("\n    ");

    // Swap the whole static metadata block — product.html marks it with
    // sentinel comments so the title, description and og tags are replaced
    // together and can never end up duplicated.
    let html = shell.replace(
        /<!-- META:START -->[\s\S]*?<!-- META:END -->/,
        `<!-- META:START -->\n    ${meta}\n    <!-- META:END -->`
    );
    if (!html.includes("__PRODUCT_ID__")) {
        // Defensive: if the sentinels are ever removed, inject before </head>
        // rather than serving a page with no product metadata at all.
        html = shell.replace("</head>", `    ${meta}\n</head>`);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
    );
    return res.status(200).send(html);
};
