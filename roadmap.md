# Tarefas

- [x] Diagnosticar a falha de carregamento dos mapas.
- [x] Diagnosticar fechamentos ausentes nos relatórios.
- [x] Corrigir a inicialização e o fallback resiliente dos mapas.
- [x] Aguardar a fila ativa e confirmar a persistência remota do fechamento online.
- [x] Corrigir o gatilho e a reconstrução de registros diários no banco.
- [x] Validar o mapa real, a fila do fechamento, a leitura dos relatórios e os testes de regressão.
- [ ] Aguardar autorização específica para reconstrução dos 28 pares históricos ausentes.
- [x] Localizar e revisar a branch `audit-corrections-20261004` de `gms90gu-beep/vetorcontrol` (commit `c68eb6a40e2df5e3329ccc6363fda19c638f6b5c`); confirmar o projeto correto e a migration pendente.
- [ ] Aplicar `20261006003000_cycle_scoped_pendencies.sql` (bloqueado: linha 43 da branch referencia `visits.created_at`, coluna inexistente no banco; aguarda SQL corrigido na branch, sem improvisar a migration).
- [ ] Validar Pendências, filtros por ciclo/semana e sincronização offline após a migration (bloqueado pela incompatibilidade do SQL).
- [ ] Publicar a versão validada da branch solicitada (bloqueado pela incompatibilidade do SQL e pela validação pós-migration pendente).
