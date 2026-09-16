import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const loginInput = z
  .object({
    identifier: z.string().trim().min(1).max(320).optional(),
    // Compatibilidade com clientes antigos que ainda enviam `email`.
    email: z.string().trim().min(1).max(320).optional(),
    password: z.string().min(1).max(1024),
  })
  .refine((value) => Boolean(value.identifier || value.email), {
    message: "Identificador obrigatório.",
  });

export const Route = createFileRoute("/api/public/auth-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

        try {
          const input = loginInput.parse(await request.json());
          const rawIdentifier = (input.identifier || input.email || "").trim();
          const url =
            process.env["SUPABASE_URL"] ||
            process.env["VITE_SUPABASE_URL"] ||
            process.env["SUPABASE_PROJECT_URL"];
          const publishableKey =
            process.env["SUPABASE_PUBLISHABLE_KEY"] ||
            process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
            process.env["SUPABASE_ANON_KEY"] ||
            process.env["VITE_SUPABASE_ANON_KEY"];
          if (!url || !publishableKey) {
            return new Response(JSON.stringify({ error: "Serviço de autenticação indisponível." }), {
              status: 503,
              headers,
            });
          }

          let resolvedEmail = rawIdentifier;

          // Login por matrícula: resolve a matrícula no servidor sem expor a tabela
          // de perfis ao navegador. Contas antigas continuam funcionando com o
          // padrão matricula@vetor.com caso não haja correspondência no perfil.
          if (!rawIdentifier.includes("@")) {
            resolvedEmail = `${rawIdentifier}@vetor.com`;
            const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

            if (serviceRoleKey) {
              try {
                const adminClient = createClient(url, serviceRoleKey, {
                  auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                  },
                });
                const { data: profile, error: profileError } = await adminClient
                  .from("profiles")
                  .select("email")
                  .eq("registration_number", rawIdentifier)
                  .maybeSingle();

                if (!profileError && profile?.email) {
                  resolvedEmail = profile.email;
                }
              } catch (resolutionError) {
                console.warn("[auth-login] Falha ao resolver matrícula; usando fallback legado.", resolutionError);
              }
            }
          }

          const authClient = createClient(url, publishableKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });
          const { data, error } = await authClient.auth.signInWithPassword({
            email: resolvedEmail,
            password: input.password,
          });
          if (error || !data.session) {
            return new Response(JSON.stringify({ error: error?.message ?? "Credenciais inválidas." }), {
              status: 401,
              headers,
            });
          }

          let role: string | null = null;
          try {
            const { data: roleData } = await authClient.rpc("get_user_role", {
              u_id: data.session.user.id,
            });
            role = typeof roleData === "string" ? roleData : null;
          } catch {
            // O acesso ao relatório ainda será protegido pelo middleware;
            // o cache local é apenas um acelerador de navegação.
          }
          if (!role) {
            try {
              const { data: profile } = await authClient
                .from("profiles")
                .select("role")
                .eq("id", data.session.user.id)
                .maybeSingle();
              role = profile?.role ?? null;
            } catch {}
          }

          const expiresAt = Number(data.session.expires_at || 0);
          const maxAge = expiresAt > 0
            ? Math.max(60, expiresAt - Math.floor(Date.now() / 1000))
            : 3600;
          const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
          const cookie = [
            `vetorcontrol_access=${encodeURIComponent(data.session.access_token)}`,
            "Path=/",
            "HttpOnly",
            "SameSite=Lax",
            `Max-Age=${maxAge}`,
            secure,
          ].filter(Boolean).join("; ");

          return new Response(JSON.stringify({ session: data.session, role }), {
            status: 200,
            headers: { ...headers, "Set-Cookie": cookie },
          });
        } catch (error) {
          const message = error instanceof z.ZodError ? "Dados de acesso inválidos." : "Falha ao autenticar.";
          return new Response(JSON.stringify({ error: message }), { status: 400, headers });
        }
      },
      DELETE: async ({ request }) => {
        const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
        const cookie = [
          "vetorcontrol_access=",
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          "Max-Age=0",
          secure,
        ].filter(Boolean).join("; ");
        return new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store", "Set-Cookie": cookie },
        });
      },
    },
  },
});
