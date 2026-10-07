/** Sequential pages keep Worker outbound concurrency bounded and avoid silent API row caps. */
export async function readAllQueryPages<T = any>(query: any, limit = Infinity): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let offset = 0; offset < limit; offset += size) {
    const { data, error } = await query.range(offset, Math.min(offset + size - 1, limit - 1));
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < size || rows.length >= limit) break;
  }
  return rows;
}