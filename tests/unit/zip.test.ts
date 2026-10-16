import { describe, expect, it } from "vitest";
import { buildZip } from "../../src/lib/zip";

describe("buildZip", () => {
  it("writes valid local, central-directory, and end-of-directory records", async () => {
    const name = "Agente/Boletim_á.pdf";
    const contents = new TextEncoder().encode("123456789");
    const bytes = new Uint8Array(await buildZip([{ name, data: contents }]).arrayBuffer());
    const view = new DataView(bytes.buffer);
    const decode = new TextDecoder();

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true)).toBe(0x0800);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    const localNameLength = view.getUint16(26, true);
    expect(decode.decode(bytes.slice(30, 30 + localNameLength))).toBe(name);
    expect(
      decode.decode(bytes.slice(30 + localNameLength, 30 + localNameLength + contents.length)),
    ).toBe("123456789");

    const centralOffset = 30 + localNameLength + contents.length;
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    const centralNameLength = view.getUint16(centralOffset + 28, true);
    const centralSize = 46 + centralNameLength;
    const endOffset = centralOffset + centralSize;
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(endOffset + 10, true)).toBe(1);
    expect(view.getUint32(endOffset + 12, true)).toBe(centralSize);
    expect(view.getUint32(endOffset + 16, true)).toBe(centralOffset);
  });

  it("supports an empty archive", async () => {
    const bytes = new Uint8Array(await buildZip([]).arrayBuffer());
    expect(bytes.length).toBe(22);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});
