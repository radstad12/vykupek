
-- Discord role access for POINTO LLC Pawnshop
alter table public.products
  add column if not exists required_role_id text;

alter table public.bonuses
  add column if not exists discord_role_id text;

create index if not exists products_required_role_id_idx
  on public.products(required_role_id);

create index if not exists bonuses_discord_role_id_idx
  on public.bonuses(discord_role_id);

-- IMPORTANT:
-- The existing project SQL currently grants public INSERT/UPDATE/DELETE access.
-- For a production deployment, remove those public write policies and perform
-- catalog administration through a protected admin path.
