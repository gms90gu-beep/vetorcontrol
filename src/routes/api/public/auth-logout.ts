import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/auth-logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
