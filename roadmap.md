# Tarefas

- [x] Auditoria 07/10: implementar equipe no servidor em relatórios/reconstruções e preservar IDs canônicos; migration 0007 instalada, sem reconstruir dados.
- [x] Auditoria 07/10: implementar calendário da equipe, atalhos filtrados por agente e ciclo ativo inicial.
- [x] Auditoria 07/10: implementar escopo de mapas/calor/pendências e separar foco observado de positivo, informar truncamento.
- [x] Auditoria 07/10: 96 testes em 25 arquivos aprovados, compilação automática OK; calendário/relatórios do agente e rejeição real de reconstrução externa verificados, contagens preservadas.
- [ ] Auditoria 07/10: validar atalhos, mapas/calor e relatórios na interface do supervisor (bloqueio: sessão disponível é de agente); publicar apenas após isso e liberação do alerta crítico anterior.

- [x] Diagnosticar a falha de carregamento dos mapas.
- [x] Diagnosticar fechamentos ausentes nos relatórios.
- [x] Corrigir a inicialização e o fallback resiliente dos mapas.
- [x] Aguardar a fila ativa e confirmar a persistência remota do fechamento online.
- [x] Corrigir o gatilho e a reconstrução de registros diários no banco.
- [x] Validar o mapa real, a fila do fechamento, a leitura dos relatórios e os testes de regressão.
- [ ] Aguardar autorização específica para reconstrução dos 28 pares históricos ausentes.
- [x] Localizar e revisar a branch `audit-corrections-20261004` de `gms90gu-beep/vetorcontrol` (commit `c68eb6a40e2df5e3329ccc6363fda19c638f6b5c`); confirmar o projeto correto e a migration pendente.
- [x] Aplicar SQL exato da branch corrigida `70a4ed12af532ecfc4c13f7f88bb867bb582e69d` em `ttjzgszxrnmcsygtzfcu` (`drizzle/migrations/0006_cycle_scoped_pendencies.sql`); preservar 123 pendências, 153 tentativas e 1.106 visitas.
- [x] Validar Pendências e filtros por ciclo/semana online/offline (19 no ciclo ativo, 9 na semana 4, 110 em todos os ciclos); 80 testes passaram, incluindo recuperação e dependências da fila; compilação automática OK.
- [ ] Validar gravação nova de visita/recuperação em produção e relatório de gestor (bloqueado: sessão disponível de agente; reenvio de visita histórica bloqueado pelo ciclo concluído; não criar produção fictícia nem alterar permissões). Preservadas 18 combinações ciclo/semana herdadas das visitas; nenhuma reconciliação adicional autorizada.
- [ ] Publicar a versão validada com as correções de Pendências e fila offline da branch; não aplicar as outras migrations nem alterações de mapas não solicitadas.
