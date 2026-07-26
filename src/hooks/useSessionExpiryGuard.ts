import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ensureExpiredSessionsClosed } from "@/lib/session-expiry";

/**
 * Roda o auto-fechamento de jornadas expiradas no boot do app autenticado.
 * Idempotente e seguro offline (a intenção fica pendente até voltar a rede).
 */
export function useSessionExpiryGuard() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    void ensureExpiredSessionsClosed(user.id);
  }, [user?.id]);
}
