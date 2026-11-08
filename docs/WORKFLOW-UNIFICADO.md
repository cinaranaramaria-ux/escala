# Workflow único dos dois modos

Importar `backend/Escalas unificado.json` como um novo workflow no n8n. O arquivo tem 66 nós e 20 webhooks, mantendo os endereços que o frontend já usa.

1. Importar o arquivo e conferir a credencial PostgreSQL em todos os nós de banco, nos dois blocos.
2. Desativar/despublicar os workflows separados do modo atual e 5×2 que atendem essas rotas. Não excluir os arquivos antigos; conservar para retorno.
3. Publicar o workflow “Escalas - Atual e 5x2 (unificado)”. Rotas repetidas não podem ser atendidas simultaneamente por workflows antigos e pelo unificado.
4. Testar consultas nos dois modos. Confirmar uma gravação e leitura em cada modo antes de executar geração mensal.

Nenhuma mudança de frontend e nenhuma migração adicional são necessárias se as tabelas dos dois modos já existem (migrações 001, 002 e 003 aplicadas). As tabelas de escala/configuração/rascunho continuam separadas. Colaboradores usam `public.funcionarios` em ambos.

O arquivo preserva as referências de credenciais do workflow fornecido pelo usuário; a importação pode exigir reassociação no n8n. Webhooks estão com Authentication None e CORS permitido, conforme a configuração atual do projeto. Não foram feitas chamadas nem alterações no servidor.

Validação executada: `node tests/workflow-unificado.spec.cjs` — 20 caminhos únicos, IDs/nomes únicos, conexões dentro do bloco correto, respostas alcançáveis e SQL sem tabelas trocadas. Teste de importação/execução real no n8n permanece pendente.
