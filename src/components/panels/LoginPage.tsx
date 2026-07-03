import { useState } from "react";

/**
 * Página de acceso (/login). El middleware redirige acá cuando no hay
 * sesión; el formulario valida en /api/login, que deja la cookie firmada,
 * y vuelve al juego. Con la protección desactivada (sin variables de
 * entorno) el endpoint responde ok y simplemente se vuelve al inicio.
 */
export function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      setError(true);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  return (
    <div className="app login-screen">
      <div className="banner-card login-card">
        <h2>Backgammon 3D</h2>
        <p className="note">Ingresá con tu usuario y clave para jugar.</p>
        <form onSubmit={submit} className="login-form">
          <label>
            Usuario
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              data-testid="login-user"
            />
          </label>
          <label>
            Clave
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              data-testid="login-password"
            />
          </label>
          {error && (
            <p className="login-error" role="alert">
              Usuario o clave incorrectos.
            </p>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            data-testid="login-submit"
          >
            {busy ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
