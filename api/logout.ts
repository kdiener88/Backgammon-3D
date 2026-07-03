import { SESSION_COOKIE } from "../lib/auth";

/**
 * Cierra la sesión: borra la cookie firmada. La siguiente visita pasará por
 * la página de acceso (/login) de nuevo.
 */
export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`,
    },
  });
}
