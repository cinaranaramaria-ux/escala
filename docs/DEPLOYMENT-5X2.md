# Ativação do modo 5×2

O frontend oferece `inicio.html` para escolher o modo. O link antigo continua abrindo a escala atual e inclui “Trocar modo”. O 5×2 usa `index.html?modo=5x2`.

## Instalação
1. No SQL Editor do Supabase, executar `backend/migrations/003-modo-5x2.sql`. As migrações 001 e 002 do projeto devem estar aplicadas previamente. A nova migração cria três tabelas vazias e não copia nem altera as escalas atuais.
2. No n8n, **importar como novo workflow** `backend/Escalas 5x2.json`. Não substituir nem desativar o workflow atual. Os caminhos deste arquivo começam com `5x2-`.
3. Associar a credencial PostgreSQL aos nós de banco, usando a conexão do Supabase que já funciona no workflow atual. As novas tabelas têm RLS habilitada; a conexão do n8n precisa ter acesso como proprietário/bypass RLS. Não criar acesso público às tabelas.
4. Publicar o workflow 5×2. Webhooks estão sem autenticação, conforme o estado atual do projeto; preservar CORS para o frontend.
5. Abrir o modo 5×2. Em “Turmas e folgas”, informar a vigência, marcar os membros de A e B e salvar. A começa com terça/quinta; B com quarta/sexta. É possível criar novas turmas e transferir membros.
6. Configurar turnos e salvar o padrão do formulário dentro do 5×2. Uma pessoa sem turma vigente não entra na geração. Para gerar um mês inteiro, deve haver turmas com membros em todas as datas desse mês.
7. Confirmar primeiro uma gravação e consulta 5×2 em uma data de teste, conferindo também que a escala atual da mesma data continua intacta. Depois utilizar a geração mensal.

## Separação e vigência
- Escalas, rascunhos, configurações/padrões e cache são próprios de cada modo. Sem os novos endpoints, o 5×2 informa que não está conectado; não tenta gravar no modo atual.
- Colaboradores, férias e ausências continuam compartilhados. Folgas fixas/de ciclo e extras do cadastro atual não são aplicadas ao 5×2: as folgas semanais vêm das turmas. Feriados e opções de cada modo ficam na configuração daquele modo.
- Cada salvamento de turmas cria uma versão com data de início. A regra mais recente com início anterior ou igual à data da escala é usada. Alterar a mesma vigência pede confirmação. Escalas já salvas nunca são regeneradas por essa ação.
- Falha ao salvar turmas mantém a edição na tela e uma cópia local recuperável pelo botão “Recuperar alterações pendentes”.
- O PDF identifica o modo 5×2. As proteções de impressão e confirmação de salvamento continuam ativas.

## Validação realizada
`npm test` passou com todos os endpoints interceptados: modo atual, geração de 30 dias 5×2, vigências, exclusão de membros sem turma, duplicação, falha de configuração, cache separado e indisponibilidade do workflow. Tela mobile conferida. A migração e o workflow não foram executados contra o Supabase/n8n de produção; essa homologação depende da instalação acima.
