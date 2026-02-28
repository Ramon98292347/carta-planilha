create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text,
  auth text,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
