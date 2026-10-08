import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{"title": "VetorControl — Operação"}, {"name": "description", "content": "Gestão operacional de vigilância e produção de campo."}, {"property": "og:title", "content": "VetorControl — Operação"}, {"property": "og:description", "content": "Gestão operacional de vigilância e produção de campo."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  beforeLoad: async () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
