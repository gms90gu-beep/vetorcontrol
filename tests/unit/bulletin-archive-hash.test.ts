import { describe, expect, it } from "vitest";
import { verifySignedBulletinHash } from "../../src/lib/bulletin-archive";

async function hash(value: Blob) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await value.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("verifySignedBulletinHash", () => {
  it("accepts the matching SHA-256 for the downloaded PDF", async () => {
    const blob = new Blob(["bulletin pdf bytes"]);
    await expect(verifySignedBulletinHash(blob, await hash(blob))).resolves.toBeUndefined();
  });

  it("rejects a PDF whose bytes differ from the archive record", async () => {
    const expected = await hash(new Blob(["original bulletin"]));
    await expect(
      verifySignedBulletinHash(new Blob(["changed bulletin"]), expected),
    ).rejects.toThrow("não corresponde");
  });

  it("rejects malformed SHA-256 values", async () => {
    await expect(verifySignedBulletinHash(new Blob(["bulletin"]), "invalid")).rejects.toThrow(
      "inválido",
    );
  });
});
