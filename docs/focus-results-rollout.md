# Amostras e resultados

## Ativação

Código e banco precisam ser ativados juntos. No Lovable Cloud do projeto
`ttjzgszxrnmcsygtzfcu`, aplicar **somente** a migration
`supabase/migrations/20261011020650_focus_sample_results.sql` antes de publicar.
Não reaplicar a migration histórica `20260930150000_separate_focus_from_analysis.sql`:
a migration nova é independente e não reconstrói boletins nem preenche resultados antigos.

A página mostra uma mensagem de ativação pendente se as funções não existirem.
As consultas existentes continuam compatíveis antes da migration; a área de resultados permanece indisponível até a ativação. Aplicar a migration antes de publicar o novo fluxo é obrigatório.

## Uso e permissões

- Agente: menu **Minhas amostras**, consulta somente suas coletas sincronizadas.
- Supervisor: **Amostras e resultados**, consulta e lança o primeiro resultado de sua equipe.
- Coordenador: agentes vinculados diretamente ou por seus supervisores, sem inclusão de equipes desvinculadas.
- Administrador master: todos os agentes.
- Correções de resultado confirmado: coordenador/administrador, com justificativa obrigatória.

O resultado exige data da análise e referência do laboratório. Para positivo,
selecionar os depósitos realmente confirmados na coleta. O status é da coleta/visita;
não há um resultado independente por tubito nesta versão. O laboratório deve validar
a correspondência entre os depósitos selecionados e o laudo.

A confirmação é online, em uma transação: atualiza a visita e os depósitos, insere
histórico e recalcula somente indicadores de foco de boletins diários existentes.
Não inicia/encerra jornadas, não cria visitas/boletins, não altera datas operacionais.
Resultados negativos deixam de alimentar os alertas do mapa; o foco encontrado
original permanece registrado na visita e no histórico da coleta.

A referência e a justificativa não ficam acessíveis ao público. O agente consulta
histórico próprio; o gestor consulta apenas seu escopo. Escritas diretas e registros
antigos da fila offline não podem mudar um resultado confirmado ou trocar seu vínculo.
Uma tentativa protegida retorna erro: não descarte a fila; revise o registro rejeitado.
O contador de versão evita sobrescritas concorrentes e request_id evita duplicar o histórico
quando a mesma solicitação é reenviada.

## Validação local reproduzível

Sem credenciais ou acesso à produção:

```sh
npm install --prefix /tmp/vetor-focus-db @electric-sql/pglite
PGLITE_MODULE_PATH=/tmp/vetor-focus-db/node_modules/@electric-sql/pglite/dist/index.js node tests/database/focus-results.mjs
```

Os testes executam a migration em um Postgres descartável com tabelas mínimas
compatíveis. Não substituem a validação da migration no schema completo do Lovable.
Verificam agente somente leitura, supervisor da equipe, equipe externa bloqueada,
correção por coordenador/admin, versão concorrente, repetição idempotente, histórico,
recontagem de indicadores e proteção contra escritas offline antigas.

## Verificação real antes da publicação

1. Confirmar que a migration foi aplicada no projeto correto; executar Security Advisor.
2. Agente: verificar lista/histórico, nenhuma opção de confirmação.
3. Supervisor: confirmar coleta da própria equipe; outra equipe deve ficar inacessível.
4. Coordenador: equipe não vinculada deve permanecer inacessível; correção exige motivo.
5. Confirmar visita original, data, ciclo e jornada intactos; histórico com autor e horário.
6. Verificar positivos/negativos no mapa e nos boletins diário/semanal após atualizar.
7. Conferir sincronização com registros pendentes sem limpar o armazenamento do dispositivo.
8. Publicar somente após essas validações.
