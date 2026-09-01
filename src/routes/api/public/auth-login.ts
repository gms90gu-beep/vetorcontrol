import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const loginInput = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
});

export const Route = createFileRoute("/api/public/auth-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

        try {
          const input = loginInput.parse(await request.json());
          const url = process.env["SUPABASE_URL"];
          const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
          if (!url || !publishableKey) {
            return new Response(JSON.stringify({ error: "Serviço de autenticação indisponível." }), {
              status: 503,
              headers,
            });
          }

          const authClient = createClient(url, publishableKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          });
          const { data, error } = await authClient.auth.signInWithPassword(input);
          if (error || !data.session) {
            return new Response(JSON.stringify({ error: error?.message ?? "Credenciais inválidas." }), {
              status: 401,
              headers,
            });
          }

          return new Response(JSON.stringify({ session: data.session }), { status: 200, headers });
        } catch (error) {
          const message = error instanceof z.ZodError ? "Dados de acesso inválidos." : "Falha ao autenticar.";
          return new Response(JSON.stringify({ error: message }), { status: 400, headers });
        }
      },
    },
  },
});