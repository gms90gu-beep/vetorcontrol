# Reserva externa do Vetor Control — análise e plano

## Escopo e situação

Lovable Cloud continua como origem principal. `vetorcontrol-copia`, no Supabase externo, permanece reserva com atualização **somente origem → destino**. O aplicativo de produção não deve gravar nos dois bancos.

Esta etapa foi somente leitura: nenhuma alteração em dados, credenciais, funções, conexão ou publicação; nenhum envio de dados ao destino. A restauração externa e a implantação de `manage-agents` no destino são informações fornecidas por você, não verificações executadas nesta análise.

## 1. Autenticação da origem

Configurações consultadas diretamente na autenticação hospedada em 12/10/2026:

| Item | Resultado |
|---|---|
| E-mail e senha | Ativos |
| Google | Ativo |
| Apple, Microsoft/Azure, telefone e demais provedores apresentados pelo endpoint | Desativados |
| Usuários anônimos | Desativados |
| Cadastro | Não desabilitado na configuração do serviço; o aplicativo pode impor restrições adicionais |
| Confirmação de e-mail | **Automática** (`mailer_autoconfirm=true`): o serviço não exige confirmação por link no cadastro normal |
| Site URL | `https://vetorcontrol.lovable.app` |
| Servidor OAuth para clientes externos | Desativado; isso não desativa o login Google |
| SMTP próprio | **Não confirmado**: nenhum domínio de e-mail está configurado no workspace, mas isso não prova ausência de SMTP na autenticação |

Lista de redirecionamentos confirmada:

```text
https://id-preview*--6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.lovable.app/**
https://id-preview*--6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.*.lovable.app/**
https://project--6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.lovable.app/**
https://project--6c8e08f2-bdfd-4ad0-9598-5ac2a165d068-dev.lovable.app/**
https://6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.lovableproject.com/**
https://6c8e08f2-bdfd-4ad0-9598-5ac2a165d068-thr_*.lovableproject.com/**
https://*-s.6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.lovableproject.com/**
https://*-l.6c8e08f2-bdfd-4ad0-9598-5ac2a165d068.lovableproject.com/**
https://preview*--vetorcontrol.lovable.app/**
https://vetorcontrol.lovable.app/**
```

No ambiente externo, configurar seu próprio Site URL e somente os redirecionamentos necessários. Não copiar os curingas de preview do Lovable indiscriminadamente. A configuração de provedores, SMTP e chaves de autenticação não acompanha o backup. IDs e hashes preservam contas/senhas, mas sessões e tokens da origem não devem ser reutilizados no destino. Google precisa de configuração própria compatível com o ambiente externo; o intermediário de login do Lovable não deve ser presumido portável.

**Pendência:** conferir SMTP/remetente e inventário implantado em More → Cloud → Users/Auth Settings e Edge functions. As ferramentas disponíveis não forneceram uma leitura administrativa completa desses dois itens. Não abrir configuração que salve mudanças apenas para descobrir valores.

## 2. Funções e variáveis necessárias

**Inventário implantado completo da origem: não confirmado.** Existe uma única Edge Function no repositório: `manage-agents`, chamada pelos painéis administrativos. A consulta de logs não encontrou registros; ausência de logs não confirma nem exclui implantação. Você informou que essa função já está publicada no destino.

Também existem funções de servidor do próprio aplicativo e `/api/public/auth-login`. Elas não são Edge Functions do banco: publicar somente `manage-agents` não instala login por matrícula, resultados de amostras, auditorias e demais serviços do aplicativo externo.

Nomes encontrados no código, sem valores:

| Uso | Nomes |
|---|---|
| `manage-agents` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Aplicativo no navegador/build | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` |
| Servidor do aplicativo | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Compatibilidade com nomes antigos | `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_URL`, `SUPABASE_PROJECT_ID` |
| Busca de endereços/Google via intermediário Lovable | `LOVABLE_API_KEY`, `GOOGLE_MAPS_API_KEY` |

O catálogo de secrets retornou apenas `LOVABLE_API_KEY`, gerenciado. As configurações reservadas do Cloud são fornecidas pela plataforma e não aparecem necessariamente nessa lista. Portanto, não se deve interpretar a lista como ausência das variáveis reservadas.

Usar no destino suas próprias credenciais, armazenadas apenas no servidor. Nunca copiar ou solicitar a service role gerenciada da origem, nem prefixá-la com `VITE_`. Os recursos Google podem precisar de integração externa própria; a geocodificação reversa tem alternativa OSM, sujeita às políticas e limites do serviço.

**Ponto importante da estrutura:** a origem tem **9 funções no schema `private` e 79 no `public`**. As funções públicas de amostras chamam funções privadas. Restaurar somente `public` é insuficiente: conferir `private`, permissões, funções, triggers, índices, tipos, extensões e políticas de Storage. Não reaplicar migrations antigas cegamente.

## 3. Atualização periódica: o que é suportado

### Caminho suportado hoje: exportações periódicas e restauração controlada

A exportação oficial está em **More → Cloud → Overview → Advanced settings → Export project data**. Inclui estrutura, dados e usuários com hashes de senha. **Não inclui arquivos de Storage, código de Edge Functions, secrets ou configurações de provedores.**

Limites documentados: banco ocupando até **15 GB**, arquivo exportado até **5 GB**, **uma solicitação a cada 24 horas**, origem em funcionamento. A exportação fica no Storage e gera link de download por e-mail. O tempo de preparação/restauração também conta para a defasagem; não é espelhamento em tempo real.

Não encontrei método público documentado que agende e entregue automaticamente uma réplica externa completa abrangendo banco, usuários, estrutura e arquivos. Não prometer uma API de exportação ou replicação lógica que o Cloud não disponibiliza nesta análise. Se atualização totalmente automática for obrigatória, confirmar essa capacidade com o suporte Lovable antes de implementar.

### Rotina proposta após autorização

1. Registrar horário do backup, commit do código, migrations e inventário de arquivos.
2. Exportar pela função oficial, no intervalo permitido.
3. Restaurar e verificar uma nova geração isolada da reserva antes de substituir a geração válida; evitar carga parcial sobre a única reserva recuperável.
4. Transferir separadamente arquivos novos/alterados; conferir caminhos, metadados, tamanho e integridade. Exclusões só por política aprovada, mantendo retenção e versão anterior.
5. Conferir contas, vínculos, contagens, permissões e integridade; não reconstruir boletins nem disparar efeitos operacionais durante a restauração.
6. Atualizar o código do aplicativo e funções externas pela versão registrada no GitHub. Mudanças de estrutura devem ser comparadas com o backup/histórico aplicado, não reaplicadas em duplicidade.
7. Validar e marcar a geração como recuperável; registrar falhas e idade da última cópia boa.

**Storage atual confirmado:** `rg-ocr` tem 3 arquivos; `rg-pdfs` e `block-reports` estão vazios; `database_export_12_10_26` tem 1 arquivo. Todos são privados. O bucket de exportação não é mídia operacional e deve ter retenção própria, evitando copiar backups dentro de backups. Não foram baixados arquivos nesta análise.

URLs absolutas de imagens restauradas podem ainda apontar para a origem. Conferir isso no destino e resolver somente na cópia, sem alterar a origem. Arquivos precisam abrir com a origem indisponível para provar independência da reserva.

### Automação personalizada: alternativa condicionada

Uma integração somente leitura na origem, com autenticação específica e escrita exclusiva por um executor no destino, poderia sincronizar tabelas e arquivos. Seria desenvolvimento próprio, **não uma réplica completa nativa do Lovable**. Exige autorização para novos serviços, controle de alterações e exclusões, paginação, consistência entre tabelas, retomada, auditoria e limites de execução. Usuários/hashes e estrutura precisam de caminho administrativo suportado separado; a API pública comum não resolve tudo. `updated_at` sozinho não detecta exclusões nem garante consistência.

Replicação lógica/CDC exigiria acesso e permissões de banco/publicações que não estão disponíveis como configuração self-service confirmada do Cloud. Não propor obtê-los por extração de secrets ou acessos internos.

### Custos e limitações

- Lovable: leituras, processamento, armazenamento dos backups e transferências consomem uso/créditos. Não há tarifa fixa de exportação confirmada nesta análise.
- Destino Supabase: Pro anunciado a partir de **US$25/mês**, com condições de compute/projetos; inclui 8 GB de disco, 100 GB de arquivos, 250 GB de tráfego de saída e backups diários por 7 dias. Excedentes anunciados: disco US$0,125/GB, arquivos US$0,0213/GB e tráfego não cacheado US$0,09/GB. Confirmar valores do plano/organização antes de contratar.
- Hospedagem do aplicativo de teste, executor, armazenamento de gerações anteriores, SMTP e Google podem ter custos adicionais. Uma segunda base de homologação pode acrescentar cobrança de projeto/compute.
- Free serve para avaliação dentro das cotas, mas limites, pausa por inatividade e ausência de backups automáticos tornam-no inadequado como garantia de reserva operacional.
- Backup diário do destino não atualiza dados da origem; backup do banco não é backup dos bytes dos arquivos. Definir perda máxima aceitável e tempo de recuperação antes de prometer disponibilidade.

## 4. Ambiente separado para testar

**Proposta:** cópia do código em implantação externa exclusiva de homologação, em host compatível com o servidor TanStack Start/Cloudflare Workers. Uma hospedagem apenas estática não atende todas as funções do aplicativo.

- Endereço separado, acesso restrito e credenciais do destino somente nessa implantação.
- Nenhuma alteração na conexão, secrets ou publicação do projeto Lovable de produção.
- Configuração externa obrigatória no build e no servidor. O `vite.config.ts` atual contém fallback para a origem; na variante de teste, impedir inicialização quando faltar configuração e verificar que nenhuma requisição de dados/auth/Storage vai à origem.
- Navegador/perfil e domínio separados: não reutilizar sessões, IndexedDB, filas offline ou o PWA da produção. Não limpar o armazenamento dos agentes.
- Na reserva oficial, começar por testes de leitura. Para testar gravações, jornadas, offline e `manage-agents`, usar uma **terceira base descartável de homologação derivada da reserva**, após autorização, sem gravar na reserva oficial ou na produção.
- Isolar e-mails, tarefas agendadas, webhooks e efeitos externos; impedir notificações reais durante testes. Tratar dados e hashes como sensíveis, com acesso limitado e retenção definida.
- Validar e-mail/senha restaurados, matrícula, recuperação de senha com remetente aprovado, papéis/equipes, amostras e histórico, mapas, arquivos privados, relatórios e boletins. Testes de gravação somente na base descartável.

Um remix de projeto Cloud gera outro Cloud: não conecta automaticamente à reserva externa. Ele não é o mecanismo recomendado para testar este destino.

## Critérios para avançar

Antes de executar: confirmar SMTP e inventário implantado, comparar estrutura atual incluindo `private`, definir periodicidade/retensão e tempo de recuperação, aprovar custos e ambiente de homologação. Nada será criado, conectado, publicado ou sincronizado apenas por este plano.

## Referências

- [Lovable — exportação oficial e limites](https://docs.lovable.dev/features/advanced-settings#export-lovable-cloud-data)
- [Lovable — Cloud, remix e migração externa](https://docs.lovable.dev/features/cloud)
- [Lovable — hospedagem externa](https://docs.lovable.dev/tips-tricks/external-deployment-hosting)
- [Supabase — clonagem e itens não copiados](https://supabase.com/docs/guides/platform/clone-project)
- [Supabase — preços](https://supabase.com/pricing)