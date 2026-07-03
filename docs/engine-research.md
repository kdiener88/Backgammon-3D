# Investigación de motores de IA — Backgammon 3D

**Fecha:** 2026-07-03 · **Estado:** decidido e implementado · **Licencia objetivo:** MIT para nuestro código, app estática/client-heavy en Vercel.

Investigación realizada con búsqueda web multi-agente sobre cada candidato (repos, licencias, npm, builds WASM, APIs). Resumen y decisión final debajo.

## 1. Motores evaluados

| Motor | Licencia | Veredicto de integración |
|---|---|---|
| **GNU Backgammon (gnubg)** — [gnu.org/software/gnubg](https://www.gnu.org/software/gnubg/), [Savannah git](https://git.savannah.gnu.org/cgit/gnubg.git) | GPL-3.0-or-later (código **y** pesos de las redes) | Fuerza clase mundial (redes neuronales contact/race/crashed, ~250 features, 0–2 ply + bases de bear-off). Sin build WASM oficial. Binario nativo en Vercel serverless: inviable en la práctica (build estático de glib, 20–50 MB de datos, 0.5–2 s de arranque por cold start). Viable como **servidor separado** (`gnubg -t` como subproceso, o su Python embebido detrás de HTTP). |
| **gnubg-web** — [github.com/hwatheod/gnubg-web](https://github.com/hwatheod/gnubg-web) | GPL-3.0 (heredada) | Port Emscripten probado (~3 MB js/wasm/data, gnubg 1.05). El motor es separable de su GUI y funcionaría en un Web Worker, pero está inactivo (último commit 2021, Emscripten 2.0.23). Distribuir ese WASM en nuestro bundle lo vuelve GPL → **descartado como default**; posible como módulo opcional lazy-loaded en el futuro. |
| **bgweb-api** — [github.com/foochu/bgweb-api](https://github.com/foochu/bgweb-api) | Wrapper MIT, pero incorpora código/redes de gnubg → el conjunto es efectivamente GPL | Reimplementación Go del evaluador multi-ply de gnubg. Imagen Docker con `POST /api/v1/getmoves` (JSON) y un `buildwasm.sh` que produce `lib.wasm` ejecutable en navegador. Proyecto chico, mantenimiento incierto. Mejor uso: **servicio externo operado por el usuario**. |
| **@nodots/backgammon-ai + @nodots/gnubg-hints** — [npm](https://www.npmjs.com/package/@nodots/gnubg-hints) | GPL-3.0 (la etiqueta MIT de `@nodots-llc/backgammon-ai` es engañosa: depende del addon GPL) | Addon N-API solo-Node compilado desde C de gnubg vendorizado en `npm install`; requiere headers de GLib, sin prebuilds, sin navegador. **No funciona en Vercel Functions.** Ojo: `@nodots-llc/gnubg-hints` 4.6.2 es un stub heurístico, no el motor real. Descartado. |
| **wildbg** — [github.com/carsten-wenderdel/wildbg](https://github.com/carsten-wenderdel/wildbg) | MIT OR Apache-2.0; redes entrenadas CC0 | El único motor neuronal con licencia permisiva. API HTTP JSON (`GET /move`, `GET /eval`) vía cargo/Docker. Sin WASM oficial, pero el core (tract-onnx) es compatible wasm32 — un build propio es factible. Madurez alpha: error rate ~5.9 vs gnubg 2-ply, lógica de cubo/match incompleta. **Candidato preferido a futuro** para un tier experto embebido sin contaminar la licencia. |
| **eXtreme Gammon / BGBlitz** — [extremegammon.com](https://www.extremegammon.com/), [bgblitz.com](https://www.bgblitz.com/) | Propietarias | Sin API pública, SDK ni licencia de embebido. Referencia de calidad/UX de análisis, **no integrables**. |

## 2. Decisión implementada

**Tier 1 (default, activo en producción): motor propio TypeScript (MIT) en un Web Worker.**
`BuiltInHeuristicEngine` — evaluación lineal en pip-equivalentes sobre el feature set clásico: carrera (diferencia de pips), exposición de blots con la tabla estándar de probabilidades de hit sobre 36 tiradas, puntos del home board, anchors, largo de prime (con bonus si hay fichas atrapadas), fichas en barra vs fuerza del home rival, penalización por stacking, y un modo carrera pura sin contacto. Niveles:

- **Principiante:** 0-ply + ruido gaussiano y errores deliberados configurables.
- **Intermedio:** 1-ply expectiminimax (top-5 candidatos × 21 tiradas rivales × mejor respuesta estática), con presupuesto de tiempo.
- **Experto (local):** 1-ply con top-12 candidatos y más presupuesto.

Referencias de teoría: [shot table / bkgm.com](https://bkgm.com/), [Keith Count](https://nextgammon.com/en/glossary/keith-count), [EPC](https://bkgm.com/articles/EffectivePipCount/), [expectiminimax](https://en.wikipedia.org/wiki/Expectiminimax), [plies en gnubg](https://www.gnu.org/software/gnubg/manual/html_node/The-depth-to-search-and-plies.html), [TD-Gammon (encoding de 198 unidades, upgrade path)](https://en.wikipedia.org/wiki/TD-Gammon).

**Tier 2 (opcional, apagado por default): `ExpertEngineAdapter` HTTP.**
Contrato JSON estable a nivel app (ver `src/engines/ExpertEngineAdapter.ts`):

```
POST {baseUrl}/api/engine/best-move   { state, match } → { moves, evaluation?, explanation? }
POST {baseUrl}/api/engine/evaluate    { state, match } → { equity, winProbability, breakdown? }
```

Un proxy fino (decenas de líneas) traduce este contrato a bgweb-api o wildbg. Toda respuesta del motor remoto se **re-valida contra el core de reglas** antes de tocar el tablero; si es ilegal o hay timeout, el motor local juega como fallback. La partida nunca se cuelga por un motor externo.

### Racional de licencias

GPLv3 no tiene cláusula de uso por red: llamar a un motor derivado de gnubg por HTTP desde un cliente MIT no impone obligaciones sobre nuestro código, y no redistribuimos el motor (el usuario opera su propia instancia). En cambio, **empaquetar** gnubg-WASM en el bundle sí es distribución y encadenaría la GPL al bundle. Por eso el repo queda 100 % MIT: motor propio, reglas, UI y adapter son nuestros; el código GPL vive solo en infraestructura opcional operada por el usuario. wildbg (MIT/Apache-2.0 + redes CC0) permitiría incluso un tier WASM embebido en el futuro sin fricción de licencias.

## 3. Cómo activar el motor experto externo

1. **Levantar un motor**, por ejemplo:
   - `docker run -p 8080:8080 foochu/bgweb-api:latest` (fuerza gnubg; Fly.io/Cloud Run/Railway/VPS), o
   - wildbg: `cargo run` o Docker desde el repo (sirve `GET /move` y `GET /eval`; Swagger en `/swagger-ui/`).
2. **Escribir el proxy** que exponga `POST /api/engine/best-move` y `POST /api/engine/evaluate` con el contrato de arriba, traduciendo la representación de tablero (nuestro `GameState` usa `points[24]` con signo, barra y off por jugador — ver `docs/architecture.md`).
3. **Apuntar la app al proxy**: build-time con `VITE_EXPERT_ENGINE_URL`, o runtime pegando la URL en Ajustes → “Motor experto (URL)” (persistida en localStorage). Con dificultad **Experto** y URL configurada, el worker usa el adapter remoto; sin URL, usa el motor local experto.

## 4. Qué quedó activo en producción

- **Activo:** `BuiltInHeuristicEngine` (beginner/intermediate/expert-local) en Web Worker, con caché por posición y fallback greedy síncrono.
- **Implementado pero opt-in:** `ExpertEngineAdapter` HTTP (sin servidor público por defecto; el usuario configura el suyo).
- **No integrado:** gnubg-WASM en bundle (licencia), @nodots (no viable en Vercel/navegador), XG/BGBlitz (propietarios).
