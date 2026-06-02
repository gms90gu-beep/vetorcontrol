import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/comando")({
  beforeLoad: () => {
    throw redirect({ to: "/admin-master", replace: true });
  },
  component: () => null,
});
