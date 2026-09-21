-- POINTO LLC pawnshop database
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Ostatní',
  unit_price numeric(12,2) not null check (unit_price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.bonuses (
  id uuid primary key default gen_random_uuid(),
  threshold numeric(12,2) not null check (threshold >= 0),
  bonus_type text not null check (bonus_type in ('percent','fixed')),
  bonus_value numeric(12,2) not null check (bonus_value >= 0),
  active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.bonuses enable row level security;

-- Only authenticated staff can read/write raw prices and bonus rules.
create policy "authenticated can read products" on public.products for select to authenticated using (true);
create policy "authenticated can insert products" on public.products for insert to authenticated with check (true);
create policy "authenticated can update products" on public.products for update to authenticated using (true) with check (true);
create policy "authenticated can delete products" on public.products for delete to authenticated using (true);
create policy "authenticated can manage bonuses" on public.bonuses for all to authenticated using (true) with check (true);

-- Public catalog intentionally omits unit_price.
create or replace function public.get_public_products()
returns table(id uuid,name text,category text,active boolean,sort_order integer)
language sql security definer set search_path = public
as $$
  select id,name,category,active,sort_order from public.products where active = true order by sort_order, name;
$$;

-- Admin RPC returns prices; protected by auth token.
create or replace function public.get_admin_products()
returns table(id uuid,name text,category text,unit_price numeric,active boolean,sort_order integer)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  return query select p.id,p.name,p.category,p.unit_price,p.active,p.sort_order from public.products p order by p.sort_order,p.name;
end;
$$;

-- Secure quote calculation: public users send product IDs + quantities, never prices.
create or replace function public.calculate_quote(items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  subtotal numeric := 0;
  bonus numeric := 0;
  total numeric := 0;
  b record;
  item jsonb;
  q integer;
  pid uuid;
  unit numeric;
begin
  if jsonb_typeof(items) <> 'array' then raise exception 'Invalid items'; end if;
  for item in select * from jsonb_array_elements(items) loop
    pid := (item->>'product_id')::uuid;
    q := greatest(0, least(999, coalesce((item->>'quantity')::integer,0)));
    select p.unit_price into unit from public.products p where p.id = pid and p.active = true;
    if unit is null then raise exception 'Product unavailable'; end if;
    subtotal := subtotal + unit * q;
  end loop;
  select * into b from public.bonuses where active = true and threshold <= subtotal order by threshold desc, priority desc limit 1;
  if found then
    if b.bonus_type = 'percent' then bonus := round(subtotal * b.bonus_value / 100, 2);
    else bonus := b.bonus_value;
    end if;
  end if;
  total := subtotal + bonus;
  return jsonb_build_object('subtotal',subtotal,'bonus',bonus,'total',total);
end;
$$;

grant execute on function public.get_public_products() to anon, authenticated;
grant execute on function public.calculate_quote(jsonb) to anon, authenticated;
grant execute on function public.get_admin_products() to authenticated;

-- Optional starter data.
insert into public.products (name,category,unit_price,sort_order) values
('Zlaté mince','Zlato',50,1),('Zlaté prsteny','Šperky',80,2),('Hodinky','Hodinky',75,3),('Klenoty','Šperky',60,4),
('Zvláštní karty','Sběratelské',550,5),('Náhrdelníky','Šperky',70,6),('Autodíly','Auto',10,7),('Golfová hůl','Sport',125,8),
('Kulečníkové tágo','Sport',120,9),('Jiné věci na domluvě','Ostatní',100,10)
on conflict do nothing;
