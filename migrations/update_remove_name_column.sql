-- Script para atualizar a tabela whatsapp_instances existente
-- Remove a coluna 'name' que não é mais necessária

-- Remove a coluna name
ALTER TABLE public.whatsapp_instances DROP COLUMN IF EXISTS name;

-- Verifica a estrutura atualizada
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'whatsapp_instances' 
-- ORDER BY ordinal_position;
