# Design Lab catalog database

`catalog_schema.sql` — the 9 tables (tiers, brands, cabinet categories,
cabinets, cabinet dimensions, option categories, options, brand options,
cabinet option exclusions), with RLS enabled and public read policies.
Already applied to the real Supabase project.

`cabinets` is a cabinet *style* (e.g. "2-Door Base Cabinet") — it has no
width or price of its own. `cabinet_dimensions` is the real, orderable
width/SKU/price for that style (a 24" and a 36" of the same style are
different rows). `brand_options` is the restrictions layer for
Finish/Door Style/Hardware: a brand only offers what's listed here, not
the full universal set across all brands.

Data entry happens directly in Supabase's Table Editor — see
`proto/diy-catalog/` for a live page that reads whatever's actually in
these tables, for testing as you fill them in.

Orders, cart, and checkout are a separate schema to design once this
catalog structure is stable and real vendor data is in place.
