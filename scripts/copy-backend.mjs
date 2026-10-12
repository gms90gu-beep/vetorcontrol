export const COPY_PROJECT_ID = "ljlyvtwuikwuqcgrbkii";
export function readCopyBackend(env = process.env) {
  if (Object.entries(env).some(([name, value]) => value && name.startsWith("VITE_") && /SERVICE_ROLE|SECRET_KEY/.test(name))) throw new Error("Homologação: segredo privado em variável pública bloqueado.");
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Homologação: configure explicitamente URL e chave pública da cópia.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== `${COPY_PROJECT_ID}.supabase.co` || parsed.port || !["", "/"].includes(parsed.pathname) || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error("Homologação: conexão fora do projeto de cópia bloqueada.");
  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_PROJECT_URL", "SUPABASE_URL", "SUPABASE_PROJECT_URL"]) {
    if (env[name] && env[name].replace(/\/$/, "") !== parsed.origin) throw new Error(`Homologação: configuração conflitante em ${name}.`);
  }
  for (const name of ["VITE_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID"]) {
    if (env[name] && env[name] !== COPY_PROJECT_ID) throw new Error(`Homologação: projeto incorreto em ${name}.`);
  }
  if (key.startsWith("sb_publishable_")) return { url: parsed.origin, key, projectId: COPY_PROJECT_ID };
  let claims;
  try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); } catch { throw new Error("Homologação: chave pública inválida."); }
  if (claims.ref !== COPY_PROJECT_ID || claims.role !== "anon") throw new Error("Homologação: chave de outro projeto ou chave privada bloqueada.");
  return { url: parsed.origin, key, projectId: COPY_PROJECT_ID };
}
