/**
 * Fills the business details into every page in one pass.
 *
 *   1. Put the real values in DETAILS below.
 *   2. Run:  node scripts/fill-details.mjs
 *   3. It prints what it changed and warns about anything left unfilled.
 *
 * Run it again after any edit — it is safe to repeat, and it will tell you
 * if a placeholder has crept back in. Nothing should be deployed while it
 * still reports unfilled placeholders: a published policy with {{ЕИК}} in
 * it is worse than no policy, because it shows nobody read the page.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// FILL THESE IN
// ---------------------------------------------------------------------------
const DETAILS = {
  "ФИРМА":          "ДЗЗД София Велвет",   // registered name exactly as in Търговския регистър, e.g. "Закачалката ЕООД"
  "ЕИК":            "177491919",   // 9 or 13 digits
  "АДРЕС":          "гр. Варна, ул. „Петър Райчев“ №22",   // registered address, e.g. "гр. Варна 9000, ул. ... №..."
  "СЪДРУЖНИЦИ":     "Дарина Атанасова и Стелияна Куцарова",   // ДЗЗД has no separate legal personality — partners named on identity block, withdrawal form
  "ТЕЛЕФОН":        "+359 88 416 1889",   // in international form, e.g. "+359 88 000 0000"
  "ИМЕЙЛ":          "zakachalkata@gmail.com",   // the address the owners actually read
  "ДОМЕЙН":         "www.zakachalkata.com",   // no scheme, no trailing slash, e.g. "zakachalkata.com"
  "ЦЕНА_ДОСТАВКА":  "по тарифата на куриера",   // e.g. "5,00 €" — or "за сметка на купувача по тарифата на куриера"
  "СРОК_ДОСТАВКА":  "2–4",   // e.g. "2–4"
};

const FILES = [
  "index.html",
  "store.html",
  "product.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "cookies.html",
  "withdrawal.html",
  "robots.txt",
];
// ---------------------------------------------------------------------------

const missing = Object.entries(DETAILS).filter(([, v]) => !String(v).trim());
if (missing.length === FILES.length || missing.length === Object.keys(DETAILS).length) {
  console.error("Nothing to do — fill in DETAILS at the top of this file first.");
  process.exit(1);
}
if (missing.length) {
  console.warn(
    `Warning: no value given for ${missing.map(([k]) => k).join(", ")} — ` +
      "those placeholders will be left as they are.\n"
  );
}

let touched = 0;
const leftover = new Map();

for (const name of FILES) {
  const path = join(ROOT, name);
  if (!existsSync(path)) {
    console.warn(`skipped  ${name} (not found)`);
    continue;
  }
  const before = readFileSync(path, "utf8");
  let after = before;
  let count = 0;

  for (const [key, value] of Object.entries(DETAILS)) {
    if (!String(value).trim()) continue;
    const token = `{{${key}}}`;
    const hits = after.split(token).length - 1;
    if (hits) {
      after = after.split(token).join(value);
      count += hits;
    }
  }

  for (const token of after.match(/\{\{[^}]+\}\}/g) ?? []) {
    leftover.set(token, (leftover.get(token) ?? 0) + 1);
  }

  if (after !== before) {
    writeFileSync(path, after, "utf8");
    touched++;
    console.log(`updated  ${name.padEnd(18)} ${count} replacement${count === 1 ? "" : "s"}`);
  } else {
    console.log(`no change ${name}`);
  }
}

console.log(`\n${touched} file${touched === 1 ? "" : "s"} updated.`);

if (leftover.size) {
  console.log("\nStill unfilled — do not deploy until these are gone:");
  for (const [token, n] of [...leftover].sort()) {
    console.log(`  ${token}  ×${n}`);
  }
  process.exitCode = 1;
} else {
  console.log("No placeholders left. Ready to deploy.");
}
