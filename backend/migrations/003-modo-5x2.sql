-- Executar após 001 e 002. Cria armazenamento independente, sem copiar escalas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.escalas_5x2 (LIKE public.escalas_simplificada INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.rascunhos_5x2 (LIKE public.escala_rascunhos INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.configuracoes_5x2 (LIKE public.configuracoes_sistema INCLUDING ALL);
-- Acesso via conexão PostgreSQL do n8n. Nenhuma política pública é criada.
ALTER TABLE public.escalas_5x2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rascunhos_5x2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_5x2 ENABLE ROW LEVEL SECURITY;
COMMIT;
