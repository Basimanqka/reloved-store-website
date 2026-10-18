/* =====================================================================
   Закачалката — shared page script (every public page, loaded with defer)
   - mobile navigation drawer
   - --nav-h custom property + a scrolled state for the navbar
   - reveal-once for [data-reveal] (and the legacy .reveal class)
   The <head> of each page adds the `js` class to <html> before paint, so
   hidden reveal states only ever apply when this script can undo them.
   ===================================================================== */

(function () {
    "use strict";

    /* ---- navbar height + scrolled state ---- */
    var nav = document.querySelector(".navbar");

    function setNavHeight() {
        if (nav) document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px");
    }
    setNavHeight();
    window.addEventListener("resize", setNavHeight);

    if (nav) {
        var onScroll = function () { nav.classList.toggle("is-scrolled", window.scrollY > 8); };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
    }

    /* ---- mobile drawer ---- */
    var toggle  = document.getElementById("navToggle");
    var links   = document.getElementById("navLinks");
    var overlay = document.getElementById("navOverlay");

    if (toggle && links) {
        var closeMenu = function (returnFocus) {
            toggle.classList.remove("open");
            links.classList.remove("open");
            if (overlay) overlay.classList.remove("open");
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Отвори меню");
            document.body.style.overflow = "";
            if (returnFocus) toggle.focus();
        };
        var openMenu = function () {
            toggle.classList.add("open");
            links.classList.add("open");
            if (overlay) overlay.classList.add("open");
            toggle.setAttribute("aria-expanded", "true");
            toggle.setAttribute("aria-label", "Затвори меню");
            document.body.style.overflow = "hidden";
            var first = links.querySelector("a");
            if (first) setTimeout(function () { first.focus(); }, 60);
        };

        toggle.addEventListener("click", function () {
            links.classList.contains("open") ? closeMenu(false) : openMenu();
        });
        if (overlay) overlay.addEventListener("click", function () { closeMenu(true); });
        links.querySelectorAll("a").forEach(function (a) {
            a.addEventListener("click", function () { closeMenu(false); });
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && links.classList.contains("open")) closeMenu(true);
        });
        window.addEventListener("resize", function () {
            if (window.innerWidth > 860 && links.classList.contains("open")) closeMenu(false);
        });
    }

    /* ---- reveal once ---- */
    function revealAll(els, cls) { els.forEach(function (el) { el.classList.add(cls); }); }

    window.zkObserveReveals = function (root) {
        var scope = root || document;
        var fresh = scope.querySelectorAll("[data-reveal]:not(.is-in)");
        var legacy = scope.querySelectorAll(".reveal:not(.visible)");
        if (!("IntersectionObserver" in window)) {
            revealAll(fresh, "is-in");
            revealAll(legacy, "visible");
            return;
        }
        fresh.forEach(function (el) { io.observe(el); });
        legacy.forEach(function (el) { io.observe(el); });
    };

    var io = "IntersectionObserver" in window
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add(entry.target.hasAttribute("data-reveal") ? "is-in" : "visible");
                io.unobserve(entry.target);
            });
        }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 })
        : null;

    window.zkObserveReveals();

    /* safety net: anything still hidden on screen a moment after load is shown */
    window.addEventListener("load", function () {
        setTimeout(function () {
            document.querySelectorAll("[data-reveal]:not(.is-in), .reveal:not(.visible)").forEach(function (el) {
                var r = el.getBoundingClientRect();
                if (r.top < window.innerHeight && r.bottom > 0) {
                    el.classList.add(el.hasAttribute("data-reveal") ? "is-in" : "visible");
                }
            });
        }, 2500);
    });
})();
