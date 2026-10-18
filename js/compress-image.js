/*
 * Shrinks product photos in the browser before they are uploaded to Supabase
 * Storage.
 *
 * Why: phone photos are 3–5 MB each and the Supabase Free plan allows only
 * 5 GB of downloads a month — a few dozen shoppers scrolling the shop used it
 * up and got the project restricted (Oct 2026). Resized to 1600px on the long
 * side at quality 0.82 they are ~200–350 KB, roughly 15× less traffic, and
 * still sharp on a retina product page.
 *
 * Re-encoding also strips EXIF metadata, including the GPS location phones
 * write into photos.
 *
 * Falls back to the original file when the browser cannot decode it (e.g. HEIC
 * on desktop Chrome) or when the result would not be smaller.
 */
(function () {
    "use strict";

    var MAX_SIDE = 1600;
    var QUALITY = 0.82;

    // <img> applies the EXIF rotation in every current browser, and drawImage
    // keeps it — so portrait phone photos stay upright. Needs `blob:` in the
    // CSP img-src (set in vercel.json).
    function decodeViaImg(file) {
        return new Promise(function (resolve) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, done: function () { URL.revokeObjectURL(url); } }); };
            img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    }

    async function decodeViaBitmap(file) {
        if (!("createImageBitmap" in window)) return null;
        try {
            var bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
            return { src: bmp, w: bmp.width, h: bmp.height, done: function () { if (bmp.close) bmp.close(); } };
        } catch (e) {
            return null;
        }
    }

    function toBlob(canvas, type, quality) {
        return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
    }

    async function compressImage(file) {
        if (!file || !/^image\//.test(file.type) || file.type === "image/gif" || file.type === "image/svg+xml") {
            return file;
        }

        var decoded = (await decodeViaImg(file)) || (await decodeViaBitmap(file));
        if (!decoded || !decoded.w || !decoded.h) return file;

        var scale = Math.min(1, MAX_SIDE / Math.max(decoded.w, decoded.h));
        var w = Math.round(decoded.w * scale);
        var h = Math.round(decoded.h * scale);

        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; // transparent PNG areas become white, not black
        ctx.fillRect(0, 0, w, h);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(decoded.src, 0, 0, w, h);
        decoded.done();

        // WebP where the browser can encode it (Chrome, Edge, Firefox, Safari 17+);
        // older Safari silently returns PNG for webp, so check and fall back to JPEG.
        var blob = await toBlob(canvas, "image/webp", QUALITY);
        if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", QUALITY);
        if (!blob || blob.size >= file.size) return file;

        var ext = blob.type === "image/webp" ? ".webp" : ".jpg";
        var base = (file.name || "photo").replace(/\.[^.]+$/, "");
        return new File([blob], base + ext, { type: blob.type, lastModified: Date.now() });
    }

    window.compressImage = compressImage;
})();
