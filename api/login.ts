import {
  SESSION_COOKIE,
  createSessionToken,
  sessionSecret,
  validateCredentials,
} from "../lib/auth.js";

/**
 * Valida las credenciales del formulario de acceso y, si son correctas,
 * deja una cookie de sesión firmada (HttpOnly, cookie de sesión: se borra
 * al cerrar el navegador). Mismo contrato que el proyecto de ajedrez.
 */
export async function POST(request: Request): Promise<Response> {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  // Sin credenciales configuradas el sitio está abierto.
  if (!user || !password) {
    return Response.json({ ok: true });
  }

  let body: { user?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { user?: unknown; password?: unknown };
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const gotUser = typeof body.user === "string" ? body.user : "";
  const gotPassword = typeof body.password === "string" ? body.password : "";

  if (!validateCredentials(gotUser, gotPassword, user, password)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const token = await createSessionToken(sessionSecret(user, password));
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    },
  });
}
