import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: mocks.getUser }, from: mocks.from,
  storage: { from: () => ({ download: mocks.download, upload: mocks.upload }) },
} }));

import { signAndArchiveBulletin, type BulletinForSignature } from "../../src/lib/bulletin-archive";

function result(value: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert", "update"]) chain[method] = vi.fn(() => chain);
  chain.single = vi.fn(async () => value);
  return chain;
}

describe("signed daily bulletin flow", () => {
  let bulletin: BulletinForSignature;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({ data: { user: { id: "agent" } }, error: null });
    mocks.from.mockReturnValueOnce(result({ data: { full_name: "Agente Teste" }, error: null }));
    const pdf = { addPage: vi.fn(), internal: { pageSize: { getWidth: () => 297 } },
      setFont: vi.fn(), setFontSize: vi.fn(), setTextColor: vi.fn(), text: vi.fn(),
      setDrawColor: vi.fn(), line: vi.fn(), output: () => new Blob(["%PDF-1.7\nreal test bytes"]) };
    bulletin = { pdf: pdf as unknown as BulletinForSignature["pdf"], fileName: "daily.pdf",
      reportType: "daily", periodStart: "2026-10-16", periodEnd: "2026-10-16",
      cycleId: "cycle", sourceDailyRecordId: "daily", agentName: "Agente Teste", registration: "123", municipality: "Cidade" };
  });

  it("surfaces an object-shaped insertion error before any storage access", async () => {
    mocks.from.mockReturnValueOnce(result({ data: null, error: { code: "42501", message: "permission denied" } }));
    await expect(signAndArchiveBulletin(bulletin, "Agente Teste")).rejects.toThrow("42501");
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("uploads PDF with application/pdf after a missing file, verifies it and sets ready", async () => {
    mocks.from.mockReturnValueOnce(result({ data: { id: "archive", signed_at: "2026-10-18T14:00:00Z" }, error: null }));
    const ready = result({ data: { id: "archive", status: "ready" }, error: null });
    mocks.from.mockReturnValueOnce(ready);
    mocks.download.mockResolvedValueOnce({ data: null, error: { statusCode: "404", code: "NoSuchKey", message: "Object not found" } });
    mocks.download.mockResolvedValueOnce({ data: new Blob(["%PDF-1.7\nreal test bytes"]), error: null });
    mocks.upload.mockResolvedValue({ error: null });
    await expect(signAndArchiveBulletin(bulletin, "Agente Teste")).resolves.toMatchObject({ status: "ready" });
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^agent\/.*\.pdf$/), expect.any(Blob), { contentType: "application/pdf", upsert: false });
    expect(mocks.download).toHaveBeenCalledTimes(2);
    expect(ready.update).toHaveBeenCalledWith({ status: "ready", document_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("does not upload when the existing-file read is denied", async () => {
    mocks.from.mockReturnValueOnce(result({ data: { id: "archive", signed_at: "2026-10-18T14:00:00Z" }, error: null }));
    mocks.download.mockResolvedValue({ data: null, error: { statusCode: "403", message: "denied" } });
    await expect(signAndArchiveBulletin(bulletin, "Agente Teste")).rejects.toThrow("ler o PDF arquivado");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});