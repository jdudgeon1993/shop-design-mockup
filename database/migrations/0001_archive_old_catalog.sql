-- 0001_archive_old_catalog.sql
-- Move the experimental catalog tables out of the API (not deleted).
-- Only catalog tables are touched: auth, profiles, cart, orders, consultations and
-- curated collections are left exactly as they are.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

alter table if exists public.pricing_rules set schema archive;
alter table if exists public.wholesale_catalog set schema archive;

revoke all on all tables in schema archive from anon, authenticated;
comment on schema archive is 'Old experimental catalog tables kept for reference (moved 2026-09-30). Safe to drop once reviewed.';
