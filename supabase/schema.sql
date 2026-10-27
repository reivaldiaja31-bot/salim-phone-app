-- SALIM PHONE database schema for Supabase (PostgreSQL)
-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Pengguna',
  role text not null default 'cashier' check (role in ('owner','cashier','technician')),
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'HP',
  sku text,
  imei text,
  stock integer not null default 0 check (stock >= 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  sell_price numeric(14,2) not null default 0 check (sell_price >= 0),
  notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  total numeric(14,2) not null,
  profit numeric(14,2) not null,
  payment_method text not null default 'Tunai',
  customer_name text,
  note text,
  transaction_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text,
  device text not null,
  imei text,
  complaint text not null,
  diagnosis text,
  service_cost numeric(14,2) not null default 0,
  status text not null default 'Diterima',
  technician_name text,
  notes text,
  service_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'Tunai',
  expense_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  supplier text,
  note text,
  purchase_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_refund numeric(14,2) not null check (unit_refund >= 0),
  reason text not null,
  supplier text,
  return_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.set_created_by_name()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  select full_name into new.created_by_name from public.profiles where id = auth.uid();
  return new;
end $$;
drop trigger if exists sales_created_name on public.sales;
create trigger sales_created_name before insert on public.sales for each row execute function public.set_created_by_name();
drop trigger if exists expenses_created_name on public.expenses;
create trigger expenses_created_name before insert on public.expenses for each row execute function public.set_created_by_name();

create or replace function public.record_sale(
  p_product_id uuid, p_quantity integer, p_unit_price numeric,
  p_payment_method text default 'Tunai', p_customer_name text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare p public.products%rowtype; sale_id uuid; actor_role text;
begin
  actor_role := public.current_role();
  if actor_role not in ('owner','cashier') then raise exception 'Akses ditolak: hanya pemilik/kasir dapat mencatat penjualan'; end if;
  if p_quantity <= 0 or p_unit_price < 0 then raise exception 'Jumlah/harga tidak valid'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'Barang tidak ditemukan'; end if;
  if p.stock < p_quantity then raise exception 'Stok tidak cukup. Stok tersedia: %', p.stock; end if;
  update public.products set stock=stock-p_quantity where id=p_product_id;
  insert into public.sales(product_id,product_name_snapshot,quantity,unit_price,unit_cost,total,profit,payment_method,customer_name,note,created_by)
  values(p.id,p.name,p_quantity,p_unit_price,p.cost_price,p_quantity*p_unit_price,p_quantity*(p_unit_price-p.cost_price),p_payment_method,p_customer_name,p_note,auth.uid())
  returning id into sale_id;
  return sale_id;
end $$;

create or replace function public.record_purchase(
  p_product_id uuid, p_quantity integer, p_unit_cost numeric, p_supplier text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare p public.products%rowtype; purchase_id uuid;
begin
  if public.current_role() <> 'owner' then raise exception 'Hanya pemilik dapat mencatat pembelian'; end if;
  if p_quantity <= 0 or p_unit_cost < 0 then raise exception 'Jumlah/harga tidak valid'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'Barang tidak ditemukan'; end if;
  update public.products set stock=stock+p_quantity,cost_price=p_unit_cost where id=p_product_id;
  insert into public.purchases(product_id,product_name_snapshot,quantity,unit_cost,supplier,note,created_by)
  values(p.id,p.name,p_quantity,p_unit_cost,p_supplier,p_note,auth.uid()) returning id into purchase_id;
  return purchase_id;
end $$;

create or replace function public.record_return(
  p_product_id uuid, p_quantity integer, p_unit_refund numeric, p_reason text, p_supplier text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare p public.products%rowtype; return_id uuid;
begin
  if public.current_role() <> 'owner' then raise exception 'Hanya pemilik dapat mencatat retur'; end if;
  if p_quantity <= 0 or p_unit_refund < 0 then raise exception 'Jumlah/nilai retur tidak valid'; end if;
  select * into p from public.products where id=p_product_id for update;
  if not found then raise exception 'Barang tidak ditemukan'; end if;
  if p.stock < p_quantity then raise exception 'Stok tidak cukup untuk retur'; end if;
  update public.products set stock=stock-p_quantity where id=p_product_id;
  insert into public.returns(product_id,product_name_snapshot,quantity,unit_refund,reason,supplier,created_by)
  values(p.id,p.name,p_quantity,p_unit_refund,p_reason,p_supplier,auth.uid()) returning id into return_id;
  return return_id;
end $$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.services enable row level security;
alter table public.expenses enable row level security;
alter table public.purchases enable row level security;
alter table public.returns enable row level security;

-- Authenticated users can read profiles; only owner can change role/profile records.
drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_authenticated" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles_owner_manage" on public.profiles;
create policy "profiles_owner_manage" on public.profiles for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');

drop policy if exists "products_read" on public.products;
create policy "products_read" on public.products for select to authenticated using (public.current_role() in ('owner','cashier','technician'));
drop policy if exists "products_owner_insert" on public.products;
create policy "products_owner_insert" on public.products for insert to authenticated with check (public.current_role()='owner');
drop policy if exists "products_owner_update" on public.products;
create policy "products_owner_update" on public.products for update to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
drop policy if exists "products_owner_delete" on public.products;
create policy "products_owner_delete" on public.products for delete to authenticated using (public.current_role()='owner');

drop policy if exists "sales_read_owner_cashier" on public.sales;
create policy "sales_read_owner_cashier" on public.sales for select to authenticated using (public.current_role() in ('owner','cashier'));
drop policy if exists "services_read_all_staff" on public.services;
create policy "services_read_all_staff" on public.services for select to authenticated using (public.current_role() in ('owner','cashier','technician'));
drop policy if exists "services_insert_staff" on public.services;
create policy "services_insert_staff" on public.services for insert to authenticated with check (public.current_role() in ('owner','cashier'));
drop policy if exists "services_update_staff" on public.services;
create policy "services_update_staff" on public.services for update to authenticated using (public.current_role() in ('owner','technician')) with check (public.current_role() in ('owner','technician'));

drop policy if exists "expenses_read_owner_cashier" on public.expenses;
create policy "expenses_read_owner_cashier" on public.expenses for select to authenticated using (public.current_role() in ('owner','cashier'));
drop policy if exists "expenses_insert_owner_cashier" on public.expenses;
create policy "expenses_insert_owner_cashier" on public.expenses for insert to authenticated with check (public.current_role() in ('owner','cashier'));
drop policy if exists "expenses_owner_update" on public.expenses;
create policy "expenses_owner_update" on public.expenses for update to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');

drop policy if exists "purchases_owner_all" on public.purchases;
create policy "purchases_owner_all" on public.purchases for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');
drop policy if exists "returns_owner_all" on public.returns;
create policy "returns_owner_all" on public.returns for all to authenticated using (public.current_role()='owner') with check (public.current_role()='owner');

revoke all on function public.record_sale(uuid,integer,numeric,text,text,text) from public;
grant execute on function public.record_sale(uuid,integer,numeric,text,text,text) to authenticated;
revoke all on function public.record_purchase(uuid,integer,numeric,text,text) from public;
grant execute on function public.record_purchase(uuid,integer,numeric,text,text) to authenticated;
revoke all on function public.record_return(uuid,integer,numeric,text,text) from public;
grant execute on function public.record_return(uuid,integer,numeric,text,text) to authenticated;

grant select on public.profiles, public.products, public.sales, public.services, public.expenses, public.purchases, public.returns to authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert, update on public.services to authenticated;
grant insert, update on public.expenses to authenticated;
grant select, insert on public.sales to authenticated;
grant select, insert on public.purchases, public.returns to authenticated;

-- IMPORTANT: after creating your first auth user in Supabase, make that user owner:
-- update public.profiles set role='owner', full_name='Nama Pemilik' where id='AUTH_USER_UUID';
