-- Adiciona campos necessários para armazenar PDFs de catálogos
-- na tabela processing_logs

-- Adiciona campo para URL do arquivo no Storage
alter table public.processing_logs 
  add column if not exists file_url text;

-- Adiciona campo para armazenar a mensagem de texto que acompanha o PDF
alter table public.processing_logs 
  add column if not exists text_message text;

-- Adiciona índice para buscar por status
create index if not exists idx_processing_logs_status 
  on public.processing_logs(status);

-- Comentários para documentação
comment on column public.processing_logs.file_url is 'URL pública do PDF no Supabase Storage (bucket: catalogs)';
comment on column public.processing_logs.text_message is 'Mensagem de texto que acompanhou o PDF (ex: "x3-35% de desconto")';
