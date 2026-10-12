# Homologação da cópia do Vetor Control

Esta branch prepara exclusivamente o aplicativo de teste para o projeto `ljlyvtwuikwuqcgrbkii`. Não integrar esta configuração à main do Lovable enquanto a origem `ttjzgszxrnmcsygtzfcu` continuar em produção.

O build exige URL e chave pública explícitas. Chaves JWT de outro projeto, chaves service_role no cliente e URLs conflitantes são rejeitadas. O worker tem nome separado: `vetorcontrol-copy-validation`.

## Configuração

Preencher os valores públicos de `.env.copy.example` no ambiente de build. No servidor, configurar a chave privada DO DESTINO no gerenciador de segredos. Ela não deve ser versionada nem enviada ao navegador. Usar um domínio próprio de homologação, com Site URL e redirecionamentos correspondentes no Supabase externo.

Google OAuth e recuperação de senha precisam de configuração própria. SMTP e inventário completo de funções da origem continuam sem confirmação. A função `manage-agents` está publicada na cópia, mas login por matrícula e outras funções TanStack exigem a implantação do servidor completo.

## Validação

Começar por login e leitura: relatórios, equipes, amostras e imagens privadas. Verificar na rede que todas as requisições de dados, Auth e Storage usam o destino. Usar perfil/domínio separados, sem importar filas offline ou sessões da produção. Não limpar o armazenamento dos agentes.

Para testar gravações pela interface, preferir uma base descartável e isolada. Os testes SQL anteriores foram revertidos integralmente. Nenhuma hospedagem foi publicada por esta preparação.

## Reserva

A cópia foi restaurada do backup de 12/10/2026. Não há replicação automática configurada. Arquivos de Storage foram transferidos separadamente e verificados por SHA-256. Novos backups devem ser validados antes de substituir uma geração válida. Não executar migrations antigas novamente nem carregar um novo dump diretamente sobre esta cópia sem comparação.
