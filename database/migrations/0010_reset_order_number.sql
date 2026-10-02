-- 0010_reset_order_number.sql
-- A rolled-back test order consumed 1001; start real orders at 1001.
alter table public.orders alter column order_number restart with 1001;
