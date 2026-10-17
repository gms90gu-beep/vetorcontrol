# Tarefas

- [x] Rodada 17/10 15:16: somente 20261017103000_enforce_bulletin_pdf_upload.sql do PR #46 (head 59c5bc637a8e389e2bd6724ac573769e83f0a156) aplicada byte-for-byte como Drizzle 0020 na produção confirmada. Política INSERT authenticated exige extensão pdf, metadata.mimetype application/pdf, pasta auth.uid e arquivo de boletim pending próprio. Nenhuma migration anterior repetida, nenhum dado de produção criado e nenhuma publicação. Bucket preservado privado, 20.971.520 bytes; allowed_mime_types permanece NULL, restrição MIME efetiva pela política.

- [x] Rodada 17/10 04:02: identidade Live de produção confirmada; PR #46 atualizado no head d3dd9b2b98072471e8e05f7bc5c00052470b9f28 conferido; bucket signed-bulletins criado pela API nativa, privado, limite verificado de 20.971.520 bytes (20 MiB).
- [x] Rodada 17/10 12:23: PR #46 atualizado no head fe24802b98d71a5d9b9f6a30dad3c8ab9f5cfd40; três migrations aplicadas byte-for-byte em ordem (Drizzle 0017, 0018, 0019). Verificado: tabela signed_bulletin_archive criada, 3 políticas na tabela, 2 políticas em storage.objects, funções signed_bulletin_epi_week_matches (estrita/imutável, confirmada em pg_proc) e keep_signed_bulletin_immutable, trigger signed_bulletin_immutable. Bucket signed-bulletins privado, limite 20.971.520 bytes. Nenhuma publicação realizada.
- [x] Restrição MIME application/pdf resolvida pela política adicional da migration 0020; allowed_mime_types do bucket permanece NULL, sem alteração da configuração nativa.

- [x] Rodada 17/10: ferramenta de identidade confirmou conexão Live de produção correta; PR #46 aberto, head 87a4f5a38a1db8a97d75b0b30094f601bcde5baa, contém três migrations 20261016165000, 20261016172000 e 20261016174500; tabela, função, políticas e bucket signed-bulletins ausentes na consulta.
- [x] Bloqueio inicial do PR #46 superado pelas migrations atualizadas aplicadas na rodada 17/10 12:23; registro histórico, nenhuma reaplicação necessária.

- [x] Rodada 12/10 20:55: análise somente leitura da reserva externa; autenticação hospedada e armazenamento consultados, dependências do aplicativo e exportação oficial revisadas; apresentar plano sem mudar dados, credenciais, conexão ou publicação.
- [ ] Execução da reserva externa aguarda autorização específica; SMTP e inventário completo de funções implantadas precisam de conferência nas telas do Cloud, sem inferência pelo código.

- [x] Rodada 12/10 13:56: commit c163602 sincronizado; migration 20261012134017 pendente confirmada; Gustavo já tem resultado positivo versão 1 antes desta rodada, preservar sem alteração.
- [x] Migration 20261012134017 aplicada como Drizzle 0015; erro de transcrição na projeção de histórico corrigido em 0016, restaurando a função exata autorizada, sem writes de dados.
- [x] 51 verificações SQL descartáveis: candidatos com foco, supervisor de equipe em ciclo encerrado, correções com motivo/área, inserts/produção bloqueados e marcador falsificado rejeitado. Adenilson real consulta Gustavo (C positivo, versão 1), sem correção; identificação pendente inicia vazia, exige justificativa, nenhuma submissão real.
- [x] 199 testes aprovados, compilação OK, segurança repetida sem críticos (7 avisos e 1 informativo preexistentes); 1.207 visitas, 64 boletins, 1 resultado e zero identificações preservados.
- [x] Publicação autorizada solicitada nesta rodada após validação; conclusão da implantação depende do serviço e deve ser informada sem promessa de disponibilidade.

- [x] Rodada 12/10: main cff72c0 confirmada; três migrations pendentes aplicadas byte-for-byte na ordem autorizada (Drizzle 0012, 0013, 0014).
- [x] Rodada 12/10: coleta 938798d0 de Gustavo, imóvel 59 Praça da Bandeira, 06/10 Ciclo 5, exibida em contas reais de Gustavo (somente consulta) e Adenilson (formulário autorizado, sem salvar); mapa real: 1 positivo e 1 foco não confirmado; 1.207 visitas, 64 boletins e zero laudos novos preservados.
- [x] Rodada 12/10: 198 testes e 36 verificações SQL descartáveis aprovados; teste antigo de equipe atualizado para paginação atual; compilação OK; segurança 7 avisos e 1 informativo preexistentes, zero críticos.
- [x] Rodada 12/10: validação concluída no Ciclo 5; solicitação de publicação autorizada nesta rodada, com limitação histórica registrada abaixo.
- [x] Compatibilidade histórica resolvida pela migration autorizada 20261012134017: laudos em ciclos finished permitidos somente pela RPC autorizada, sem liberação de produção.

- [x] Ativação de 11/10 substituída pela rodada autorizada de 12/10: três migrations aplicadas; limitação em ciclos encerrados mantida como pendência própria.
- [x] Consulta real de agente/supervisor e mapas validada na rodada 12/10; gravação de laudo testada somente em banco descartável, sem laudos fictícios em produção.
- [x] Verificação inicial 11/10: Cloud correto confirmado; SQL idêntico ao commit; 168 testes e 21 verificações SQL isoladas passaram; compilação automática OK; scanner sem críticos, 7 avisos e 1 informativo preexistentes.
- [x] Solicitação antiga de publicação substituída pela rodada de 12/10 após testes e validação real de consulta.

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
