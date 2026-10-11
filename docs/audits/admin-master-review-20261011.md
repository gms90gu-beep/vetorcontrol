# Nova auditoria e melhorias do Admin Master — 11/10/2026

## Evidência e limites

Revisão do código do repositório gms90gu-beep/vetorcontrol, partindo da main 8bb7594a87b8273f4fbeef4b63ab6f3a854f2bef. Auditoria de fluxos e chamadas, com testes locais de regras, agregação, paginação e IndexedDB. Não houve login como usuário real, consulta ao banco de produção, reconstrução de boletins, mudança de credenciais ou execução de ações corretivas sobre registros existentes. Não é um laudo de que as políticas RLS implantadas estejam corretas. Não houve publicação pelo assistente.

## Melhorias implementadas

- Produção oficial de Equipe, Painel, ranking e painel executivo usa daily_work_records com status completed e end_time preenchido. Imóveis trabalhados, fechados e recusados têm indicadores próprios. Produção é soma das diárias, enquanto visitas e imóveis únicos têm uma seção separada: revisitar o mesmo imóvel não deve ser confundido com um segundo cadastro.
- Painel mostra escopo, ciclo/semana, agente, fonte no servidor, atualização e diárias abertas excluídas; erro de leitura é indicado e permite atualização. Trocar ciclo limpa a semana. Consultas de perfis, visitas, diárias, sessões e pendências são paginadas.
- Coleta/foco encontrado, análise pendente, positivo, negativo e inconclusivo ficam separados. has_focus sozinho não é confirmação laboratorial; resultados legados podem usar visit_deposits.is_positive. O painel de produção oficial continua usando os indicadores oficiais da diária.
- Equipe contabiliza agentes separadamente de supervisores; alertas de ausência de atividade se aplicam a agentes. Sessão futura é indicada sem contar como atividade de hoje; sessões antigas abertas e pausadas continuam identificadas.
- Escopo explícito de coordenadores exige vínculo direto ou supervisor vinculado; RPC com erro não leva a consulta global/cache. A regra também é utilizada nas funções de produção, pendências, mapas e GPS. Administradores mantêm visão global; supervisores mantêm equipe própria. RLS segue sendo a autoridade do banco.
- Gestão de usuários agora permite selecionar o coordenador responsável por um supervisor, usando a operação update_user já existente. Não atribui equipes automaticamente nem redistribui visitas antigas.
- Painel executivo mantém hooks estáveis ao perder conexão; consultas são desabilitadas offline, erros deixam de parecer carregamento infinito, filtros e exports têm escopo. Pendências são rotuladas como estoque atual, independente do intervalo da produção. Períodos inválidos são rejeitados também no servidor.
- Histórico de usuários passa a separar imóveis trabalhados de quarteirões encerrados, pagina diárias e indica erro de leitura. Respostas antigas não substituem o detalhe de outro usuário.
- Data Audit observa as duas filas locais. “Corrigir tudo” e a ação individual reenfileiram erros sem apagar ids, payloads ou evidência do erro. Isso prepara nova tentativa; não confirma que itens específicos tenham chegado ao servidor. A fila de outro celular não é acessível por este diagnóstico local.
- Atualização do cache RG não apaga RGs legados ou locais ausentes do servidor e recusa manutenção enquanto existirem itens pendentes/com erro ou RGs legados não sincronizados. Consultas falhas não são transformadas em listas vazias para reconciliação.
- Preview e homologação de RG leem todas as páginas e propagam falhas. Exclusão automática de quarteirões está desativada: total_properties=0 não comprova ausência de jornadas, boletins ou imóveis vinculados. Não foi executada qualquer exclusão.
- Auditoria de calendário consulta campos existentes, diárias encerradas e ciclo correto; larvicida é separado em g e ml. Usa data operacional e corrige o texto que chamava o calendário da aplicação de ISO.
- Saúde do sistema verifica erros de RPC/contagens, conta corretamente os arrays do preview de RG e não atribui 100% a módulo cuja leitura falhou. Corrige actor_id na consulta de log. Contagem de pending_records no servidor deixa de afirmar que a fila offline dos dispositivos está sincronizada.
- Corrigidos dois problemas de tipagem existentes: acumulador de registros do boletim oficial e resolução da promessa do Web Lock da sincronização. A ordem das operações de sincronização foi preservada.

## Matriz da revisão

| Área/rota | Conclusão da revisão |
|---|---|
| Painel e Equipe (/supervision) | Totais oficiais e atividade separados; filtros, paginação, escopo e erros corrigidos. |
| Dashboard executivo (/admin/dashboard) | Somente produção encerrada; hooks offline e erros corrigidos; estoque de pendências identificado. |
| Central de Comando (/admin-master) | Guard administrativo e permissões de manage-agents revisados; histórico e vínculo supervisor/coordenador melhorados. |
| Relatórios e Boletins Oficiais (/reports, /relatorios, /relatorio-semanal-equipe, /weekly-comparison) | Mantida a correção anterior de filtros e consolidação PCFAD. O escopo comum foi endurecido; nenhuma reconstrução automática foi executada. |
| Pendências (/admin/pendencias) | Função de relatório sem truncamento oculto em 500/1.000 linhas; nomes dos imóveis e perfis paginados. Histórico por ciclo preservado. |
| Mapas (/map, /heatmap) | Escopo do coordenador reforçado no resolvedor comum; isolamentos por ciclo e melhorias de calor anteriores mantidos. Não houve validação visual dos mapas publicados. |
| Amostras (/amostras) | Mantido resultado validado no servidor, histórico e correções com justificativa. Não foi reaplicada migration nem modificado resultado existente. |
| Auditoria GPS (/admin/georef-audit) | Consultas paginadas e com erro explícito; coordenador com escopo estrito; foco positivo não deriva apenas de has_focus. |
| Ciclos por Ano e Auditoria de Ciclos (/cycles, /admin/cycle-audit) | Conclusão de ciclo exige Admin Master no servidor, mantém auditoria e operação idempotente. Datas operacionais já utilizadas; não foi encerrado ciclo nesta entrega. |
| Calendário (/admin/calendar-audit) | Campos corrigidos, unidades separadas, paginação e erro explícito. |
| Auditoria geral (/admin/auditoria) | Contagens exatas e paginação existentes; falha da consulta é tratada. Revisão não equivale a validar todos os registros históricos. |
| Auditoria de dados (/admin/data-audit) | Lote e manutenção offline deixam de excluir erros; falhas SQL não geram mensagem de sucesso indevida; indicadores indisponíveis não mostram validação perfeita. |
| Reconciliação/homologação RG (/admin/rg-reconcile) | Leitura completa; exclusão automática bloqueada; falhas de atualização no fluxo legado deixam de ser ignoradas. Reconciliação só ocorre mediante ação explícita na tela. |
| Pipeline RG (/admin/rg-pipeline) | Fonte completa antes de manutenção; identifica diagnóstico local/conta atual; preserva cache e legado. |
| Saúde e RBAC (/admin/system-health, /admin/rbac-audit) | Saúde corrigida. RBAC existente é diagnóstico de consistência e consultas; não substitui testes com JWT real de cada cargo/equipe. |
| Offline (/admin/offline-audit, /sync-status) | Testada preservação/reenvio e conflitos locais. Uma tela no PC não comprova que a fila do celular de Gustavo esteja resolvida. |
| Configurações e design system (/settings, /admin/design-system) | Guard administrativo do design system revisado; nenhuma política ou configuração no banco foi alterada. |

## Achados restantes para próxima etapa

1. **E-mail e edição de cadastro (alta):** manage-agents grava profiles antes de atualizar Auth. Falha ao atualizar Auth pode deixar e-mail de cadastro diferente do login. Auth e Postgres são serviços distintos; recomenda-se operação com compensação e teste real antes de mudar essa Edge Function. Esta entrega não modifica nem implanta a função.
2. **Revogação de acesso (alta):** manage-agents confere is_active do operador; o middleware geral usa JWT/claims. É necessário testar no banco se desativação bloqueia imediatamente todas as funções e leituras, além de conferir políticas RLS. Não é possível garantir isso pela revisão de frontend.
3. **Auditoria persistente (média):** algumas ferramentas ainda dependem de RPCs implantadas e permitem execução parcialmente concluída antes de falhar o log. Recomenda-se operação transacional no servidor, prévia e trilha por ação. Não foram recriadas essas funções SQL.
4. **Diagnóstico de saúde (média):** os índices são heurísticos de módulos; não são percentual de segurança do sistema. Necessitam comparação com consultas reais, políticas vigentes e mensagens SQL preservadas.
5. **Pipeline e RBAC (média):** há amostras fixas no diagnóstico operacional; migrar para seleção dinâmica de usuários/equipe e teste com identidades reais. A correção desta entrega protege leitura/manutenção, mas não transforma esses diagnósticos em testes completos de autorização.
6. **Escala (média):** carregar todas as páginas evita truncamento, porém grandes volumes exigirão agregação no servidor e paginação visual. Recomenda-se medir latência/consumo em dados reais antes de introduzir views/RPCs novas.

## Validação e ativação

- 120 testes de unidade existentes/novos aprovados; mais 2 testes executam a agregação real das funções de painel/ranking com cliente de banco simulado e 1.201 diárias.
- 17 testes offline aprovados, incluindo IndexedDB com filas em erro, preservação de payloads, conflito e respostas vazias/falhas de servidor.
- Verificação TypeScript e build de produção executados. Logs de build trazem avisos já existentes sobre geração de precache/PWA, que merecem validação do aplicativo instalado.
- Nenhuma migration ou nova Edge Function é necessária para este conjunto. Após sincronização da main no Lovable, publicar e testar autenticado no celular e PC: soma oficial, equipe vinculada, ciclo/semana, exportação, perda/retorno de conexão e fila local. Somente esse teste pode confirmar comportamento na produção.
