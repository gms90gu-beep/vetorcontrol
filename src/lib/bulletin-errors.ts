export type BulletinOperation = "profile" | "insert" | "retry" | "read" | "upload" | "verify" | "ready";

const operations: Record<BulletinOperation, string> = {
  profile: "confirmar o perfil",
  insert: "registrar a assinatura",
  retry: "recuperar a assinatura pendente",
  read: "ler o PDF arquivado",
  upload: "enviar o PDF",
  verify: "conferir o PDF enviado",
  ready: "concluir o arquivamento",
};

// Never interpolate backend details, hints or arbitrary messages: they may
// contain row contents, object paths, URLs or credentials.
export function bulletinOperationError(operation: BulletinOperation, cause: unknown): Error {
  const fields = cause && typeof cause === "object" ? cause as Record<string, unknown> : {};
  const rawCode = fields.code ?? fields.statusCode ?? fields.status;
  const code = String(rawCode ?? "");
  const safeCode = /^(?:[0-9A-Z]{5}|[0-9]{3}|PGRST[0-9]{3})$/.test(code) ? code : "";
  const reason = code === "42501" || code === "403"
    ? "Permissão negada. Peça ao administrador para conferir o acesso ao arquivo de boletins."
    : code === "401"
      ? "Sua sessão expirou. Entre novamente."
      : code === "23505"
        ? "Já existe uma assinatura para este período. Consulte o Arquivo de Boletins."
        : "Tente novamente; se persistir, informe esta etapa ao administrador.";
  const message = `Não foi possível ${operations[operation]}${safeCode ? ` (código ${safeCode})` : ""}. ${reason}`;
  console.error("[BULLETIN_ARCHIVE_ERROR]", { operation, code: safeCode || "unknown", message: reason });
  return new Error(message);
}