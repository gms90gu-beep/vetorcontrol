import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import { defaultErrorComponent } from "./lib/error-page";

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  defaultErrorComponent,
}));
