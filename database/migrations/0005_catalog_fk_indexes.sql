-- 0005_catalog_fk_indexes.sql
-- Covering indexes for catalog foreign keys (Supabase performance advisor: unindexed_foreign_keys).

create index if not exists product_lines_vendor_idx     on public.product_lines (vendor_id);
create index if not exists price_codes_line_idx         on public.price_codes (line_id);
create index if not exists door_styles_line_idx         on public.door_styles (line_id);
create index if not exists upgrades_door_style_idx      on public.upgrades (door_style_id);
create index if not exists product_prices_book_idx      on public.product_prices (price_book_id);
create index if not exists modifications_book_idx       on public.modifications (price_book_id);
