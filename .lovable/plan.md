## Redesign /rg — RG Digital

Refazer a tela `/rg` seguindo o design system enviado (header escuro #0b1520, cards #111e2e, fundo #f4f5f7, abas brancas, tipografia compacta com labels 8-9px uppercase). **Mantenho 100% das funcionalidades atuais e o schema atual** — só muda a apresentação.

### Esclarecimento de schema (importante)
O spec diz "INSERT na tabela `blocks` com logradouro/lado/numero/tipo/habitantes". No banco real:
- `blocks` = quarteirão (subarea_id, number, status) — **não armazena imóveis individuais**
- `properties` = imóveis (number, street_name, type, container_count, block_id, user_id…)

O fluxo atual já usa `properties` corretamente (com RLS por `user_id = auth.uid()`). Vou **manter `properties`** como fonte dos imóveis cadastrados — caso contrário, quebraria boletim, RG, mapa e supervisão. Apenas o visual muda.

### Escopo das mudanças (somente `src/routes/_authenticated.rg.tsx`)

1. **Header escuro** `#0b1520` com:
   - Linha superior: voltar `←` · "RG Digital" · fechar `✕` (cores `#4a6b80`)
   - Subtítulo "Ciclo N / Semana N · Quarteirão N · Município – UF"
   - Grid 3 cards `#111e2e` borda `#1e3048`: Trabalhados / Fechados / Focos (focos em `#f87171`)

2. **Tabs brancas** (4): Cadastro · Imóveis (N) · Boletim · Histórico
   - Aba ativa: texto `#0b1520`, borda inferior 2px `#0b1520`
   - Inativa: `#aab0bc`

3. **Aba Cadastro**:
   - Card identidade (ícone map em quadrado azul `#e6f1fb`)
   - Grid 2 botões: "PDF Quarteirão" (`#0b1520`) e "Salvar" (`#059669`)
   - Card "Dados do Quarteirão" (read-only, separadores `#f0f2f4`)
   - Totalizadores grid 3×2: R / C / TB / PE / O / Total Geral (este último `#0b1520` branco)
   - Linha "Total Habitantes" `#059669` 20px bold
   - Lista de imóveis com badge SEQ (001, 002…), badge tipo colorido conforme paleta (R/C/TB/PE/O), lixeira `#e0e4ea` → `#f87171` no hover, confirmação delete
   - Formulário "Novo Imóvel" com borda tracejada `#c0c8d4`, pills clicáveis de tipo, SEQ automático, mantém Rua/Lado ao limpar

4. **Aba Imóveis (N)**: busca por endereço + filtro por tipo (pills) + editar/excluir cada item

5. **Aba Boletim**: renderiza componente existente (`RGBulletinHeader` + `RGBulletinTable` + `RGBulletinFooter`) com botões Imprimir (`window.print`) e Baixar PDF (`generateRGPDF`)

6. **Aba Histórico**: lista de PDFs arquivados (já existe `archivedPDFs`) — Data · Quarteirão · total · Visualizar · PDF

### O que NÃO mexo
- Schema, migrations, RLS, edge functions
- Componentes `RGBulletinHeader/Table/Footer`, `RGQuickAddForm`, `RGImportByPhoto` continuam disponíveis (uso direto onde aplicável)
- Lógica de fetch, salvar PDF no storage, boletins_rg
- Outras rotas, navegação inferior, etc.

### Riscos
- Arquivo grande (778 linhas) será largamente reescrito; mantendo nomes de state/funções para não quebrar handlers.
- Cores hex aplicadas inline (style) já que o spec fixa hex exatos — não convertendo para tokens do design system para evitar drift.
