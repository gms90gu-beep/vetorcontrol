// Lightweight central logger for map-related issues.
// Funnels through window.Sentry/window.LogRocket when present; always logs to console.

type Level = "info" | "warn" | "error";

type Ctx = Record<string, unknown> | undefined;

function emit(level: Level, scope: string, message: string, ctx?: Ctx) {
  const tag = `[map:${scope}]`;
  const payload = ctx ?? {};
  if (level === "error") console.error(tag, message, payload);
  else if (level === "warn") console.warn(tag, message, payload);
  else console.log(tag, message, payload);

  try {
    const w = globalThis as any;
    if (w?.Sentry?.captureMessage) {
      w.Sentry.captureMessage(`${tag} ${message}`, {
        level,
        extra: payload,
        tags: { module: "map", scope },
      });
    } else if (w?.Sentry?.captureException && level === "error") {
      w.Sentry.captureException(new Error(`${tag} ${message}`), { extra: payload });
    }
  } catch {
    // never let observability break the app
  }
}

export const mapLogger = {
  info: (scope: string, message: string, ctx?: Ctx) => emit("info", scope, message, ctx),
  warn: (scope: string, message: string, ctx?: Ctx) => emit("warn", scope, message, ctx),
  error: (scope: string, message: string, ctx?: Ctx) => emit("error", scope, message, ctx),
};
