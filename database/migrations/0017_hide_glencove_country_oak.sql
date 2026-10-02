-- 0017: only Luxor and Dover are sold for now (the two lines CNC sent assets for).
-- Glencove and Country Oak stay in the catalog, just switched off; every storefront
-- view (storefront_offers, storefront_collections) already skips inactive styles.
-- To bring them back: update public.door_styles set is_active = true where code in ('G5P','C5P');
update public.door_styles set is_active = false where code in ('G5P', 'C5P');
