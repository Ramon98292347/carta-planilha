-- Obreiros: status da carta sincronizado com liberacao_automatica

alter table public.obreiros_auth
add column if not exists liberacao_automatica boolean not null default false;

alter table public.obreiros_auth
add column if not exists status_carta text not null default 'GERADA';

-- Backfill inicial para manter consistencia nos registros atuais
update public.obreiros_auth
set status_carta = case
  when liberacao_automatica then 'LIBERADA'
  else 'GERADA'
end;

create or replace function public.sync_status_carta_from_auto()
returns trigger
language plpgsql
as $$
begin
  new.status_carta := case
    when coalesce(new.liberacao_automatica, false) then 'LIBERADA'
    else 'GERADA'
  end;
  return new;
end;
$$;

drop trigger if exists trg_obreiros_auth_status_carta on public.obreiros_auth;

create trigger trg_obreiros_auth_status_carta
before insert or update of liberacao_automatica
on public.obreiros_auth
for each row
execute function public.sync_status_carta_from_auto();

