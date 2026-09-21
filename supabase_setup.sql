create table if not exists public.categories (
  id text primary key,
  name text not null,
  icon text default '📦',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id text references public.categories(id) on delete set null,
  price numeric not null default 0,
  sale_price numeric not null default 0,
  image text,
  active boolean not null default true,
  admin_item boolean not null default false,
  required_role_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bonuses (
  id uuid primary key default gen_random_uuid(),
  threshold numeric not null default 0,
  bonus_type text not null default 'percent',
  bonus_value numeric not null default 0,
  discord_role_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_sort_order_idx on public.products(sort_order);
create index if not exists products_required_role_id_idx on public.products(required_role_id);
create index if not exists bonuses_discord_role_id_idx on public.bonuses(discord_role_id);
create index if not exists categories_sort_order_idx on public.categories(sort_order);

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.bonuses enable row level security;

drop policy if exists "public read categories" on public.categories;
drop policy if exists "public read products" on public.products;
drop policy if exists "public read bonuses" on public.bonuses;
drop policy if exists "public write categories" on public.categories;
drop policy if exists "public write products" on public.products;
drop policy if exists "public write bonuses" on public.bonuses;

create policy "public read categories"
on public.categories for select to anon, authenticated using (true);

create policy "public read products"
on public.products for select to anon, authenticated using (true);

create policy "public read bonuses"
on public.bonuses for select to anon, authenticated using (true);

create policy "public write categories"
on public.categories for all to anon, authenticated using (true) with check (true);

create policy "public write products"
on public.products for all to anon, authenticated using (true) with check (true);

create policy "public write bonuses"
on public.bonuses for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.bonuses;
