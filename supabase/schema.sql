-- =====================================================================
-- Zakachalkata / Reloved Store — Supabase schema
-- =====================================================================
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run
-- Project region MUST be EU (Frankfurt) for GDPR data residency.
-- Safe to re-run: uses "if not exists" / "drop ... if exists" guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------
create table if not exists public.products (
    id                 uuid primary key default gen_random_uuid(),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),

    brand              text not null,
    name               text not null,
    slug               text unique,
    description        text,

    category           text not null,        -- jackets | bags | dresses | shoes | knitwear | skirts | accessories ...
    size               text,                  -- XS, S, M, L, one-size, etc.
    color              text,
    material           text,
    condition          text not null default 'Отлично',   -- Отлично | Много добро | Добро
    measurements       jsonb not null default '{}'::jsonb, -- { "chest": "96 cm", "shoulder": "43 cm", ... }

    price              numeric(10,2) not null check (price >= 0),
    discount_price      numeric(10,2) check (discount_price >= 0),
    currency           text not null default 'BGN',

    tags               text[] not null default '{}',
    badge              text,                  -- new | archive | sold (purely visual hint; status drives availability)
    status             text not null default 'available'
                         check (status in ('available', 'reserved', 'sold', 'hidden')),

    images             jsonb not null default '[]'::jsonb, -- ["https://.../1.jpg", "https://.../2.jpg"]

    authenticity_verified boolean not null default true,
    original_tags         boolean not null default false,
    dust_bag               boolean not null default false,
    sku                   text,

    constraint products_discount_lt_price check (discount_price is null or discount_price <= price)
);

create index if not exists products_status_idx on public.products (status);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_created_at_idx on public.products (created_at desc);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
    before update on public.products
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- ORDERS
-- (Inserted by the serverless function using the service-role key only —
--  not directly reachable by the public anon key.)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
    id                 uuid primary key default gen_random_uuid(),
    created_at         timestamptz not null default now(),

    product_id         uuid references public.products(id) on delete set null,
    product_snapshot   jsonb not null default '{}'::jsonb, -- brand/name/price at time of order

    full_name          text not null,
    email              text not null,
    phone              text not null,
    street             text not null,
    city               text not null,
    postcode           text not null,
    country            text not null default 'BG',
    notes              text,

    consent            boolean not null default false,
    status             text not null default 'new'
                         check (status in ('new', 'contacted', 'confirmed', 'cancelled')),

    constraint orders_consent_required check (consent = true)
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.orders   enable row level security;

-- Anyone (anon + logged-in) can read products that aren't hidden.
drop policy if exists "public can read visible products" on public.products;
create policy "public can read visible products"
    on public.products for select
    to anon, authenticated
    using (status <> 'hidden');

-- Only an authenticated (logged-in) user — i.e. the shop owner via the
-- admin panel — can create/update/delete products.
drop policy if exists "authenticated can manage products" on public.products;
create policy "authenticated can manage products"
    on public.products for all
    to authenticated
    using (true)
    with check (true);

-- Orders: no anon/authenticated policies at all on purpose.
-- The public order form never talks to Supabase directly — it calls the
-- /api/create-order serverless function, which uses the service-role key
-- and therefore bypasses RLS entirely. We only add a read policy so the
-- admin dashboard (logged-in) can see the order log.
drop policy if exists "authenticated can read orders" on public.orders;
create policy "authenticated can read orders"
    on public.orders for select
    to authenticated
    using (true);

drop policy if exists "authenticated can update orders" on public.orders;
create policy "authenticated can update orders"
    on public.orders for update
    to authenticated
    using (true)
    with check (true);

-- ---------------------------------------------------------------------
-- STORAGE BUCKET for product photos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Public can view images (needed for the catalog to display photos).
drop policy if exists "public can view product images" on storage.objects;
create policy "public can view product images"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'product-images');

-- Only logged-in users (the shop owner) can upload/replace/delete photos.
drop policy if exists "authenticated can upload product images" on storage.objects;
create policy "authenticated can upload product images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'product-images');

drop policy if exists "authenticated can update product images" on storage.objects;
create policy "authenticated can update product images"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'product-images');

drop policy if exists "authenticated can delete product images" on storage.objects;
create policy "authenticated can delete product images"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'product-images');

-- ---------------------------------------------------------------------
-- SAMPLE DATA (safe to delete from the admin panel later)
-- ---------------------------------------------------------------------
insert into public.products
    (brand, name, slug, description, category, size, color, material, condition,
     price, discount_price, tags, badge, status, images)
values
    ('Prada', 'Вълнено Сако', 'prada-vlneno-sako',
     'Структурирано вълнено сако в антрацитно сиво с двуреден силует.',
     'jackets', 'M', 'grey', '80% Вълна, 20% Кашмир', 'Отлично',
     240.00, null, array['официален','винтидж'], 'new', 'available',
     '["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=900&q=80"]'::jsonb),

    ('Chanel', 'Кожена Чанта', 'chanel-kozhena-chanta',
     'Класическа кожена чанта, много добро състояние.',
     'bags', 'one-size', 'black', 'Естествена кожа', 'Отлично',
     580.00, 490.00, array['архивен'], 'archive', 'available',
     '["https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=900&q=80"]'::jsonb)
on conflict (slug) do nothing;
