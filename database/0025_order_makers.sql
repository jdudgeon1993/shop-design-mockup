-- 0025: the real maker on an order is for people with the 'makers' tag.
--
-- Step 1 (this file): order_makers() hands out order_items.vendor_snapshot to
-- 'makers' only. The dashboard reads makers through it.
-- Step 2 (0026, applied after the dashboard that uses this is live): stop the
-- team reading vendor_snapshot straight from order_items.

create or replace function public.order_makers(p_order_ids uuid[])
 returns table (item_id uuid, maker text)
 language sql stable security definer set search_path to ''
as $$
  select i.id, i.vendor_snapshot
    from public.order_items i
   where i.order_id = any(p_order_ids)
     and (select private.has_tag('makers'))
     and (select private.is_employee());
$$;
revoke all on function public.order_makers(uuid[]) from public, anon;
grant execute on function public.order_makers(uuid[]) to authenticated;
