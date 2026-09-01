import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const loginInput = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
});

export const signInThroughApp = createServerFn({ method: "POST" })
  .inputValidator((input) => loginInput.parse(input))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

    if (!url || !publishableKey) {
      throw new Error("Serviço de autenticação indisponível.");
    }

    const authClient = createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: authData, error } = await authClient.auth.signInWithPassword(data);
    if (error) throw new Error(error.message);
    if (!authData.session || !authData.user) {
      throw new Error("Não foi possível iniciar a sessão.");
    }

    return {
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
    };
  });