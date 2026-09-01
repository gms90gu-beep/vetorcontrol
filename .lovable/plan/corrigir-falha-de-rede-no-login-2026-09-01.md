# Corrigir falha de rede no login

## Diagnóstico
- O backend e o banco estão saudáveis.
- O endpoint de autenticação responde HTTP 200 e permite os domínios do app.
- No navegador afetado, a chamada direta ao endpoint externo fica pendente e termina em `Failed to fetch`.

## Implementação
1. Criar uma função de servidor pública e limitada exclusivamente à autenticação por e-mail/senha usando a chave publicável.
2. Manter o login direto atual como caminho principal.
3. Quando ocorrer somente erro de rede/timeout, repetir a autenticação pela função no mesmo domínio do app e instalar a sessão retornada no cliente.
4. Preservar validação de credenciais, descoberta de papel, cache local e redirecionamentos existentes.
5. Validar o fluxo, erros de credenciais e compilação.

## Segurança
- Nenhuma chave privada será usada ou exposta.
- O fallback não contorna senha, políticas ou validação do provedor de autenticação.
- Erros de credenciais não serão repetidos; apenas falhas reais de transporte acionam o fallback.
