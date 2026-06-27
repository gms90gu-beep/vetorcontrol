import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCachedUserRole } from "@/lib/offline/role-cache";

export const Route = createFileRoute("/_authenticated/coordenador")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });

    const { data: role } = await supabase.rpc("get_user_role", { u_id: data.user.id });
    if (!["coordenador", "admin_master"].includes(role || "")) {
      throw redirect({ to: "/dashboard" });
    }

    throw redirect({ to: "/coordenacao" });
  },
  component: () => null,
});
