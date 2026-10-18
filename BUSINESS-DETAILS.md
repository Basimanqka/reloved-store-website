# Business details to collect, and what happens next

Everything the new legal pages need is written as a placeholder token. Collect
the values below from the owners, put them in `scripts/fill-details.mjs`, run it
once, and every page is filled consistently.

```
node scripts/fill-details.mjs
```

It prints what it changed and exits with an error if any placeholder is left.
**Do not deploy while it still reports unfilled placeholders** — a published
privacy policy with `{{ЕИК}}` in it is worse than none, because it tells a
regulator nobody read the page.

## What to ask the owners for

| Token | What it is | Where to find it |
|---|---|---|
| `{{ФИРМА}}` | Registered name, exactly as in Търговския регистър — e.g. `Закачалката ЕООД`. Not the shop's trading name. | their registration papers, or [portal.registryagency.bg](https://portal.registryagency.bg) |
| `{{ЕИК}}` | 9 or 13 digits | same |
| `{{АДРЕС}}` | Registered address (адрес на управление), not the shop floor if they differ | same |
| `{{ТЕЛЕФОН}}` | The number they answer, international form: `+359 88 000 0000` | ask |
| `{{ИМЕЙЛ}}` | The address they actually read — this is where complaints and withdrawal notices legally arrive | ask |
| `{{ДОМЕЙН}}` | No scheme, no trailing slash: `zakachalkata.com` | after the domain is bought |
| `{{ЦЕНА_ДОСТАВКА}}` | Delivery price, or the wording if the courier bills the buyer directly | ask |
| `{{СРОК_ДОСТАВКА}}` | Working days, e.g. `2–4` | ask |

If they are **ДДС registered**, add the ДДС number next to the ЕИК in the
footer identity line and in section 1 of `terms.html`. If they are not, leave it
out — do not write "не е регистриран по ДДС", it invites questions.

## Three things only the owners can decide

1. **Who pays return postage on a withdrawal.** `withdrawal.html` currently
   says the buyer does, which is the default the law allows. If they would
   rather absorb it as a selling point, section 4 needs changing — and once
   published, that promise binds them.
2. **The one-year conformity period.** `terms.html` section 11 shortens the
   statutory two years to one, which the law permits for second-hand goods only
   if it is expressly agreed. That is what accepting the terms at checkout does.
   If they would rather not rely on that, delete the callout and the period
   reverts to two years.
3. **Hygiene exclusions.** Section 7 of `withdrawal.html` covers underwear,
   swimwear and earrings. If they never sell those, the section can go; if they
   do, each such listing must say so on the product page itself.

## Still owed by you, not by them

- **A consent banner.** `cookies.html` describes an opt-in banner that stores
  its answer in `zk_consent`, and a "Настройки за бисквитки" link with
  `id="reopenConsent"` that reopens it. Neither exists yet. The page is accurate
  from the moment both are built and the pixel is gated behind them — so the
  banner, the pixel and this page have to go live together, not in sequence.
- **`SITE_URL`** as a Vercel environment variable, set to the canonical origin
  (`https://zakachalkata.com`). `api/sitemap.js` and `api/product.js` both fall
  back to the request host without it, which works but will happily emit
  preview-deployment URLs into your sitemap.
- **Delivery and returns in one line on the product page** — next to the order
  button, where the hesitation actually is. `terms.html` is the legal version;
  nobody reads it before buying.

## A correction to the runbook

`api/create-order.js` already supports a customer confirmation email, behind the
`SEND_CUSTOMER_CONFIRMATION` environment variable (default on). So the runbook's
"decide what the customer gets back" step is mostly done — what is left is to
confirm the variable is set in Vercel and to attach the withdrawal-rights notice
to that email, which is where the law expects it to be given.
