export function assertPlatformAdministrator(record) {
  if (!record || record.is_active !== true) {
    throw new Error('Acesso exclusivo do Administrador Geral.');
  }
}

export function normalizeMunicipalityDraft(input) {
  const name = String(input?.name ?? '').trim().replace(/\\s+/g, ' ');
  const stateCode = String(input?.stateCode ?? '').trim().toUpperCase();
  const slug = String(input?.slug ?? '').trim().toLowerCase();
  if (name.length < 3 || name.length > 120) throw new Error('Informe o nome do município.');
  if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(stateCode)) throw new Error('UF inválida.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) throw new Error('Identificador inválido.');
  // Operational activation is deliberately absent until RPC/offline isolation is complete.
  return { name, stateCode, slug };
}

export function normalizeMunicipalAdministrator(input) {
  const municipalityId = String(input?.municipalityId ?? '').trim().toLowerCase();
  const email = String(input?.email ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(municipalityId)) {
    throw new Error('Selecione um município válido.');
  }
  if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail válido para o Admin Master.');
  }
  return { municipalityId, email };
}
