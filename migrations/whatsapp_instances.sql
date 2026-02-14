-- Tabela de Instâncias WhatsApp (Vinculada aos perfis)
-- Permite que cada usuário conecte múltiplas instâncias do WhatsApp
create table public.whatsapp_instances (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  instance_name text not null unique, -- Nome único usado na Evolution API (será exibido na interface)
  token text, -- Hash/Token retornado pela Evolution API
  connection_status text check (connection_status in ('open', 'close', 'connecting')) default 'close',
  phone_number text, -- Número do WhatsApp conectado (ex: 5511999999999)
  profile_pic_url text, -- URL da foto de perfil do WhatsApp
  qr_code text, -- QR Code em base64 para conexão
  webhook_url text, -- URL do webhook para receber eventos
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Habilita Row Level Security
alter table public.whatsapp_instances enable row level security;

-- Políticas de acesso: Usuário só vê suas próprias instâncias
create policy "Usuários podem ver suas próprias instâncias WhatsApp" 
  on public.whatsapp_instances
  for select 
  using (profile_id = auth.uid());

create policy "Usuários podem criar instâncias WhatsApp" 
  on public.whatsapp_instances
  for insert 
  with check (profile_id = auth.uid());

create policy "Usuários podem atualizar suas instâncias WhatsApp" 
  on public.whatsapp_instances
  for update 
  using (profile_id = auth.uid());

create policy "Usuários podem deletar suas instâncias WhatsApp" 
  on public.whatsapp_instances
  for delete 
  using (profile_id = auth.uid());

-- Índices para melhorar performance
create index idx_whatsapp_instances_profile_id on public.whatsapp_instances(profile_id);
create index idx_whatsapp_instances_instance_name on public.whatsapp_instances(instance_name);

-- Trigger para atualizar updated_at automaticamente
create or replace function update_whatsapp_instances_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_update_whatsapp_instances_updated_at
  before update on public.whatsapp_instances
  for each row
  execute function update_whatsapp_instances_updated_at();
