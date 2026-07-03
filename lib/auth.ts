/**
 * Autenticación de la app: validación de credenciales y sesiones firmadas.
 * Mismo esquema que el proyecto de ajedrez: las credenciales reales viven en
 * variables de entorno (BASIC_AUTH_USER / BASIC_AUTH_PASSWORD) y nunca en el
 * código. Solo lo importan el middleware y las funciones de /api — jamás el
 * bundle del cliente.
 */

export const SESSION_COOKIE = "backgammon_session";

/**
 * Caducidad de la firma del token. La cookie es de SESIÓN (sin Max-Age):
 * el navegador la borra al cerrarse, así el acceso se pide en cada entrada.
 * Este TTL es el tope por si el navegador restaura la sesión anterior.
 */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

/** Comparación en tiempo constante para no filtrar información por timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let diff = bufA.length ^ bufB.length;
  const len = Math.max(bufA.length, bufB.length, 1);
  for (let i = 0; i < len; i++) {
    diff |=
      (bufA[i % Math.max(bufA.length, 1)] ?? 0) ^
      (bufB[i % Math.max(bufB.length, 1)] ?? 0);
  }
  return diff === 0;
}

/**
 * Valida credenciales con tolerancia a errores habituales de tecleo:
 * espacios alrededor (copy-paste) y mayúsculas en el USUARIO (teclados
 * móviles). La CONTRASEÑA sí distingue mayúsculas.
 */
export function validateCredentials(
  gotUser: string,
  gotPassword: string,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  const userOk = timingSafeEqual(
    gotUser.trim().toLowerCase(),
    expectedUser.trim().toLowerCase(),
  );
  const passOk = timingSafeEqual(gotPassword.trim(), expectedPassword.trim());
  return userOk && passOk;
}

/**
 * Valida una cabecera `Authorization: Basic <base64(user:pass)>`.
 * Alternativa para scripts/curl además de la cookie.
 */
export function checkBasicAuth(
  header: string | null,
  user: string,
  password: string,
): boolean {
  if (!header) return false;
  const match = header.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!match) return false;
  let decoded: string;
  try {
    const raw = atob(match[1]);
    decoded = new TextDecoder().decode(
      Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    );
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  return validateCredentials(
    decoded.slice(0, sep),
    decoded.slice(sep + 1),
    user,
    password,
  );
}

// ---------------------------------------------------------------------------
// Sesiones firmadas (HMAC-SHA256 vía Web Crypto: funciona en edge y Node)
// ---------------------------------------------------------------------------

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hexStr: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hexStr) || hexStr.length % 2 !== 0) return null;
  const out = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hexStr.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function hmacKey(material: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`backgammon3d:${material}`),
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Crea un token de sesión `exp.firma` con caducidad. */
export async function createSessionToken(
  secretMaterial: string,
  ttlMs: number = SESSION_TTL_MS,
  now: number = Date.now(),
): Promise<string> {
  const exp = now + ttlMs;
  const key = await hmacKey(secretMaterial);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(exp)),
  );
  return `${exp}.${toHex(sig)}`;
}

/** Verifica un token de sesión: firma válida y no caducado. */
export async function verifySessionToken(
  secretMaterial: string,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expStr = token.slice(0, dot);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;
  const sig = fromHex(token.slice(dot + 1));
  if (!sig || sig.length !== 32) return false;
  const key = await hmacKey(secretMaterial);
  return crypto.subtle.verify(
    "HMAC",
    key,
    sig as unknown as BufferSource,
    new TextEncoder().encode(expStr),
  );
}

/** Material secreto para firmar sesiones (AUTH_SECRET opcional). */
export function sessionSecret(user: string, password: string): string {
  // Acceso a env sin tipos de Node: este módulo también se compila dentro
  // del proyecto de la app (los tests lo importan) donde `process` no existe.
  const env = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  return env?.AUTH_SECRET ?? `${user}:${password}`;
}

/** Lee una cookie de la cabecera `Cookie`. */
export function readCookie(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}
