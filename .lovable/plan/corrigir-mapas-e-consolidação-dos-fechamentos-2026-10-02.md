# Corrigir mapas e consolidação dos fechamentos

## Diagnóstico confirmado
- O mapa operacional usa camadas próprias sem o mecanismo resiliente já existente; quando o provedor de imagens falha, a tela fica vazia sem alternar automaticamente.
- O fechamento grava primeiro no armazenamento local e mostra sucesso antes de confirmar a gravação remota.
- O gatilho do banco consolida apenas status `closed`, mas o fluxo atual encerra jornadas como `completed` ou `paused`.
- A função de reconstrução procura `legacy_agent_id` usando o identificador do perfil; esse campo referencia o cadastro legado em `agents`. A falha é capturada pelo gatilho e o fechamento continua sem criar o relatório diário.
- A auditoria atual encontrou 28 pares agente/data encerrados sem registro diário consolidado; os relatórios leem esses registros consolidados, por isso a produção não aparece.

## Implementação
1. **Mapas**
   - Substituir a camada direta do mapa operacional pela camada resiliente compartilhada.
   - Respeitar o provedor escolhido, configurar zoom nativo e alternar automaticamente para o provedor reserva.
   - Exibir erro de imagens separado de erro de consulta, mantendo pontos e indicadores quando apenas o provedor falhar.

2. **Fechamento diário**
   - Ao encerrar com internet, sincronizar a fila e confirmar no banco o registro diário por `agent_id + work_date` antes de informar sucesso.
   - Se a gravação falhar, manter tudo na fila local e mostrar claramente que o fechamento aguarda sincronização, sem declarar que está salvo no banco.
   - Preservar o comportamento offline, jornadas retroativas e jornadas pausadas.

3. **Consolidação no banco**
   - Aplicar uma migration focada para corrigir o vínculo `profiles.id → agents.id` na reconstrução.
   - Fazer o gatilho reagir a `closed`, `completed` e `paused`, consolidando pela data operacional e pela chave única atual `agent_id, work_date`.
   - Não apagar nem reclassificar visitas ou registros históricos.

4. **Validação**
   - Testar mapas com falha do provedor e consulta válida.
   - Testar fechamento online confirmado, fechamento offline pendente e reenvio posterior.
   - Conferir que o registro aparece nas métricas e relatórios.
   - Rodar testes, compilação e verificação de segurança do banco.

## Observação sobre histórico
A correção impedirá novas perdas. Os 28 pares históricos serão apenas inventariados; nenhuma reconstrução retroativa será executada sem autorização específica.
