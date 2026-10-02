# Design Lab database (Supabase)

The site reads everything live from Supabase. `migrations/` is the full schema history, applied
in order to the production project (`nutgbxgnkvvruaoloqch`). Each file has a header comment
explaining what it does.

| Area | Tables / views |
|---|---|
| Catalog | `vendors`, `product_lines`, `price_codes`, `door_styles`, `finishes`, `upgrades`, `product_families`, `products`, `product_prices` (employees only), `modifications`, `product_modifications`, `price_books` |
| Storefront (public) | `storefront_offers` (retail price per product x door style), `storefront_variants`, `storefront_product_modifications`, `storefront_collections`, `storefront_modifications` |
| Collections | `curated_collections`, `curated_collection_items`, `curated_collection_styles` (flat price per door style) |
| Orders | `orders`, `order_items` (snapshots of what was bought), created only by `place_order()` |
| People | `profiles` (role: customer / designer / employee / admin), `addresses`, `consultation_rooms` |

**Pricing:** list prices are visible to employees only. Retail = list x dealer multiplier x retail
multiplier, set per product line in `private.line_pricing` (currently demo values).

**Not in this repo:** the catalog data itself (`seed/0001_cnc_v01_08.sql`, the CNC Luxor + Bedford
spec book with dealer list prices) is kept privately, because this repository is public.

`0006_backfill_employee_profiles_MANUAL.sql` was run by hand in the Supabase SQL Editor.
