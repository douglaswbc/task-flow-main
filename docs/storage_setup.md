# Guia: Configuração do Storage para Catálogos

## Criar Bucket no Supabase

1. Acesse o **Supabase Dashboard**
2. Vá em **Storage** no menu lateral
3. Clique em **Create a new bucket**
4. Configure:
   - **Name**: `catalogs`
   - **Public bucket**: ✅ **Sim** (para gerar URLs públicas)
   - **File size limit**: 50 MB (ou conforme necessário)
   - **Allowed MIME types**: `application/pdf`

5. Clique em **Create bucket**

## Configurar Políticas de Acesso (RLS)

Após criar o bucket, configure as políticas:

### Política 1: Permitir Upload (Authenticated Users)

```sql
create policy "Usuários autenticados podem fazer upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'catalogs' 
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### Política 2: Permitir Leitura Pública

```sql
create policy "Qualquer um pode ler catálogos"
on storage.objects for select
to public
using (bucket_id = 'catalogs');
```

### Política 3: Permitir Deleção (Apenas Dono)

```sql
create policy "Usuários podem deletar seus próprios catálogos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'catalogs' 
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

## Estrutura de Pastas

Os PDFs serão salvos seguindo este padrão:

```
catalogs/
  └── {profile_id}/
      └── catalogs/
          └── {timestamp}_{nome_arquivo}.pdf
```

**Exemplo:**
```
catalogs/
  └── 550e8400-e29b-41d4-a716-446655440000/
      └── catalogs/
          └── 1707849600000_catalogo_papelaria.pdf
```

## Variáveis de Ambiente

Certifique-se de que a Edge Function tem acesso ao Storage:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
```

A `SERVICE_ROLE_KEY` permite bypass das políticas RLS para operações do servidor.

## Testar Upload

Você pode testar manualmente via SQL Editor:

```sql
-- Ver todos os arquivos no bucket
select * from storage.objects where bucket_id = 'catalogs';

-- Ver arquivos de um usuário específico
select * from storage.objects 
where bucket_id = 'catalogs' 
and name like 'SEU_PROFILE_ID/%';
```

## Limpar Arquivos Antigos (Opcional)

Para evitar acúmulo de arquivos, você pode criar uma função que deleta PDFs antigos:

```sql
create or replace function delete_old_catalogs()
returns void as $$
begin
  delete from storage.objects
  where bucket_id = 'catalogs'
  and created_at < now() - interval '90 days';
end;
$$ language plpgsql security definer;
```

E agendar via cron (se disponível no seu plano Supabase).
