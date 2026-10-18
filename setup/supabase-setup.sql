-- =====================================================================
--  GM Scrapmetal Limited: Supabase setup (run once, safe to re-run)
-- ---------------------------------------------------------------------
--  Creates everything the admin dashboard and public website need:
--    1. Admin allow-list + is_admin() check
--    2. gallery_photos  (public sees published photos only)
--    3. enquiries       (website forms can add; only admins can read)
--    4. site_settings   (contact details editable from the dashboard)
--    5. "gallery" storage bucket + upload rules
--
--  HOW TO USE
--  1. Supabase dashboard → SQL Editor → New query
--  2. Paste this whole file
--  3. In section 1 below, replace the placeholder email (marked with ←)
--     with the email of the admin account you created under
--     Authentication → Users
--  4. Press RUN. You should see "Success. No rows returned".
--
--  Row Level Security (RLS) stays ON for every table. The rules below
--  are enforced by the database itself, not by the website's code.
-- =====================================================================


-- Helper: keep "updated_at" current on every change
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- =====================================================================
-- 1. ADMINISTRATORS
-- =====================================================================
-- Only emails in this list are administrators. Logging in is not enough:
-- an account must ALSO be listed here. The list cannot be read or changed
-- from the website (RLS on, no policies). Manage it only in the SQL Editor.
create table if not exists public.admin_users (
  email      text primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

insert into public.admin_users (email) values
  ('YOUR-ADMIN-EMAIL@example.com')          -- ← replace with your admin email
  -- , ('second-admin@example.com')
on conflict do nothing;

-- true when the current request comes from a logged-in, listed admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and exists (
       select 1 from public.admin_users
       where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- =====================================================================
-- 2. GALLERY PHOTOS
-- =====================================================================
create table if not exists public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null,                 -- file name in the "gallery" bucket
  title       text not null default '',
  caption     text not null default '',
  alt         text not null default '',      -- description for screen readers
  category    text not null default '',
  taken_on    date,
  published   boolean not null default true, -- false = hidden from visitors
  sort_order  integer not null default 0,    -- smaller numbers show first
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- (for projects created with an earlier version of this script)
alter table public.gallery_photos add column if not exists title      text not null default '';
alter table public.gallery_photos add column if not exists published  boolean not null default true;
alter table public.gallery_photos add column if not exists updated_at timestamptz not null default now();

alter table public.gallery_photos drop constraint if exists gallery_photos_lengths;
alter table public.gallery_photos add constraint gallery_photos_lengths check (
  char_length(image_path) <= 300 and char_length(title) <= 160 and char_length(caption) <= 500
  and char_length(alt) <= 300 and char_length(category) <= 60
);

drop trigger if exists gallery_photos_updated_at on public.gallery_photos;
create trigger gallery_photos_updated_at before update on public.gallery_photos
  for each row execute function public.set_updated_at();

alter table public.gallery_photos enable row level security;
grant select on public.gallery_photos to anon, authenticated;
grant insert, update, delete on public.gallery_photos to authenticated;

drop policy if exists "Anyone can view photos" on public.gallery_photos;
drop policy if exists "View published photos" on public.gallery_photos;
create policy "View published photos" on public.gallery_photos
  for select to anon, authenticated
  using (published or public.is_admin());

drop policy if exists "Admins can add photos" on public.gallery_photos;
create policy "Admins can add photos" on public.gallery_photos
  for insert to authenticated with check (public.is_admin());

drop policy if exists "Admins can edit photos" on public.gallery_photos;
create policy "Admins can edit photos" on public.gallery_photos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can delete photos" on public.gallery_photos;
create policy "Admins can delete photos" on public.gallery_photos
  for delete to authenticated using (public.is_admin());


-- =====================================================================
-- 3. ENQUIRIES (from the Sell Your Scrap, Buyer and Contact forms)
-- =====================================================================
create table if not exists public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                 -- supplier | buyer | contact
  name        text not null default '',
  company     text not null default '',
  phone       text not null default '',
  email       text not null default '',
  summary     text not null default '',      -- material / subject, for the list view
  details     jsonb not null default '[]'::jsonb,  -- all answers: [["Label","Value"], ...]
  status      text not null default 'New',
  admin_notes text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint enquiries_type check (type in ('supplier', 'buyer', 'contact')),
  constraint enquiries_status check (status in ('New', 'Contacted', 'In Discussion', 'Completed', 'Archived')),
  constraint enquiries_lengths check (
    char_length(name) <= 160 and char_length(company) <= 160 and char_length(phone) <= 40
    and char_length(email) <= 160 and char_length(summary) <= 300 and char_length(admin_notes) <= 4000
  ),
  constraint enquiries_details check (jsonb_typeof(details) = 'array' and pg_column_size(details) <= 20000)
);
create index if not exists enquiries_type_created on public.enquiries (type, created_at desc);

drop trigger if exists enquiries_updated_at on public.enquiries;
create trigger enquiries_updated_at before update on public.enquiries
  for each row execute function public.set_updated_at();

-- Basic flood protection: refuse new enquiries if more than 60 arrived
-- in the last 10 minutes (normal traffic is far below this).
create or replace function public.limit_enquiry_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.enquiries where created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Too many enquiries right now. Please try again later.';
  end if;
  return new;
end;
$$;
drop trigger if exists enquiries_rate_limit on public.enquiries;
create trigger enquiries_rate_limit before insert on public.enquiries
  for each row execute function public.limit_enquiry_rate();

alter table public.enquiries enable row level security;
grant insert on public.enquiries to anon, authenticated;
grant select, update, delete on public.enquiries to authenticated;

-- Website visitors may ADD an enquiry (as "New"), but never read any.
drop policy if exists "Visitors can send enquiries" on public.enquiries;
create policy "Visitors can send enquiries" on public.enquiries
  for insert to anon, authenticated
  with check (status = 'New' and admin_notes = '');

drop policy if exists "Admins can read enquiries" on public.enquiries;
create policy "Admins can read enquiries" on public.enquiries
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins can update enquiries" on public.enquiries;
create policy "Admins can update enquiries" on public.enquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can delete enquiries" on public.enquiries;
create policy "Admins can delete enquiries" on public.enquiries
  for delete to authenticated using (public.is_admin());


-- =====================================================================
-- 4. WEBSITE SETTINGS (contact details shown on the public site)
-- =====================================================================
create table if not exists public.site_settings (
  id         integer primary key default 1,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_settings_single_row check (id = 1),
  constraint site_settings_object check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000)
);
insert into public.site_settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

drop trigger if exists site_settings_updated_at on public.site_settings;
create trigger site_settings_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;

drop policy if exists "Anyone can read settings" on public.site_settings;
create policy "Anyone can read settings" on public.site_settings
  for select to anon, authenticated using (true);

drop policy if exists "Admins can update settings" on public.site_settings;
create policy "Admins can update settings" on public.site_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());


-- =====================================================================
-- 5. IMAGE STORAGE: bucket "gallery"
-- =====================================================================
-- Public bucket: anyone can VIEW images by their link.
-- Only admins can upload / replace / delete. Images only, max 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can list gallery images" on storage.objects;
create policy "Admins can list gallery images" on storage.objects
  for select to authenticated using (bucket_id = 'gallery' and public.is_admin());

drop policy if exists "Admins can upload gallery images" on storage.objects;
create policy "Admins can upload gallery images" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery' and public.is_admin());

drop policy if exists "Admins can update gallery images" on storage.objects;
create policy "Admins can update gallery images" on storage.objects
  for update to authenticated using (bucket_id = 'gallery' and public.is_admin())
  with check (bucket_id = 'gallery' and public.is_admin());

drop policy if exists "Admins can delete gallery images" on storage.objects;
create policy "Admins can delete gallery images" on storage.objects
  for delete to authenticated using (bucket_id = 'gallery' and public.is_admin());
