create table if not exists public.client_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists client_sessions_client_id_idx on public.client_sessions (client_id);
create index if not exists client_sessions_expires_at_idx on public.client_sessions (expires_at);
