import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeGetUser } from "@/lib/offline/safe-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/campo")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await safeGetUser();
    if (!data.user) throw redirect({ to: "/login" });
    throw redirect({ to: "/field-work-list", replace: true, search: { restore: undefined, ts: undefined } });
  },
  component: () => null,
});
