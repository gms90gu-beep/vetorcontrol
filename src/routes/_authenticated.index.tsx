import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/")({
  component: AuthIndex,
});

function AuthIndex() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/dashboard" as any, replace: true });
  }, [navigate]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
