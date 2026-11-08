# F004 — Modo 5×2 por turmas

Estado: em andamento (implementado e testado localmente; instalação do backend pendente)

## Resultado esperado
Escolher entre o modo atual e o modo 5×2, com turmas de folgas semanais editáveis e sem mistura de escalas, rascunhos ou padrões.

## Escopo
- Regeneração mensal explícita por botão separado e confirmação: substitui escalas finais usando padrões atuais, preserva rascunhos, relê a versão e envia `expected_updated_at`. Alterações concorrentes interrompem a operação. Geração comum continua preservando datas existentes.
- Cada tabela extra tem `regraEscala`: `5x2` exige turma e aplica regras do modo; `propria` usa as regras anteriores do colaborador. Seleção, validação, calendário e geração consideram a escolha. Em registros antigos sem esse campo, tabelas de aprendizes conservam a exceção; demais seguem 5×2. O campo é salvo no JSON existente e independe do título após configurado.
- Exceção Jovem Aprendiz: as tabelas com título “Jovem Aprendiz” ou “Jovens Aprendizes” permitem seleção sem turma 5×2. Pessoas configuradas nessas tabelas mantêm regras anteriores de folga fixa/ciclo/extra, férias, ausências e contrato; não adotam o ciclo dominical das turmas. Mesmas regras na geração automática e validação do salvamento; duplicações permanecem bloqueadas.
- Ciclo individual de domingo: três trabalhados e quarto de folga, a cada 28 dias a partir de um domingo de folga cadastrado por participante. Semana de segunda a domingo; na semana de domingo livre, A fica com quinta/domingo e B sexta/domingo. Outras turmas escolhem o dia semanal mantido.
- Participantes selecionados no modal compartilhado com busca; transferências entre turmas pedem confirmação.
- Turma A inicia com folgas terça e quinta; turma B com quarta e sexta.
- Criar outras turmas, alterar nomes e selecionar exatamente dois dias distintos de folga.
- Selecionar membros pelo cadastro compartilhado de colaboradores, sem duplicação entre turmas na mesma vigência.
- Alterações de turma e dias de folga têm data de início; preservar versões anteriores.
- Separar por modo as configurações, padrões, escalas finais, rascunhos e armazenamento local.
- Identificar o modo na consulta, calendário, geração mensal e PDF.

## Critérios de aceite
- Salvar uma escala 5×2 em uma data já usada pelo modo atual não altera a escala atual.
- Um rascunho de um modo nunca é recuperado no outro.
- Na geração, os dois dias da turma resultam em folga; férias e ausências continuam prevalecendo.
- A vigência escolhida determina a turma usada em cada data; alterar hoje não reescreve escalas anteriores.
- Pessoas sem turma não são automaticamente alocadas no modo 5×2.
- Falha de salvamento conserva alterações e não anuncia sucesso.

## Regras e dependências
O backend atual identifica escalas e rascunhos somente por data e configurações pelo ID global. A separação exige alterações coordenadas no banco, workflow, frontend e chaves locais antes de disponibilizar o novo modo.

## Dúvidas bloqueantes
Nenhuma de negócio. Implantação exige atualização do Supabase e do workflow ativo do n8n.

## Validação e conclusão
Em 2026-11-08, `npm test` passou com APIs simuladas: isolamento de endpoints/SQL/cache, duas escalas na mesma data, geração mensal de 30 dias, duas vigências, membros e duplicação, falha de salvamento e bloqueio sem workflow. Tela mobile conferida. Migração e workflow entregues em `docs/DEPLOYMENT-5X2.md`; banco real não executado.
