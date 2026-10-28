-- =====================================================================
-- Applied to the live project (ozwydlffpvrcgnhdcjvw) on 2026-10-28.
-- The live database predates schema.sql: public.admins is keyed on "id"
-- (not "user_id"), and events, gallery_photos and the site-media bucket
-- were missing. This brings it up to what admin.html needs, without
-- touching products, orders or the existing check_rate_limit().
--
-- Owner accounts: anyone created in Authentication → Users with an email
-- listed in grant_owner_admin() becomes an admin automatically. To add
-- another owner, add the email there, or run:
--   insert into public.admins (id)
--   select id from auth.users where email = 'someone@example.com';
-- =====================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.admins where id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- EVENTS
create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    title text not null,
    body text,
    image_url text,
    image_path text,
    event_date date,
    time_text text,
    link_url text,
    link_label text,
    is_published boolean not null default true,
    sort_order integer not null default 0
);
create index if not exists events_listing_idx on public.events (is_published, sort_order, created_at desc);
drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
    for each row execute function public.set_updated_at();
alter table public.events enable row level security;
drop policy if exists "anyone can read published events" on public.events;
create policy "anyone can read published events" on public.events for select
    to anon, authenticated using (is_published or public.is_admin());
drop policy if exists "admins manage events" on public.events;
create policy "admins manage events" on public.events for all
    to authenticated using (public.is_admin()) with check (public.is_admin());

-- GALLERY PHOTOS
create table if not exists public.gallery_photos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    image_url text not null,
    image_path text,
    caption text,
    sort_order integer not null default 0,
    is_published boolean not null default true
);
create index if not exists gallery_listing_idx on public.gallery_photos (is_published, sort_order, created_at desc);
alter table public.gallery_photos enable row level security;
drop policy if exists "anyone can read published photos" on public.gallery_photos;
create policy "anyone can read published photos" on public.gallery_photos for select
    to anon, authenticated using (is_published or public.is_admin());
drop policy if exists "admins manage photos" on public.gallery_photos;
create policy "admins manage photos" on public.gallery_photos for all
    to authenticated using (public.is_admin()) with check (public.is_admin());

-- STORAGE: public read, admin-only write (old policy let any logged-in user upload)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true), ('site-media', 'site-media', true)
on conflict (id) do nothing;

drop policy if exists "Auth upload product images" on storage.objects;
drop policy if exists "Public read product images" on storage.objects;

drop policy if exists "public can view site images" on storage.objects;
create policy "public can view site images" on storage.objects for select
    to anon, authenticated using (bucket_id in ('product-images', 'site-media'));
drop policy if exists "admins upload site images" on storage.objects;
create policy "admins upload site images" on storage.objects for insert
    to authenticated with check (bucket_id in ('product-images', 'site-media') and public.is_admin());
drop policy if exists "admins update site images" on storage.objects;
create policy "admins update site images" on storage.objects for update
    to authenticated using (bucket_id in ('product-images', 'site-media') and public.is_admin());
drop policy if exists "admins delete site images" on storage.objects;
create policy "admins delete site images" on storage.objects for delete
    to authenticated using (bucket_id in ('product-images', 'site-media') and public.is_admin());

-- Grant admin automatically when an owner account is created for these emails.
create or replace function public.grant_owner_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if lower(new.email) in ('zakachalkata.store@gmail.com') then
        insert into public.admins (id) values (new.id) on conflict do nothing;
    end if;
    return new;
end; $$;
revoke all on function public.grant_owner_admin() from public, anon, authenticated;
drop trigger if exists on_owner_signup_grant_admin on auth.users;
create trigger on_owner_signup_grant_admin after insert on auth.users
    for each row execute function public.grant_owner_admin();

insert into public.admins (id)
select id from auth.users where lower(email) = 'zakachalkata.store@gmail.com'
on conflict do nothing;
