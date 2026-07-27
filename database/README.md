# Design Lab catalog database

`catalog_schema.sql` — the 10 tables (tiers, brands, room types, cabinet
categories, cabinets, cabinet dimensions, option categories, options,
brand options, cabinet option exclusions), with RLS enabled and public
read policies. Already applied to the real Supabase project.

`add_room_types.sql` is the incremental migration that added `room_types`
and `cabinet_categories.room_type_id` after the original schema was
already live — run it once in the Supabase SQL Editor if you haven't yet.
`catalog_schema.sql` is kept up to date with the full current shape (room
types included) for anyone spinning up a fresh project from scratch.

`cabinets` is a cabinet *style* (e.g. "2-Door Base Cabinet") — it has no
width or price of its own. `cabinet_dimensions` is the real, orderable
width/SKU/price for that style (a 24" and a 36" of the same style are
different rows). `brand_options` is the restrictions layer for
Finish/Door Style/Hardware: a brand only offers what's listed here, not
the full universal set across all brands. `room_types` (Kitchen/Bath/
Garage/Closet) is the first filter in the DIY flow — each
`cabinet_categories` row belongs to one room type, and a brand's
available room types are just whichever rooms its cabinets' categories
belong to (nothing stored on `brands` itself).

Data entry happens directly in Supabase's Table Editor — see
`proto/diy-catalog/` for the original Level → Brand → Cabinet → Customize
live page, and `proto/diy-flow/` for the newer Room Type → Brand →
Finish → Door Style → Cabinets → Account flow. Both read whatever's
actually in these tables, for testing as you fill them in.

Orders, cart, and checkout are a separate schema to design once this
catalog structure is stable and real vendor data is in place.
