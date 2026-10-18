import { describe, expect, it, vi } from "vitest";
import { bulletinOperationError } from "../../src/lib/bulletin-errors";

describe("bulletin operation errors", () => {
  it("handles plain database error objects and identifies denied insertion", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = bulletinOperationError("insert", { code: "42501", message: "permission denied for table signed_bulletin_archive" });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("registrar a assinatura");
    expect(error.message).toContain("42501");
    expect(error.message).toContain("Permissão negada");
    vi.restoreAllMocks();
  });

  it("does not expose arbitrary backend contents in UI or diagnostic logs", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = bulletinOperationError("upload", { code: "403", message: "secret-token", details: "private-row", hint: "secret-key" });
    expect(JSON.stringify([error.message, log.mock.calls])).not.toMatch(/secret-token|private-row|secret-key/);
    expect(error.message).toContain("enviar o PDF");
    vi.restoreAllMocks();
  });
});