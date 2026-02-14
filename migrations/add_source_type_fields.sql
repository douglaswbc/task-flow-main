-- Adicionar novos campos em processing_logs para suportar mensagens individuais e grupos
ALTER TABLE processing_logs
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'group', -- 'individual' ou 'group'
  ADD COLUMN IF NOT EXISTS contact_name text,                -- Nome do contato/grupo
  ADD COLUMN IF NOT EXISTS contact_jid text;                 -- WhatsApp ID (ex: 559192294869@s.whatsapp.net)

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_processing_logs_source_type ON processing_logs(source_type);
CREATE INDEX IF NOT EXISTS idx_processing_logs_contact_jid ON processing_logs(contact_jid);

-- Comentários
COMMENT ON COLUMN processing_logs.source_type IS 'Origem da mensagem: individual ou group';
COMMENT ON COLUMN processing_logs.contact_name IS 'Nome do contato ou grupo que enviou o PDF';
COMMENT ON COLUMN processing_logs.contact_jid IS 'WhatsApp JID do remetente (ex: 559192294869@s.whatsapp.net ou 120363395968880499@g.us)';

-- Atualizar registros existentes para ter source_type = 'group'
UPDATE processing_logs 
SET source_type = 'group' 
WHERE source_type IS NULL AND whatsapp_group_id IS NOT NULL;

UPDATE processing_logs 
SET source_type = 'individual' 
WHERE source_type IS NULL AND whatsapp_group_id IS NULL;
