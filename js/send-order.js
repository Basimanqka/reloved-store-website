export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        product_name, full_name, email, mobile,
        street, city, postcode, notes
    } = req.body;

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const OWNER_EMAIL    = process.env.OWNER_EMAIL || 'delivered@resend.dev';
    const FROM_EMAIL     = process.env.FROM_EMAIL  || 'onboarding@resend.dev';

    const html = `
        <h2>Нова поръчка — Закачалката</h2>
        <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:15px">
            <tr><td style="padding:8px;color:#888;width:160px">Продукт</td><td style="padding:8px"><strong>${product_name}</strong></td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#888">Клиент</td><td style="padding:8px">${full_name}</td></tr>
            <tr><td style="padding:8px;color:#888">Имейл</td><td style="padding:8px">${email}</td></tr>
            <tr style="background:#f9f9f9"><td style="padding:8px;color:#888">Телефон</td><td style="padding:8px">${mobile}</td></tr>
            <tr><td style="padding:8px;color:#888">Адрес</td><td style="padding:8px">${street}, ${city} ${postcode}</td></tr>
            ${notes ? `<tr style="background:#f9f9f9"><td style="padding:8px;color:#888">Бележки</td><td style="padding:8px">${notes}</td></tr>` : ''}
        </table>
        <p style="margin-top:24px;font-size:13px;color:#aaa">Поръчката е запазена в Supabase → таблица orders.</p>
    `;

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from:    FROM_EMAIL,
                to:      OWNER_EMAIL,
                subject: `Нова поръчка: ${product_name} — ${full_name}`,
                html
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Resend error');
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Email error:', err);
        return res.status(500).json({ error: err.message });
    }
}
