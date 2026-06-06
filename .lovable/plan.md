# Sistema Híbrido de Logradouro do Quarteirão

Permitir ao agente escolher entre **capturar via GPS** ou **digitar manualmente** o logradouro do quarteirão, e fazer os imóveis herdarem esses dados automaticamente.

## 1. Banco de dados

Migração na tabela `blocks` adicionando:
- `latitude` (double precision, null)
- `longitude` (double precision, null)
- `address` (text, null) — logradouro
- `neighborhood` (text, null) — bairro
- `city` (text, null) — município
- `location_source` (text, null) — valores: `gps` | `manual`

(Mantém compatibilidade — todos nullable, registros existentes seguem funcionando.)

## 2. Tela de criação/edição do quarteirão (RG)

No `src/routes/_authenticated.rg.editar.$id.tsx` (e no fluxo de criação do boletim), adicionar acima dos campos do quarteirão:

```
Como deseja informar o logradouro?
( ) 📍 Capturar localização    ( ) ✍️ Digitar manualmente
```

**Modo GPS:**
- Botão "📍 Capturar Localização"
- Usa `navigator.geolocation.getCurrentPosition`
- Faz reverse geocoding via gateway Google Maps (`/maps/api/geocode/json?latlng=…`)
- Preenche automaticamente address/neighborhood/city/uf + lat/lng
- Mostra "Localização encontrada: Rua X, Bairro Y" + botão "✓ Confirmar"
- Salva `location_source = 'gps'`

**Modo manual:**
- Campos editáveis: Logradouro, Bairro, Município, Observação
- Salva `location_source = 'manual'` (lat/lng ficam null)

## 3. Herança nos imóveis

Em `addImovel()` e ao criar imóvel novo, pré-preencher do quarteirão:
- `street_name` ← `block.address`
- (bairro/município ficam no boletim; já existem)
- `latitude`/`longitude` do imóvel ← do quarteirão quando GPS (campos já existem em `properties`)

Agente ainda pode editar por imóvel se precisar.

## 4. Exibição

- Lista de quarteirões / detalhe do boletim: mostrar
  ```
  📍 Rua José Bonifácio
  Origem: GPS    (badge verde) | Manual (badge cinza)
  ```

## 5. PDF BRG

Em `src/lib/pdf-generator.ts`, no cabeçalho do boletim adicionar linha opcional:
```
Logradouro: <address>   Origem: GPS/Manual
Lat: <latitude>   Lng: <longitude>
```
(Só renderiza se houver dados.)

## 6. Conector Google Maps

Requer conexão Google Maps Platform (gateway) para reverse geocoding. Se o usuário ainda não tem, pedimos para conectar antes de testar o modo GPS. Sem a conexão, o modo GPS captura lat/lng mas não preenche endereço (fallback: usuário completa manualmente).

## Compatibilidade

`navigator.geolocation` funciona em Android, iOS, tablets e desktop modernos. Requer HTTPS (preview Lovable já é HTTPS).

## Arquivos afetados

- **Migração**: novas colunas em `blocks`
- `src/routes/_authenticated.rg.editar.$id.tsx` — UI de seleção GPS/manual + herança
- `src/routes/_authenticated.rg.tsx` — exibição da origem na listagem
- `src/routes/_authenticated.rg.boletim.$id.tsx` — exibição no boletim
- `src/lib/pdf-generator.ts` — linhas de logradouro/origem/coords no header
- (novo) `src/lib/geocoding.ts` — helper reverse geocoding via gateway

## Confirmações necessárias

1. **Google Maps** — você já tem o conector Google Maps Platform conectado? Sem ele, o GPS captura coordenadas mas não consegue identificar o endereço automaticamente.
2. **Escopo do "quarteirão"** — hoje o cadastro do quarteirão acontece dentro do boletim RG (campos UF/Município/Logradouro já existem no boletim). Confirmar: os novos campos (address/neighborhood/lat/lng/source) devem ficar em `blocks` (compartilhado entre boletins do mesmo quarteirão) ou em `boletins_rg` (por boletim)? O plano acima assume `blocks`.