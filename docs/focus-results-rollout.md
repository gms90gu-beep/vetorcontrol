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

## Atualização de gestão de amostras (12/10/2026 UTC)

Aplicar depois da migration inicial: `supabase/migrations/20261012004450_improve_focus_samples_management.sql`.
A migration somente substitui autorização e adiciona a leitura filtrada `list_focus_samples_v2`:
nenhuma amostra, laudo, visita, jornada ou boletim é criado/apagado/preenchido automaticamente.
Contas desativadas não podem ler nem lançar pelas funções de amostras; o escopo de equipe continua obrigatório.

A tela compartilhada oferece agente, período operacional, ciclo, resultado e busca literal por agente,
imóvel, rua, quarteirão ou referência de laudo. Contadores abrangem todos os registros desses filtros,
independentemente da página e do cartão de resultado selecionado. Paginação usa total exato.
O cache inclui usuário/cargo e é removido ao sair da tela ou mudar de identidade.
Correções preenchem laudo e data do último resultado, mas sempre exigem nova justificativa.
O histórico mostra os depósitos positivos de cada versão.

Após salvar, uma leitura separada confere a existência do boletim diário. Ausência ou falha dessa leitura
mostra aviso sem desfazer o resultado nem induzir novo lançamento. O aviso não reconstrói produção ausente.
A positividade permanece por coleta/visita: não foram inventados identificadores nem laudos individuais
para tubitos antigos. Um módulo individual por tubito exige cadastro e rastreabilidade próprios.

Validação desta atualização: testes locais de SQL em Postgres descartável (incluindo filtros, contagens,
permissões e conta desativada) e testes das funções de confirmação (boletim presente/ausente, leitura com
falha após gravação e bloqueio antes da RPC). Nenhum teste acessa produção.

Para ativar no Lovable: sincronizar main, verificar se a migration inicial já foi aplicada e aplicar
somente a nova pendente no projeto `ttjzgszxrnmcsygtzfcu`, conferir Advisor e permissões reais, depois publicar.
Validar usando a amostra pendente existente de Gustavo sem criar outra ou informar laudo fictício.
A ausência da RPC nova mantém aviso de ativação pendente e não oferece fallback com escopo permissivo.

### Correção adicional de ciclos e ocorrência

A seleção de ciclos agora consulta o servidor independentemente da RPC de amostras, com erro e nova
tentativa próprios; ausência da migration de laboratório não apaga opções de ciclos autorizados.
A contagem de foco encontrado/coleta no mapa preserva a ocorrência mesmo após laudo negativo.
Positividade permanece baseada nos depósitos confirmados, sem transformar pendentes ou negativos
em positivos. A classificação de risco pode utilizar ocorrências históricas e não é um laudo.
Nenhuma nova migration é necessária para este ajuste de código; a migration de gestão anterior
continua necessária para ativar a lista filtrada. Localizar a amostra ausente requer leitura do banco
real e da fila do dispositivo: não se deve recriar visita nem modificar sample_collected por suposição.

## Foco encontrado implica coleta (12/10/2026)

Regra confirmada pelo usuário: marcar foco encontrado já pressupõe coleta. O botão separado de
coleta foi removido do levantamento de índice. O payload e o repositório offline gravam
sample_collected=true sem inventar laudo nem quantidade de tubitos. A visita original permanece
com seu ID, dia e ciclo. A análise continua somente pelo gestor autorizado, online.

Aplicar `20261012030148_focus_implies_sample_collection.sql` depois das duas migrations anteriores.
A migration normaliza novos inserts/updates de foco ainda não confirmado e compatibiliza listagens
antigas e atuais com `sample_collected OR has_focus`. Não há UPDATE em lote, criação de amostras ou
reconstrução de boletins. Ao confirmar um resultado real, a RPC também confirma a coleta e atualiza
sua contagem no boletim diário existente. Escritas confirmadas continuam protegidas.

Minhas amostras também apresenta visitas próprias ainda na fila local (pendentes/sincronizando/erro),
com identificação do imóvel e indicação de sincronização, sem somar esses itens aos contadores do
servidor e sem expor filas de outros agentes. Não é um segundo cadastro. A visualização não altera
mutations. O supervisor só consegue ver uma visita após ela ser sincronizada com o servidor.

Mapas operacional/epidemiológico mantêm vermelho para positivo e usam laranja forte (#ea580c)
para foco coletado sem confirmação positiva, incluindo resultado negativo/inconclusivo. Detalhes
mostram contagens de pendentes, negativos e inconclusivos do período/ciclo selecionado; os históricos
não são apagados por laudo negativo. A classificação de risco ainda considera ocorrências históricas
como indicador operacional e não substitui interpretação laboratorial.

Validação: SQL em Postgres descartável, preservação/isolamento da fila em IndexedDB, TypeScript e
build. Não houve acesso ou alteração dos registros reais do projeto Lovable. Depois da ativação,
conferir a amostra já existente de Gustavo, sem registrar outra coleta e sem preencher laudo fictício.
