/**
 * POST /api/send-contact-message
 *
 * Receives a message from contact.html's contact form and emails it to the
 * shop owner via Resend. This reuses the same environment variables already
 * configured for /api/create-order (see ../SETUP.md) — no new setup needed.
 *
 * Previously the contact form only showed a fake "message sent" success
 * state in the browser and never actually delivered anything anywhere.
 * This endpoint fixes that.
 *
 * Required environment variables (already set for create-order.js):
 *   RESEND_API_KEY
 *   OWNER_EMAIL   comma-separated list, e.g. "a@b.com,c@d.com"
 *   FROM_EMAIL    verified Resend sender, e.g. "orders@yourdomain.com"
 */

const { createClient } = require("@supabase/supabase-js");

const REQUIRED_FIELDS = ["fullName", "email", "subject", "message"];
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

    const missing = REQUIRED_FIELDS.filter((f) => !String(body[f] || "").trim());
    if (missing.length) {
        return res.status(400).json({ success: false, error: `Missing fields: ${missing.join(", ")}` });
    }
    if (!EMAIL_RE.test(body.email)) {
        return res.status(400).json({ success: false, error: "Invalid email address" });
    }

    // ---- abuse protection: captcha + per-IP rate limit ---------------------
    const ip = getClientIp(req);

    if (process.env.TURNSTILE_SECRET_KEY) {
        const ok = await verifyTurnstile(process.env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip);
        if (!ok) {
            return res.status(400).json({ success: false, error: "Проверката за сигурност не бе успешна. Опитайте отново." });
        }
    }

    // Max 5 messages per IP per 10 minutes. Best-effort: skips if Supabase env
    // is absent, fails open if the check errors.
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            const { data: allowed, error: rlError } = await supabase.rpc("check_rate_limit", {
                p_key: `contact:${ip}`, p_max: 5, p_window_seconds: 600,
            });
            if (rlError) {
                console.error("[send-contact-message] rate limit check error (allowing):", rlError);
            } else if (allowed === false) {
                return res.status(429).json({ success: false, error: "Твърде много съобщения от тази връзка. Изчакайте няколко минути." });
            }
        } catch (err) {
            console.error("[send-contact-message] rate limit exception (allowing):", err);
        }
    }

    const { RESEND_API_KEY, OWNER_EMAIL, FROM_EMAIL } = process.env;

    if (!RESEND_API_KEY || !OWNER_EMAIL || !FROM_EMAIL) {
        console.error("[send-contact-message] Missing required environment variables");
        return res.status(500).json({ success: false, error: "Server misconfigured. Contact the site owner." });
    }

    const ownerEmails = OWNER_EMAIL.split(",").map((e) => e.trim()).filter(Boolean);

    const html = `
        <h2>Ново съобщение от формата за контакт</h2>
        <p><strong>От:</strong> ${escapeHtml(body.fullName)}</p>
        <p><strong>Имейл:</strong> ${escapeHtml(body.email)}</p>
        <p><strong>Относно:</strong> ${escapeHtml(body.subject)}</p>
        <hr />
        <p>${escapeHtml(body.message).replace(/\n/g, "<br />")}</p>
    `;

    try {
        await sendEmail({
            apiKey: RESEND_API_KEY,
            from: FROM_EMAIL,
            to: ownerEmails,
            replyTo: body.email,
            subject: `Запитване: ${body.subject}`,
            html,
        });
    } catch (err) {
        console.error("[send-contact-message] Resend error:", err);
        return res.status(502).json({ success: false, error: "Съобщението не можа да бъде изпратено. Опитайте отново или ни пишете директно." });
    }

    return res.status(200).json({ success: true });
};

async function sendEmail({ apiKey, from, to, replyTo, subject, html }) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, reply_to: replyTo, subject, html }),
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

function getClientIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (xff) return String(xff).split(",")[0].trim();
    return req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

async function verifyTurnstile(secret, token, remoteip) {
    if (!token) return false;
    try {
        const params = new URLSearchParams();
        params.append("secret", secret);
        params.append("response", token);
        if (remoteip && remoteip !== "unknown") params.append("remoteip", remoteip);
        const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });
        const data = await resp.json();
        return !!data.success;
    } catch (err) {
        console.error("[turnstile] verify error:", err);
        return false;
    }
}
