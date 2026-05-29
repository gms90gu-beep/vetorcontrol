import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    throw redirect({ to: "/login" });
  },
  component: () => null,
});