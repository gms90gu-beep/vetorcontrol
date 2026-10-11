# Auditoria de Equipe e Painel — Admin Master — 11/10/2026

Escopo: revisão do código de main; sem consultas ou alterações no banco de produção e sem validação autenticada no aplicativo publicado. As constatações abaixo demonstram comportamento do código, não quantificam registros afetados em produção. Nesta entrega, somente Boletins Oficiais e seus filtros foram corrigidos. Equipe e Painel permanecem sem alterações.

## Rotas efetivamente utilizadas

A navegação de gestores envia Equipe para `/supervision?tab=equipe` (SupervisionDashboard) e Painel para `/supervision?tab=operacional` (OperationalDashboard). `/admin/dashboard` é um painel executivo adicional. `/admin-master` é a gestão de usuários e também foi revisada.

## Prioridades

| Prioridade | Área | Constatação | Efeito e recomendação |
|---|---|---|---|
| Alta | Painel operacional | `trabalhados = av.length`, enquanto fechados e recusados também estão em `av`. | O rótulo trabalhados inclui visitas sem imóvel trabalhado. Separar visitas, imóveis únicos e trabalhos efetivos; identificar claramente que a fonte é visitas, não diárias encerradas. |
| Alta | Equipe/Painel | Equipe soma `visited_properties + closed_properties` de block_progress; Painel usa contagem de visitas; produção oficial usa daily_work_records. | Números não são diretamente comparáveis. Padronizar nomes e regras e identificar fonte/ciclo/período. Fechados não devem ser apresentados como trabalhados. |
| Alta | Focos | Painel usa `visits.has_focus`. O SQL de block_progress atribui `positive_focus` pela mesma flag. | Foco encontrado/amostra coletada pode ser confundido com resultado positivo. Separar coleta, pendente, positivo, negativo e inconclusivo; usar o resultado validado para positividade. |
| Alta | Consultas | OperationalDashboard consulta visitas e pendências sem paginação explícita; Equipe consulta perfis e sessões sem paginação, e getBlockProgressBatch também faz uma única consulta. | O limite do servidor pode truncar totais silenciosamente. Paginar consultas, mostrar erros e indicar quando a fonte é cache. |
| Alta | Escopo do coordenador | Equipe admite fallback após RPC vazio/erro; se não encontrar supervisores diretamente vinculados, usa todos os supervisores retornados. | O frontend deixa de impor escopo estrito e depende de RLS/cache. Falhar com mensagem clara em vez do modo permissivo; equipe sem vínculos deve ficar vazia. Isso não prova acesso indevido no banco atual. |
| Média | Atividade de hoje | Equipe busca `session_date >= hoje`, sem limite superior, e considera qualquer sessão retornada como atividade de hoje. | Uma jornada futura elimina incorretamente o aviso de ausência de atividade hoje. Usar igualdade de data e tratar separadamente jornadas antigas ainda abertas e jornadas futuras. |
| Média | Total de pessoas | Equipe mistura supervisores e agentes nos cartões Total/Ativos/Inativos e no alerta “agente(s) sem registro hoje”. | Supervisores sem jornada de campo podem produzir alertas enganosos. Separar cargos e aplicar atividade de campo somente a agentes. |
| Média | Semana/ciclo | Painel mantém weekFilter ao trocar cycleFilter, embora a lista de semanas passe a usar o novo ciclo. | Uma semana incompatível pode deixar o painel vazio. Limpar a semana ao trocar o ciclo, como já ocorre nos filtros de Relatórios. |
| Média | Recarregamento | Equipe executa fetchAll quando user.id muda, mas não inclui role nas dependências; erros podem resultar em cache sem identificação visual. | Mudança/carregamento de perfil pode deixar escopo anterior na tela. Recarregar por usuário e papel, cancelar respostas antigas e sinalizar cache. |
| Alta | Painel executivo | `/admin/dashboard` retorna antes de useState/useEffect/useQuery quando fica offline. | Alternar conectividade muda a ordem/quantidade de hooks e pode quebrar a tela. Mover bloqueio offline para depois dos hooks, usando query.enabled. |
| Média | Painel executivo | A consulta de diárias não filtra status completed nem exige end_time, mas exporta “Diárias encerradas”. | Pode incluir rascunhos/abertas nos indicadores oficiais. Filtrar ou mostrar separadamente diárias não encerradas. |
| Média | Painel executivo | Pendências abertas são filtradas por agente/ciclo, sem intervalo De/Até. | Representam o estoque aberto atual, não necessariamente o período do relatório. Identificar o estoque ou oferecer filtro temporal explícito. |
| Média | Painel executivo | Consulta React Query não exibe error; `!k` permanece no spinner. | Falha do servidor pode parecer carregamento infinito. Exibir erro e botão para tentar novamente. |
| Média | Gestão de usuários | Histórico chamado `blocks` é a soma de properties_worked; queries individuais não conferem todos os error retornados. | Pode apresentar imóveis como quarteirões e zeros em falhas de consulta. Corrigir métrica/rótulo e tratar erros; paginar as diárias. |

## Proteções verificadas no código

Painel operacional resolve agentes permitidos e normaliza identificadores antigos de visitas. Pendências passam pelo filtro de escopo e somente abertas. A Edge Function manage-agents valida privilégios administrativos no servidor e protege autoexclusão/último administrador ativo; isso é mais forte que depender apenas dos botões da interface. A configuração efetivamente implantada e suas políticas ainda exigem teste autenticado em produção.

## Correção de Boletins Oficiais desta entrega

A emissão consulta novamente as diárias no servidor, com os filtros aplicados e agentes autorizados, sem usar o login do gestor como identidade produtora nem a semana atual como substituto do período selecionado. Usa o cálculo PCFAD compartilhado, consolida por dia e inclui observações limitadas às visitas dos mesmos agentes/datas/ciclos. Não emite documento vazio ou com diárias abertas. Identifica período e ciclo; compartilha o arquivo quando suportado ou baixa e orienta o anexo manual no WhatsApp. Filtros visuais acompanham o ciclo ativo aplicado. Respostas antigas de carregamento são descartadas.

Nenhuma migration, reconstrução de boletins, alteração de visitas ou limpeza da fila offline é necessária para esta correção.
