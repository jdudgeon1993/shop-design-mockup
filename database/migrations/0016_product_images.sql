-- 0016: product photos (CNC renders + line drawings) in a PRIVATE storage bucket.
-- Browsers never read the bucket directly: no storage.objects policies are
-- granted to anon/authenticated. The `image-urls` Edge Function (service role)
-- hands out short-lived signed URLs, and only for paths listed in
-- public.product_images. Originals never leave the office: only ~900px
-- watermarked WebP copies are uploaded.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 1048576, array['image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.product_images (
  id            bigint generated always as identity primary key,
  product_id    integer  references public.products(id) on delete cascade,
  family_id     integer  references public.product_families(id) on delete cascade,
  door_style_id smallint not null references public.door_styles(id) on delete cascade,
  finish_id     smallint references public.finishes(id) on delete cascade, -- null = any finish (line drawings)
  kind          text not null default 'product'
                check (kind in ('product', 'family', 'door_sample')),
  media         text not null default 'render' check (media in ('render', 'drawing')),
  view          text not null default 'standard' check (view in ('standard', '5p')),
  hinge         text check (hinge in ('L', 'R')),
  storage_path  text not null unique,
  source_file   text,
  width         smallint,
  height        smallint,
  sort_order    smallint not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  check (kind <> 'product' or product_id is not null),
  check (kind <> 'family' or family_id is not null)
);

create index product_images_product_idx on public.product_images (product_id, door_style_id, finish_id) where is_active;
create index product_images_family_idx  on public.product_images (family_id, door_style_id, finish_id) where is_active;
create index product_images_style_idx   on public.product_images (door_style_id, kind) where is_active;

alter table public.product_images enable row level security;

-- Metadata only (which photo belongs to which product) — the photos themselves
-- stay behind signed URLs.
create policy "product_images: public read active"
  on public.product_images for select to anon, authenticated
  using (is_active);

comment on table public.product_images is
  'Photo index for the private product-images bucket. Signed URLs come from the image-urls Edge Function.';
