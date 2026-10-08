# Tarefas

- [x] Rodada 08/10: Dexie v4 dedupe/coalescência sem substituir syncing; testes de concorrência e preservação de campos.
- [x] Rodada 08/10: migration equivalente de observabilidade instalada, funções SQL service_role e falhas auditadas sem perder fechamento; jornada 01/10 idêntica ao baseline (base já informa closed, não paused).
- [x] Rodada 08/10: tipo do imóvel em pendências/listas/exportações e resumo histórico por ciclo separado do atual.
- [x] Rodada 08/10: mapas incluem visitas sem ciclo por período e aviso de foco sem GPS; observado distinto de positivo; mapa compartilhado restaurado após refetch.
- [x] Rodada 08/10: 147 testes gerais e 6 testes de navegador aprovados, compilação automática OK, supervisor real e leitura offline validados; nenhum SaaS ou histórico alterado.
- [ ] Rodada 08/10: publicar versão validada e informar hash e resultado.

- [x] Aplicar patch 11122d9 recebido na main, preservando correções: autorização master no servidor, sem bypass por e-mail, último master protegido, criação direta e auditoria.
- [x] Aplicar SQL exato 20261007160000_harden_admin_master_settings.sql incluído no patch no projeto existente; ciclos só master, relatórios paginados, jornadas sem boletim e configurações reais.
- [x] Validar: 118 testes, compilação automática OK, zero críticos no scanner, Admin Master real com auditoria e alerta de jornada sem boletim; 1.151 visitas e 61 boletins preservados.
- [ ] Publicar versão integrada validada.

- [x] Validação final 0007: Adenilson real, equipe restrita, três atalhos, calendário, mapas/ciclos e rejeição de reconstruções externas; pendências offline e regressões de jornadas aprovadas.
- [x] Migration 0008: configurações administrativas exclusivas do master, gestores leem somente escopo operacional; agentes bloqueados; nenhum registro alterado pela validação.
- [x] 105 testes gerais + 12 testes de mapas aprovados, compilação automática OK, scanner de banco sem crítico, projeto existente confirmado.
- [ ] Publicação condicionada: revisão final dos avisos de dependências encontrados; não atualizar bibliotecas fora do escopo sem avaliação.

- [x] Auditoria 07/10: implementar equipe no servidor em relatórios/reconstruções e preservar IDs canônicos; migration 0007 instalada, sem reconstruir dados.
- [x] Auditoria 07/10: implementar calendário da equipe, atalhos filtrados por agente e ciclo ativo inicial.
- [x] Auditoria 07/10: implementar escopo de mapas/calor/pendências e separar foco observado de positivo, informar truncamento.
- [x] Auditoria 07/10: 96 testes em 25 arquivos aprovados, compilação automática OK; calendário/relatórios do agente e rejeição real de reconstrução externa verificados, contagens preservadas.
- [x] Auditoria 07/10: validar atalhos, mapas/calor e relatórios na interface do supervisor; alerta crítico anterior resolvido por migration 0008.

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
- [ ] Validar gravação nova de visita/recuperação em produção (aguarda operação real autorizada; não criar produção fictícia). Relatório de gestor validado como Adenilson; nenhuma reconciliação adicional autorizada.
- [ ] Publicar a versão validada com as correções de Pendências e fila offline da branch; não aplicar as outras migrations nem alterações de mapas não solicitadas.
