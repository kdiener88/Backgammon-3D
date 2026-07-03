import { next } from "@vercel/functions";
import {
  SESSION_COOKIE,
  checkBasicAuth,
  readCookie,
  sessionSecret,
  verifySessionToken,
} from "./lib/auth";

/**
 * Protección del sitio con usuario y contraseña (Vercel Routing Middleware).
 *
 * Se activa definiendo las variables de entorno BASIC_AUTH_USER y
 * BASIC_AUTH_PASSWORD. Sin ellas el sitio queda abierto (desarrollo local,
 * E2E). Mismo flujo que el proyecto de ajedrez: sin sesión válida se
 * redirige a /login, que valida las credenciales en /api/login y deja una
 * cookie de sesión firmada (HMAC). También se acepta `Authorization: Basic`
 * para scripts. Quedan públicos la página de acceso, sus endpoints y los
 * estáticos que necesita para renderizarse (bundle de la SPA).
 */

const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

export default async function middleware(request: Request): Promise<Response> {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return next();

  const { pathname } = new URL(request.url);
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/assets/")) {
    return next();
  }

  // 1) Cookie de sesión firmada (página de login).
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (await verifySessionToken(sessionSecret(user, password), token)) {
    return next();
  }

  // 2) Alternativa para scripts/CLI: Basic Auth.
  if (checkBasicAuth(request.headers.get("authorization"), user, password)) {
    return next();
  }

  const loginUrl = new URL("/login", request.url);
  return Response.redirect(loginUrl, 307);
}

export const config = {
  // Los estáticos con hash quedan fuera para no gastar invocaciones.
  matcher: ["/((?!assets/).*)"],
};
