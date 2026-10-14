export function assertPlatformAdministrator(record) {
  if (!record || record.is_active !== true) {
    throw new Error('Acesso exclusivo do Administrador Geral.');
  }
}

export function normalizeMunicipalityDraft(input) {
  const name = String(input?.name ?? '').trim().replace(/\s+/g, ' ');
  const stateCode = String(input?.stateCode ?? '').trim().toUpperCase();
  const slug = String(input?.slug ?? '').trim().toLowerCase();
  if (name.length < 3 || name.length > 120) throw new Error('Informe o nome do município.');
  if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(stateCode)) throw new Error('UF inválida.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new Error('Identificador inválido.');
  // Operational activation is deliberately absent until RPC/offline isolation is complete.
  return { name, stateCode, slug };
}
