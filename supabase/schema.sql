-- =====================================================================
-- Zakachalkata / Reloved Store — complete Supabase schema
-- =====================================================================
-- Run once on a NEW project: Supabase Dashboard → SQL Editor → New query
-- → paste this whole file → Run. Project region MUST be EU (Frankfurt)
-- for GDPR data residency. Safe to re-run: every statement is guarded.
--
-- What it creates
--   products         the catalogue (one row per one-of-a-kind piece)
--   orders           written only by /api/create-order (service role)
--   events           home-page announcements, managed in admin.html
--   gallery_photos   photos for about.html, managed in admin.html
--   admins           which logged-in users may edit anything
--   rate_limits      + check_rate_limit()  used by both /api functions
--   storage buckets  product-images, site-media (events/ + gallery/)
--
-- After running it, make yourself an admin (see SETUP.md, step 1):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'owner@example.com';
-- =====================================================================

create extension if not exists "pgcrypto";


-- ---------------------------------------------------------------------
-- ADMINS — only users listed here can change data. Being logged in is
-- not enough, so a stranger who signs up through the public API gets
-- read access like any visitor and nothing more.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "admins can see the admin list" on public.admins;
create policy "admins can see the admin list"
    on public.admins for select
    to authenticated
    using (public.is_admin());


-- ---------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- ---------------------------------------------------------------------
-- PRODUCTS — column names match admin.html, store.html, product.html,
-- api/product.js, api/sitemap.js and api/create-order.js.
-- ---------------------------------------------------------------------
create table if not exists public.products (
    id             uuid primary key default gen_random_uuid(),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),

    brand          text not null,
    name           text not null,
    description    text,

    category       text not null,               -- outerwear | dresses | tops | shirts | pants | jeans | skirts | knitwear | shoes | bags | accessories
    condition      text not null default 'Отлично', -- Отлично | Много добро | Добро
    size           text,                         -- XS S M L XL one-size 35 … 41
    color          text,                         -- black, white, beige … (slugs, labels live in the pages)
    material       text,                         -- genuine-leather, cotton, wool … (slugs)

    price          numeric(10,2) not null check (price >= 0),          -- what the buyer pays, EUR
    original_price numeric(10,2) check (original_price >= 0),          -- crossed-out "before" price, EUR

    tags           text[] not null default '{}',
    badge          text check (badge in ('new', 'archive', 'sold')),
    image_urls     text[] not null default '{}', -- first one is the main photo
    is_sold        boolean not null default false
);

create index if not exists products_is_sold_created_idx on public.products (is_sold, created_at desc);
create index if not exists products_category_idx on public.products (category);
create index if not exists products_size_idx on public.products (size);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
    before update on public.products
    for each row execute function public.set_updated_at();

alter table public.products enable row level security;

-- Everyone may read the catalogue. Sold pieces stay readable so their
-- product page can say "sold" instead of "not found"; the shop pages
-- filter them out with is_sold=eq.false.
drop policy if exists "anyone can read products" on public.products;
create policy "anyone can read products"
    on public.products for select
    to anon, authenticated
    using (true);

drop policy if exists "admins manage products" on public.products;
create policy "admins manage products"
    on public.products for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());


-- ---------------------------------------------------------------------
-- ORDERS — the public form never touches this table directly: it calls
-- /api/create-order, which uses the service-role key (bypasses RLS).
-- ---------------------------------------------------------------------
create table if not exists public.orders (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),

    product_id   uuid references public.products(id) on delete set null,
    product_name text,                 -- "Brand Name" at the time of the order

    full_name    text not null,
    email        text not null,
    mobile       text not null,
    street       text not null,
    city         text not null,
    postcode     text not null,
    notes        text,

    status       text not null default 'new'
                   check (status in ('new', 'contacted', 'confirmed', 'cancelled'))
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders"
    on public.orders for select
    to authenticated
    using (public.is_admin());

drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders"
    on public.orders for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());


-- ---------------------------------------------------------------------
-- EVENTS — the announcements block on the home page (up to 3 shown).
-- A post with an event_date hides itself the day after that date
-- (index.html asks only for event_date >= today).
-- ---------------------------------------------------------------------
create table if not exists public.events (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    title        text not null,
    body         text,
    image_url    text,
    image_path   text,                 -- path inside the site-media bucket, so a delete can remove the file
    event_date   date,
    time_text    text,                 -- free text, e.g. "11:00–19:00"
    link_url     text,
    link_label   text,

    is_published boolean not null default true,
    sort_order   integer not null default 0
);

create index if not exists events_listing_idx on public.events (is_published, sort_order, created_at desc);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
    before update on public.events
    for each row execute function public.set_updated_at();

alter table public.events enable row level security;

drop policy if exists "anyone can read published events" on public.events;
create policy "anyone can read published events"
    on public.events for select
    to anon, authenticated
    using (is_published);

drop policy if exists "admins manage events" on public.events;
create policy "admins manage events"
    on public.events for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());


-- ---------------------------------------------------------------------
-- GALLERY PHOTOS — about.html and the changing frame on index.html.
-- ---------------------------------------------------------------------
create table if not exists public.gallery_photos (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),

    image_url    text not null,
    image_path   text,                 -- path inside the site-media bucket
    caption      text,                 -- also used as the alt text
    sort_order   integer not null default 0,
    is_published boolean not null default true
);

create index if not exists gallery_listing_idx on public.gallery_photos (is_published, sort_order, created_at desc);

alter table public.gallery_photos enable row level security;

drop policy if exists "anyone can read published photos" on public.gallery_photos;
create policy "anyone can read published photos"
    on public.gallery_photos for select
    to anon, authenticated
    using (is_published);

drop policy if exists "admins manage photos" on public.gallery_photos;
create policy "admins manage photos"
    on public.gallery_photos for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());


-- ---------------------------------------------------------------------
-- RATE LIMIT — called by /api/create-order and /api/send-contact-message
-- with the service-role key:  rpc('check_rate_limit', { p_key, p_max,
-- p_window_seconds })  → true when the request may go ahead.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
    id     bigint generated always as identity primary key,
    key    text not null,
    hit_at timestamptz not null default now()
);

create index if not exists rate_limits_key_time_idx on public.rate_limits (key, hit_at desc);

alter table public.rate_limits enable row level security;   -- no policies: service role only

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    recent integer;
begin
    delete from public.rate_limits
     where key = p_key
       and hit_at < now() - make_interval(secs => p_window_seconds);

    select count(*) into recent from public.rate_limits where key = p_key;
    if recent >= p_max then
        return false;
    end if;

    insert into public.rate_limits (key) values (p_key);
    return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;


-- ---------------------------------------------------------------------
-- STORAGE — public read, admin write.
--   product-images : product photos (folder = product id)
--   site-media     : events/ and gallery/ pictures
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true), ('site-media', 'site-media', true)
on conflict (id) do nothing;

drop policy if exists "public can view site images" on storage.objects;
create policy "public can view site images"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id in ('product-images', 'site-media'));

drop policy if exists "admins upload site images" on storage.objects;
create policy "admins upload site images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id in ('product-images', 'site-media') and public.is_admin());

drop policy if exists "admins update site images" on storage.objects;
create policy "admins update site images"
    on storage.objects for update
    to authenticated
    using (bucket_id in ('product-images', 'site-media') and public.is_admin());

drop policy if exists "admins delete site images" on storage.objects;
create policy "admins delete site images"
    on storage.objects for delete
    to authenticated
    using (bucket_id in ('product-images', 'site-media') and public.is_admin());
