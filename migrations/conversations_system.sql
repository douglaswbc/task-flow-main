-- Tabela de Contatos (vinculada aos perfis)
create table public.contacts (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  phone text not null,
  name text,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(phone, profile_id)
);

-- Tabela de Conversas (vinculada a contatos e instâncias)
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete cascade not null,
  instance_id uuid references public.whatsapp_instances(id) on delete cascade not null,
  last_message text,
  last_timestamp timestamp with time zone,
  unread_count integer default 0,
  is_human_active boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(contact_id, instance_id)
);

-- Tabela de Mensagens
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender text check (sender in ('USER', 'OPERATOR', 'AI')) not null,
  content text not null,
  media_type text check (media_type in ('audio', 'image', 'video', 'document')),
  created_at timestamp with time zone default now()
);

-- Habilita Row Level Security
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Políticas RLS para Contacts
create policy "Usuários podem ver seus próprios contatos" 
  on public.contacts for select using (profile_id = auth.uid());

create policy "Usuários podem criar contatos" 
  on public.contacts for insert with check (profile_id = auth.uid());

create policy "Usuários podem atualizar seus contatos" 
  on public.contacts for update using (profile_id = auth.uid());

create policy "Usuários podem deletar seus contatos" 
  on public.contacts for delete using (profile_id = auth.uid());

-- Políticas RLS para Conversations
create policy "Usuários podem ver suas próprias conversas" 
  on public.conversations for select using (profile_id = auth.uid());

create policy "Usuários podem criar conversas" 
  on public.conversations for insert with check (profile_id = auth.uid());

create policy "Usuários podem atualizar suas conversas" 
  on public.conversations for update using (profile_id = auth.uid());

create policy "Usuários podem deletar suas conversas" 
  on public.conversations for delete using (profile_id = auth.uid());

-- Políticas RLS para Messages
create policy "Usuários podem ver mensagens de suas conversas" 
  on public.messages for select 
  using (
    conversation_id in (
      select id from public.conversations where profile_id = auth.uid()
    )
  );

create policy "Sistema pode criar mensagens" 
  on public.messages for insert with check (true);

-- Índices para melhorar performance
create index idx_contacts_profile_id on public.contacts(profile_id);
create index idx_contacts_phone on public.contacts(phone);
create index idx_conversations_profile_id on public.conversations(profile_id);
create index idx_conversations_contact_id on public.conversations(contact_id);
create index idx_conversations_instance_id on public.conversations(instance_id);
create index idx_messages_conversation_id on public.messages(conversation_id);
create index idx_messages_created_at on public.messages(created_at desc);

-- Triggers para atualizar updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_contacts_updated_at
  before update on public.contacts
  for each row
  execute function update_updated_at_column();

create trigger update_conversations_updated_at
  before update on public.conversations
  for each row
  execute function update_updated_at_column();
