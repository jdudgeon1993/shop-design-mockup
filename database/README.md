# Design Lab catalog database

Draft schema for the DIY catalog — not yet applied to the real Supabase project.

## Files

- **`catalog_schema.sql`** — the 9 tables (tiers, brands, cabinet categories,
  cabinets, cabinet dimensions, option categories, options, brand options,
  cabinet option exclusions), with RLS enabled and public read policies.
  Paste into the Supabase SQL Editor to create everything.
- **`seed/*.csv`** — fillable starter data for each table, using human-readable
  names/slugs instead of UUIDs so they're editable directly in a spreadsheet.
  Currently placeholder content (5 example brands, Black/White/Green
  finishes, a few Door Style/Hardware options carried over from the existing
  DIY wizard) — replace with real vendor lines, real finishes, real cabinet
  models and pricing as that information comes in.
- **`load_seed_data.sql`** — loads the CSVs into the real tables, resolving
  names/slugs into the actual foreign key UUIDs automatically. Full
  instructions are in the file's header comment (two options: Supabase Table
  Editor's CSV import, or `psql`'s `\copy` if you have a Postgres client).
  Safe to re-run after adding more rows to a CSV — it won't duplicate what's
  already loaded.

## How the pieces fit together

`cabinets` is a cabinet *style* (e.g. "2-Door Base Cabinet") — it has no
width or price of its own. `cabinet_dimensions` is the real, orderable
width/SKU/price for that style (a 24" and a 36" of the same style are
different rows). The app should only ever render widths that exist in
`cabinet_dimensions` for the chosen cabinet, so there's nothing invalid for a
customer to submit — the allow-list *is* the validation.

`brand_options` is the restrictions layer for Finish/Door Style/Hardware: a
brand only offers what's listed here, not the full universal set across all
brands. `cabinet_option_exclusions` exists for rare per-SKU exceptions (a
specific cabinet that can't take an option its brand otherwise allows).

## Not in scope yet

Orders, cart, and checkout are a separate schema to design once this catalog
structure is stable and real vendor data has been filled in.
