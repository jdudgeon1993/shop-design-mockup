-- 0015_door_style_guide.sql
-- Customer-facing explanations for door styles and the 5-piece upgrade, plus the shape of
-- each door/drawer front so the site can draw it (until real product photos arrive).
--   door_profile:   shaker (flat recessed center panel) | raised (raised center panel)
--   drawer_profile: slab (smooth one-piece) | shaker (framed, matches the door)

alter table public.door_styles
  add column tagline text,
  add column customer_description text,
  add column door_profile text check (door_profile in ('shaker', 'raised')),
  add column drawer_profile text check (drawer_profile in ('slab', 'shaker'));

update public.door_styles d set
  tagline = x.tagline, customer_description = x.descr, door_profile = x.door, drawer_profile = x.drawer
from (values
  ('L5P', 'Classic Shaker · Smooth drawer fronts',
   'Timeless shaker doors (a flat center panel inside a clean, square frame) paired with smooth one-piece drawer fronts. The doors cover most of the cabinet face for a tailored look. Soft-close hinges and dovetail drawers come standard.',
   'shaker', 'slab'),
  ('G5P', 'Full-Overlay Shaker · Matching drawer fronts',
   'A modern take on the shaker. Doors and drawers cover the entire cabinet face for a seamless, furniture-like look, and the drawer fronts carry the same framed panel as the doors.',
   'shaker', 'shaker'),
  ('C5P', 'Traditional Raised Panel · Honey oak',
   'Solid oak doors with a raised, beveled center panel in a warm honey finish: a classic, traditional kitchen. A little of the cabinet frame shows around each door.',
   'raised', 'slab'),
  ('D5P', 'Simple Shaker · Our best value',
   'A crisp, simple shaker door with a smooth one-piece drawer front and soft-close hinges. The most budget-friendly way to get the shaker look.',
   'shaker', 'slab')
) as x (code, tagline, descr, door, drawer)
where d.code = x.code;

alter table public.upgrades add column customer_description text;
update public.upgrades set customer_description =
  'Swaps the smooth one-piece drawer fronts for framed 5-piece fronts that match the shaker doors, for a more finished, furniture-style look.'
where code = '5P';
