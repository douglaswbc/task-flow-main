-- 1. Tabela de Perfis (Vinculada ao auth.users do Supabase)
-- Armazena dados do usuário como nome, avatar e cargo (visto em Settings.tsx)
create table public.profiles (
  id uuid references auth.users not null primary key,
  full_name text,
  avatar_url text,
  role text, -- Ex: 'Product Designer'
  updated_at timestamp with time zone
);

-- Habilita Row Level Security (RLS) para segurança
alter table public.profiles enable row level security;

-- Trigger para criar perfil automaticamente quando um usuário faz Signup
create function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. Tabela de Tarefas (Baseada em types.ts:Task)
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null, -- Para que cada usuário veja apenas suas tarefas
  title text not null,
  description text,
  status text check (status in ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BACKLOG')) default 'PENDING',
  origin text check (origin in ('Manual', 'Recorrente')) default 'Manual',
  is_high_priority boolean default false,
  external_id text, -- ID da tarefa no Bitrix24
  attachments jsonb default '[]'::jsonb, -- Lista de anexos [{name, url, size, type}]
  deadline timestamp with time zone,
  checklist jsonb default '[]'::jsonb,
  responsible_id text,
  created_at timestamp with time zone default now()
);

alter table public.tasks enable row level security;

-- Política de acesso: Usuário só vê suas próprias tarefas
create policy "Usuários podem ver suas próprias tarefas" on public.tasks
  for select using (auth.uid() = user_id);

create policy "Usuários podem criar tarefas" on public.tasks
  for insert with check (auth.uid() = user_id);

create policy "Usuários podem atualizar suas tarefas" on public.tasks
  for update using (auth.uid() = user_id);


-- 3. Tabela de Automações/Recorrências (Baseada em types.ts:Automation e RecurringTasks.tsx)
create table public.automations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  team text, -- Ex: 'Equipe de Engenharia'
  recurrence_type text check (recurrence_type in ('DIÁRIO', 'SEMANAL', 'MENSAL')),
  schedule_time time not null, -- Ex: '09:00'
  selected_days text[], -- Array de dias, ex: ['SEG', 'QUA']
  status text check (status in ('Ativo', 'Pausado')) default 'Ativo',
  last_run timestamp with time zone,
  next_run timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Política de acesso: Usuário só vê suas próprias automações
create policy "Usuários podem ver suas próprias automações" on public.automations
  for select using (auth.uid() = user_id);

create policy "Usuários podem criar automações" on public.automations
  for insert with check (auth.uid() = user_id);

create policy "Usuários podem atualizar suas automações" on public.automations
  for update using (auth.uid() = user_id);

create policy "Usuários podem deletar suas automações" on public.automations
  for delete using (auth.uid() = user_id);


-- 4. Tabela de Logs (Baseada em types.ts:LogEntry e LogsHistory.tsx)
create table public.automation_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  automation_id uuid references public.automations,
  task_name text not null, -- Nome da tarefa no momento da execução
  status text check (status in ('Sucesso', 'Erro')),
  execution_date timestamp with time zone default now(),
  error_message text -- Caso falhe
);

-- Política de acesso: Usuário só vê seus próprios logs
create policy "Usuários podem ver seus próprios logs" on public.automation_logs
  for select using (auth.uid() = user_id);


-- 5. Tabela de Notificações (Para o sistema de notificações do Header)
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  type text check (type in ('task_due', 'task_failed', 'system', 'reminder')) not null,
  title text not null,
  message text not null,
  read boolean default false,
  task_id uuid references public.tasks, -- Opcional, para notificações relacionadas a tarefas
  automation_id uuid references public.automations, -- Opcional, para notificações relacionadas a automações
  created_at timestamp with time zone default now()
);

alter table public.notifications enable row level security;

-- Política de acesso: Usuário só vê suas próprias notificações
create policy "Usuários podem ver suas próprias notificações" on public.notifications
  for select using (auth.uid() = user_id);

create policy "Sistema pode criar notificações" on public.notifications
  for insert with check (true); -- Permite que o sistema crie notificações

create policy "Usuários podem atualizar suas notificações" on public.notifications
  for update using (auth.uid() = user_id);


-- 6. Tabela de Integrações (Bitrix24, etc)
create table public.integrations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  service_name text not null, -- Ex: 'bitrix24'
  webhook_url text not null,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  unique(user_id, service_name)
);

alter table public.integrations enable row level security;

create policy "Usuários podem gerenciar suas próprias integrações" on public.integrations
  for all using (auth.uid() = user_id);


-- 7. Tabela de Grupos WhatsApp (Para automação de catálogos)
create table public.whatsapp_groups (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  whatsapp_id text not null, -- O JID do grupo, ex: 5511999999999@g.us
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  unique(user_id, whatsapp_id)
);

alter table public.whatsapp_groups enable row level security;

-- Política de acesso: Usuário só vê seus próprios grupos
create policy "Usuários podem ver seus próprios grupos WhatsApp" on public.whatsapp_groups
  for select using (auth.uid() = user_id);

create policy "Usuários podem criar grupos WhatsApp" on public.whatsapp_groups
  for insert with check (auth.uid() = user_id);

create policy "Usuários podem atualizar seus grupos WhatsApp" on public.whatsapp_groups
  for update using (auth.uid() = user_id);

create policy "Usuários podem deletar seus grupos WhatsApp" on public.whatsapp_groups
  for delete using (auth.uid() = user_id);


-- 8. Tabela de Configurações de Catálogo (Regras de categoria e cálculo)
create table public.catalog_configs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  category_name text not null, -- Ex: "Papelaria", "Utilidades"
  drive_folder_id text, -- ID da pasta do Google Drive
  markup_multiplier decimal default 3, -- O multiplicador de preço (ex: x3)
  discount_percentage decimal default 35, -- O desconto percentual (ex: 35%)
  created_at timestamp with time zone default now(),
  unique(user_id, category_name)
);

alter table public.catalog_configs enable row level security;

-- Política de acesso: Usuário só vê suas próprias configurações
create policy "Usuários podem ver suas próprias configurações de catálogo" on public.catalog_configs
  for select using (auth.uid() = user_id);

create policy "Usuários podem criar configurações de catálogo" on public.catalog_configs
  for insert with check (auth.uid() = user_id);

create policy "Usuários podem atualizar suas configurações de catálogo" on public.catalog_configs
  for update using (auth.uid() = user_id);

create policy "Usuários podem deletar suas configurações de catálogo" on public.catalog_configs
  for delete using (auth.uid() = user_id);


-- 9. Tabela de Logs de Processamento de Catálogos
create table public.processing_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  whatsapp_group_id uuid references public.whatsapp_groups on delete set null,
  catalog_name text not null, -- Nome do arquivo/catálogo recebido
  category text, -- Categoria identificada (pode ser null se não categorizado)
  status text check (status in ('success', 'error', 'pending')) default 'pending',
  original_price decimal, -- Preço original encontrado no catálogo
  final_price decimal, -- Preço final calculado após regras
  error_message text, -- Mensagem de erro caso status seja 'error'
  processed_at timestamp with time zone default now()
);

alter table public.processing_logs enable row level security;

-- Política de acesso: Usuário só vê seus próprios logs
create policy "Usuários podem ver seus próprios logs de processamento" on public.processing_logs
  for select using (auth.uid() = user_id);

create policy "Sistema pode criar logs de processamento" on public.processing_logs
  for insert with check (true); -- Permite que o sistema/automação crie logs

-- Índices para melhorar performance de consultas
create index idx_processing_logs_user_id on public.processing_logs(user_id);
create index idx_processing_logs_processed_at on public.processing_logs(processed_at desc);
create index idx_whatsapp_groups_user_id on public.whatsapp_groups(user_id);
create index idx_catalog_configs_user_id on public.catalog_configs(user_id);
