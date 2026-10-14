# Fundação municipal — fase 1, somente homologação

Origem de produção: Lovable `ttjzgszxrnmcsygtzfcu`, sem alterações.
Homologação: Supabase `ljlyvtwuikwuqcgrbkii` e Worker `vetorcontrol-copy-validation`.

## Entregue nesta fase

- Registro municipal com Euclides da Cunha/BA em operação e novos municípios em rascunho.
- `municipality_id` nas 33 tabelas de dados municipais. IDs, datas e conteúdo anterior são preservados.
- Defaults compatíveis com payloads antigos e filas offline do primeiro município.
- Restrição temporária em cada tabela impedindo dados de qualquer outro município. Remover somente após a migração dos caminhos privilegiados e do offline.
- Permissão de Administrador Geral separada dos cargos municipais em `platform_administrators`. Nenhuma conta é promovida automaticamente.
- Painel `/platform`, consulta com RLS e criação de rascunhos com validação no servidor e auditoria transacional.
- Clientes não podem cadastrar municípios nem conceder a si mesmos o cargo geral.

## Conta exclusiva

A conta geral deve ter e-mail exclusivo, distinto da conta de agente e do administrador municipal. O vínculo em `platform_administrators` é provisionado por servidor confiável após confirmar a identidade. Não colocar senha ou chaves em código, migrations ou chat. Esta fase não transforma os cargos municipais existentes em cargos gerais.

## Ainda bloqueia a operação de um segundo município

1. Adaptar todas as funções SECURITY DEFINER, consultas com service role e Edge Functions para validar município, equipe e área.
2. Substituir a restrição temporária por RLS municipal, relacionamentos compostos e unicidades por município.
3. Isolar caches, sessões locais, filas, blobs e consultas por município; impedir troca de contexto com trabalho pendente.
4. Adaptar Storage, relatórios e agregações. Registrar suporte com contexto municipal explícito.
5. Testar leitura/escrita/exclusão entre dois municípios, com supervisor, coordenador, administrador municipal e agentes; validar fechamento e reenvio offline.
6. Provisionar usuários municipais e liberar ativação só depois dos testes.

Não é uma implementação completa de multitenancy. Não ativar novo município ou remover os bloqueios com base apenas em uma validação visual.
