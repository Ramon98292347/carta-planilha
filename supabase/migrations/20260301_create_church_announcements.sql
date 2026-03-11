create table if not exists public.church_announcements (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  subtitle text null,
  type text not null default 'image',
  media_path text null,
  video_url text null,
  link_url text null,
  start_at timestamptz null,
  end_at timestamptz null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_announcements_pkey primary key (id)
);

create index if not exists idx_church_announcements_client_active
  on public.church_announcements (client_id, is_active, sort_order);

create trigger trg_church_announcements_updated_at
before update on public.church_announcements
for each row execute function set_updated_at();
