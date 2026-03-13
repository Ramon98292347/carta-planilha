create table if not exists public.client_churches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  totvs_church_id text not null,
  church_name text not null,
  parent_totvs_church_id text null,
  parent_church_name text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_churches_client_totvs_unique unique (client_id, totvs_church_id)
);

create index if not exists client_churches_client_id_idx
  on public.client_churches (client_id);

create index if not exists client_churches_parent_totvs_idx
  on public.client_churches (parent_totvs_church_id);

drop trigger if exists trg_client_churches_updated_at on public.client_churches;

create trigger trg_client_churches_updated_at
before update on public.client_churches
for each row
execute function set_updated_at();
