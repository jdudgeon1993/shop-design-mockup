-- 0026: apply AFTER the dashboard reading makers through order_makers() (0025) is live,
-- or the old Orders page breaks. The team reads every order_items column except
-- vendor_snapshot; the maker comes from order_makers() with the 'makers' tag.
-- place_order() (security definer) still writes it.

revoke select on public.order_items from authenticated;
grant select (id, order_id, item_type, product_id, collection_id, door_style_id, finish_id, upgrade_id, hinge_side,
              name_snapshot, sku_snapshot, mfg_sku_snapshot, finish_snapshot, mods_snapshot, unit_price, quantity, line_total, created_at)
  on public.order_items to authenticated;
