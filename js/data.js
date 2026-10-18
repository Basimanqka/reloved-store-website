/* =====================================================================
   Small read-only helpers for the public pages that load live data
   (index, about). Needs js/config.js loaded first.
   Products, events and gallery photos are read straight from the
   Supabase REST API with the public key; Row Level Security decides
   what the public may see.
   ===================================================================== */

(function () {
    "use strict";

    var cfg = window.SITE_CONFIG || {};

    window.zkRest = function (path) {
        return fetch(cfg.SUPABASE_URL + "/rest/v1/" + path, {
            headers: {
                apikey: cfg.SUPABASE_ANON_KEY,
                Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
            },
        }).then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        });
    };

    var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    window.zkEsc = function (s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
    };

    window.zkPrice = function (n) {
        return "€" + Number(n).toFixed(2);
    };

    /* today as YYYY-MM-DD in the visitor's own time zone */
    window.zkToday = function () {
        var d = new Date();
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    };

    /* plain text with blank-line paragraphs → escaped <p> blocks */
    window.zkParagraphs = function (text) {
        return String(text || "")
            .split(/\n\s*\n/)
            .map(function (p) { return p.trim(); })
            .filter(Boolean)
            .map(function (p) { return "<p>" + window.zkEsc(p).replace(/\n/g, "<br>") + "</p>"; })
            .join("");
    };
})();
