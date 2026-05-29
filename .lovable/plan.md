## Situação

O `src/routes/login.tsx` já contém exatamente a lógica de redirecionamento que você descreveu (linhas 34–52): chama `get_user_role`, lê o role e redireciona para `/admin-master`, `/supervision` ou `/dashboard`.

A única diferença é o nome do parâmetro da RPC:
- Sua mensagem pede: `{ user_id: data.user.id }`
- O código atual usa: `{ u_id: data.user.id }`

A assinatura da função SQL `get_user_role` no banco espera **`u_id`** — foi exatamente isso que corrigimos nas últimas duas rodadas (erro TS2353). Se trocarmos de volta para `user_id`, o build quebra outra vez com o mesmo erro.

## Proposta

Duas opções — preciso da sua confirmação antes de aplicar:

**Opção A (recomendada):** Manter `u_id` no `login.tsx`. Nenhuma mudança de código necessária — o comportamento de redirecionamento já é o que você descreveu.

**Opção B:** Renomear o parâmetro da função SQL de `u_id` para `user_id` via migration (`DROP FUNCTION public.get_user_role(uuid); CREATE FUNCTION public.get_user_role(user_id uuid) ...`) e então atualizar `login.tsx` e `admin-master.tsx` para passarem `{ user_id: ... }`. Mais invasivo, mas alinha com o nome que você prefere.

Qual opção devo seguir?