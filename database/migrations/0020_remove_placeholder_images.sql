-- 0020: stock (Unsplash) stand-ins are gone: real CNC drawings/photos come from product_images.
update public.product_families set image_url = null where image_url ilike '%unsplash.com%';
update public.door_styles      set image_url = null where image_url ilike '%unsplash.com%';
-- The Denver (Luxor kitchen): real CNC Luxor kitchens.
update public.curated_collections
   set hero_image_url = '/Assets/Images/cnc-luxor-white.webp',
       gallery_urls   = array['/Assets/Images/cnc-luxor-espresso.webp', '/Assets/Images/cnc-luxor-smoky-grey.webp', '/Assets/Images/cnc-luxor-harvest.webp']
 where slug = 'the-denver';
-- The Aspen (bath): no real bathroom photos yet; the site draws the set to scale instead.
update public.curated_collections set hero_image_url = null, gallery_urls = '{}' where slug = 'the-aspen';
