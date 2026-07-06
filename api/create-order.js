/**
 * POST /api/create-order
 *
 * Receives an order from product.html's "Поръчай сега" modal, re-validates
 * everything server-side (never trust the client for price/availability),
 * logs the order in Supabase, marks the product as sold so it can't be
 * ordered twice, and emails the shop owner via Resend so they can follow up
 * and arrange delivery / cash-on-delivery payment.
 *
 * NOTE on schema: this matches the *actual* live Supabase tables —
 *   products: id, name, brand, description, price, original_price,
 *             category, condition, tags, image_urls, is_sold, created_at
 *   orders:   id, product_id, product_name, full_name, email, mobile,
 *             street, city, postcode, notes, status, created_at
 * `price` is always the current/selling price (in EUR); `original_price`
 * is only set when there's a discount and is always higher than `price`.
 *
 * Required environment variables (set in Vercel → Project → Settings →
 * Environment Variables — see ../SETUP.md):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (secret — never expose to the browser)
 *   RESEND_API_KEY
 *   OWNER_EMAIL                 comma-separated list, e.g. "a@b.com,c@d.com"
 *   FROM_EMAIL                  verified Resend sender, e.g. "onboarding@resend.dev"
 *   SEND_CUSTOMER_CONFIRMATION  "true" / "false" (optional, defaults to true)
 */

const { createClient } = require("@supabase/supabase-js");

const REQUIRED_FIELDS = ["productId", "fullName", "email", "mobile", "street", "city", "postcode"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BGN_PER_EUR = 1.95583;

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    let body = req.body;
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    // ---- validate input ---------------------------------------------------
    const missing = REQUIRED_FIELDS.filter((f) => !String(body[f] || "").trim());
    if (missing.length) {
        return res.status(400).json({ success: false, error: `Missing fields: ${missing.join(", ")}` });
    }
    if (!EMAIL_RE.test(body.email)) {
        return res.status(400).json({ success: false, error: "Invalid email address" });
    }
    if (body.consent !== true) {
        return res.status(400).json({ success: false, error: "GDPR consent is required" });
    }

    const {
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        RESEND_API_KEY,
        OWNER_EMAIL,
        FROM_EMAIL,
        SEND_CUSTOMER_CONFIRMATION,
    } = process.env;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !OWNER_EMAIL || !FROM_EMAIL) {
        console.error("[create-order] Missing required environment variables");
        return res.status(500).json({ success: false, error: "Server misconfigured. Contact the site owner." });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---- look up the authoritative product (never trust client price) ----
    const { data: product, error: productError } = await supabase
        .from("products")
        .select("*")
        .eq("id", body.productId)
        .maybeSingle();

    if (productError) {
        console.error("[create-order] product lookup error:", productError);
        return res.status(500).json({ success: false, error: "Could not verify product" });
    }
    if (!product) {
        return res.status(404).json({ success: false, error: "Product not found" });
    }
    if (product.is_sold) {
        return res.status(409).json({ success: false, error: "This item has already been sold" });
    }

    const effectivePriceEur = Number(product.price);
    const productLabel = `${product.brand || ""} ${product.name || ""}`.trim();

    // ---- insert order -------------------------------------------------------
    const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
            product_id: product.id,
            product_name: productLabel,
            full_name: String(body.fullName).trim(),
            email: String(body.email).trim(),
            mobile: String(body.mobile).trim(),
            street: String(body.street).trim(),
            city: String(body.city).trim(),
            postcode: String(body.postcode).trim(),
            notes: body.notes ? String(body.notes).trim() : null,
            status: "new",
        })
        .select()
        .single();

    if (orderError) {
        console.error("[create-order] order insert error:", orderError);
        return res.status(500).json({ success: false, error: "Could not save order" });
    }

    // ---- mark the product sold so it can't be ordered twice ----------------
    const { error: updateError } = await supabase
        .from("products")
        .update({ is_sold: true })
        .eq("id", product.id);

    if (updateError) {
        console.error("[create-order] product update error (non-fatal):", updateError);
    }

    // ---- email the shop owner ----------------------------------------------
    const ownerEmails = OWNER_EMAIL.split(",").map((e) => e.trim()).filter(Boolean);
    const priceLine = `€${effectivePriceEur.toFixed(2)} (≈ ${(effectivePriceEur * BGN_PER_EUR).toFixed(2)} лв)`;

    const ownerHtml = `
        <h2>Нова поръчка — ${escapeHtml(productLabel)}</h2>
        <p><strong>Цена:</strong> ${priceLine}</p>
        <hr />
        <p><strong>Клиент:</strong> ${escapeHtml(body.fullName)}</p>
        <p><strong>Имейл:</strong> ${escapeHtml(body.email)}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(body.mobile)}</p>
        <p><strong>Адрес:</strong> ${escapeHtml(body.street)}, ${escapeHtml(body.city)}, ${escapeHtml(body.postcode)}</p>
        ${body.notes ? `<p><strong>Бележки:</strong> ${escapeHtml(body.notes)}</p>` : ""}
        <hr />
        <p style="color:#888;font-size:12px;">ID на поръчката: ${order.id}</p>
    `;

    try {
        await sendEmail({
            apiKey: RESEND_API_KEY,
            from: FROM_EMAIL,
            to: ownerEmails,
            replyTo: body.email,
            subject: `Нова поръчка: ${productLabel}`,
            html: ownerHtml,
        });
    } catch (err) {
        // The order is already saved — don't fail the request just because
        // the email failed, but log it loudly so it shows up in Vercel logs.
        console.error("[create-order] Resend owner email failed:", err);
    }

    // ---- optional confirmation email to the customer -----------------------
    const sendConfirmation = (SEND_CUSTOMER_CONFIRMATION ?? "true").toLowerCase() !== "false";
    if (sendConfirmation) {
        const customerHtml = `
            <p>Здравейте, ${escapeHtml(body.fullName)},</p>
            <p>Получихме поръчката ви за <strong>${escapeHtml(productLabel)}</strong>
               (${priceLine}). Ще се свържем с вас скоро на този имейл или телефон, за да уточним
               доставката и плащането при получаване.</p>
            <p>Благодарим ви, че пазарувате от Закачалката!</p>
        `;
        try {
            await sendEmail({
                apiKey: RESEND_API_KEY,
                from: FROM_EMAIL,
                to: [body.email],
                subject: "Получихме вашата поръчка — Закачалката",
                html: customerHtml,
            });
        } catch (err) {
            console.error("[create-order] Resend customer email failed (non-fatal):", err);
        }
    }

    return res.status(200).json({ success: true, orderId: order.id });
};

async function sendEmail({ apiKey, from, to, replyTo, subject, html }) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to,
            reply_to: replyTo,
            subject,
            html,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Resend API error ${response.status}: ${text}`);
    }

    return response.json();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
