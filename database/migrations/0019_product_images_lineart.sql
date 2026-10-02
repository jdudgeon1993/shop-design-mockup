-- 0019: transparent line art (alpha = line) that the site colors via CSS mask.
alter table public.product_images drop constraint product_images_media_check;
alter table public.product_images add constraint product_images_media_check
  check (media in ('render', 'drawing', 'lineart'));
