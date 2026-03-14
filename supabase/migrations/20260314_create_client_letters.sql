create table if not exists public.client_letters (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  obreiro_id uuid null references public.obreiros_auth(id) on delete set null,
  doc_id text null,
  doc_url text null,
  pdf_url text null,
  nome text not null,
  telefone text not null,
  email text null,
  email_pregador text null,
  ministerial text null,
  igreja_origem text null,
  origem text null,
  origem_totvs text null,
  origem_nome text null,
  igreja_destino text null,
  destino text null,
  destino_totvs text null,
  destino_nome text null,
  dia_pregacao text null,
  data_emissao text null,
  data_separacao text null,
  data_da_separacao text null,
  pastor_responsavel text null,
  telefone_pastor text null,
  assinatura_url text null,
  carimbo_igreja_url text null,
  carimbo_pastor_url text null,
  status_usuario text not null default 'AUTORIZADO',
  status_carta text not null default 'GERADA',
  envio text not null default '-',
  drive_status text not null default '-',
  tipo_fluxo text null,
  webhook_action text null,
  liberado_por text null,
  data_liberacao text null,
  data_envio text null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_letters_client_id_idx
  on public.client_letters (client_id);

create index if not exists client_letters_obreiro_id_idx
  on public.client_letters (obreiro_id);

create index if not exists client_letters_phone_idx
  on public.client_letters (telefone);

create index if not exists client_letters_doc_id_idx
  on public.client_letters (doc_id);

create index if not exists client_letters_created_at_idx
  on public.client_letters (created_at desc);

create unique index if not exists client_letters_client_doc_id_unique
  on public.client_letters (client_id, doc_id)
  where doc_id is not null and doc_id <> '';

drop trigger if exists trg_client_letters_updated_at on public.client_letters;

create trigger trg_client_letters_updated_at
before update on public.client_letters
for each row
execute function set_updated_at();
