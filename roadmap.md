# Tarefas

- [x] Diagnosticar a falha de carregamento dos mapas.
- [x] Diagnosticar fechamentos ausentes nos relatórios.
- [x] Corrigir a inicialização e o fallback resiliente dos mapas.
- [x] Aguardar a fila ativa e confirmar a persistência remota do fechamento online.
- [x] Corrigir o gatilho e a reconstrução de registros diários no banco.
- [x] Validar o mapa real, a fila do fechamento, a leitura dos relatórios e os testes de regressão.
- [ ] Aguardar autorização específica para reconstrução dos 28 pares históricos ausentes.
- [x] Localizar e revisar a branch `audit-corrections-20261004` de `gms90gu-beep/vetorcontrol` (commit `c68eb6a40e2df5e3329ccc6363fda19c638f6b5c`); confirmar o projeto correto e a migration pendente.
- [x] Aplicar SQL exato da branch corrigida `70a4ed12af532ecfc4c13f7f88bb867bb582e69d` em `ttjzgszxrnmcsygtzfcu` (`drizzle/migrations/0006_cycle_scoped_pendencies.sql`); preservar 123 pendências, 153 tentativas e 1.106 visitas.
- [ ] Validar Pendências, filtros por ciclo/semana e sincronização offline após a migration.
- [ ] Publicar a versão validada com as correções de Pendências e fila offline da branch; não aplicar as outras migrations nem alterações de mapas não solicitadas.
