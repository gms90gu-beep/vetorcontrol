/** Compare hierarchical block identifiers without changing their stored spelling. */
export function compareBlockNumbers(a: unknown, b: unknown): number {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  const hierarchical = /^\d+(?:[./]\d+)*$/;
  const aNumeric = hierarchical.test(left);
  const bNumeric = hierarchical.test(right);
  if (aNumeric && bNumeric) {
    const aa = left.split(/[./]/).map(Number);
    const bb = right.split(/[./]/).map(Number);
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
      if (aa[i] !== bb[i]) return aa[i] - bb[i];
    }
    if (aa.length !== bb.length) return aa.length - bb.length;
  } else if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return left.localeCompare(right, "pt-BR", { numeric: true, sensitivity: "base" });
}
