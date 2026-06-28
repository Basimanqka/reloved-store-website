/* =====================================================================
   Shared catalog helpers — store.html and product.html.
   Schema: id, name, brand, description, price, original_price,
           category, condition, tags (text[]), image_urls (text[]),
           is_sold, created_at
   ===================================================================== */

async function fetchProducts() {
    const { data, error } = await window.db
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[catalog] fetchProducts error:", error);
        return [];
    }
    return (data || []).map(mapProductRow);
}

async function fetchProductById(id) {
    const { data, error } = await window.db
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        console.error("[catalog] fetchProductById error:", error);
        return null;
    }
    return data ? mapProductRow(data) : null;
}

function mapProductRow(row) {
    const images = Array.isArray(row.image_urls) ? row.image_urls : [];
    // original_price is the crossed-out higher price; price is the current (sale) price.
    // Frontend convention: p.price = crossed-out price, p.discountPrice = sale price.
    const hasOriginal = row.original_price != null && Number(row.original_price) > Number(row.price);

    return {
        id:            row.id,
        brand:         row.brand         || "",
        name:          row.name          || "",
        description:   row.description   || "",
        meta:          row.condition     || "",
        price:         hasOriginal ? Number(row.original_price) : Number(row.price),
        discountPrice: hasOriginal ? Number(row.price) : null,
        cat:           row.category      || "",
        condition:     row.condition     || "",
        tags:          Array.isArray(row.tags) ? row.tags : [],
        isSold:        !!row.is_sold,
        status:        row.is_sold ? "sold" : "available",
        images:        images,
        img:           images[0] || "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&q=60",
    };
}

function formatPrice(amount) {
    return Number(amount).toLocaleString("bg-BG") + " лв";
}

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}
