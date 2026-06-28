/**
 * POST /api/create-order
 *
 * Receives an order from product.html's "Поръчай сега" modal, re-validates
 * everything server-side (never trust the client for price/availability),
 * logs the order in Supabase, marks the product as reserved, and emails the
 * shop owner via Resend so they can follow up and arrange cash-on-delivery /
 * in-person payment.
 *
 * Required environment variables (set in Vercel → Project → Settings →
 * Environment Variables — see ../SETUP.md):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (secret — never expose to the browser)
 *   RESEND_API_KEY
 *   OWNER_EMAIL                 comma-separated list, e.g. "a@b.com,c@d.com"
 *   FROM_EMAIL                  verified Resend sender, e.g. "orders@yourdomain.com"
 *   SEND_CUSTOMER_CONFIRMATION  "true" / "false" (optional, defaults to true)
 */

const { createClient } = require("@supabase/supabase-js");

const REQUIRED_FIELDS = ["productId", "fullName", "email", "phone", "street", "city", "postcode"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (product.status === "sold") {
        return res.status(409).json({ success: false, error: "This item has already been sold" });
    }
    if (product.status === "reserved") {
        return res.status(409).json({ success: false, error: "This item is already reserved by another customer" });
    }

    const effectivePrice = product.discount_price ?? product.price;

    // ---- insert order -------------------------------------------------------
    const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
            product_id: product.id,
            product_snapshot: {
                brand: product.brand,
                name: product.name,
                price: effectivePrice,
                currency: product.currency,
            },
            full_name: String(body.fullName).trim(),
            email: String(body.email).trim(),
            phone: String(body.phone).trim(),
            street: String(body.street).trim(),
            city: String(body.city).trim(),
            postcode: String(body.postcode).trim(),
            country: body.country || "BG",
            notes: body.notes ? String(body.notes).trim() : null,
            consent: true,
        })
        .select()
        .single();

    if (orderError) {
        console.error("[create-order] order insert error:", orderError);
        return res.status(500).json({ success: false, error: "Could not save order" });
    }

    // ---- reserve the product so it can't be double-sold --------------------
    const { error: updateError } = await supabase
        .from("products")
        .update({ status: "reserved" })
        .eq("id", product.id);

    if (updateError) {
        console.error("[create-order] product reserve error (non-fatal):", updateError);
    }

    // ---- email the shop owner ----------------------------------------------
    const ownerEmails = OWNER_EMAIL.split(",").map((e) => e.trim()).filter(Boolean);

    const ownerHtml = `
        <h2>Нова поръчка — ${escapeHtml(product.brand)} ${escapeHtml(product.name)}</h2>
        <p><strong>Цена:</strong> ${effectivePrice} ${product.currency || "BGN"}</p>
        <hr />
        <p><strong>Клиент:</strong> ${escapeHtml(body.fullName)}</p>
        <p><strong>Имейл:</strong> ${escapeHtml(body.email)}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(body.phone)}</p>
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
            subject: `Нова поръчка: ${product.brand} ${product.name}`,
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
            <p>Получихме поръчката ви за <strong>${escapeHtml(product.brand)} — ${escapeHtml(product.name)}</strong>
               (${effectivePrice} ${product.currency || "BGN"}). Запазваме артикула за 24 часа, докато се свържем
               с вас на този имейл или телефон, за да уточним доставката и плащането при получаване.</p>
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
