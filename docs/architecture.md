# Arquitectura

## Stack y por qué

- **Vite + React 19 + TypeScript estricto.** Se eligió Vite sobre Next.js deliberadamente: la app es 100 % client-side (sin SSR ni contenido SEO-dependiente ni API routes obligatorias), React Three Fiber no se beneficia de SSR (el canvas WebGL no se hidrata), los Web Workers se integran nativamente (`new Worker(new URL(...), { type: 'module' })`) y el resultado es un sitio estático que Vercel sirve desde CDN — el deploy más simple y rápido posible. Next.js hubiera agregado capas sin aportar nada a este caso.
- **Zustand** para estado (juego y ajustes), con `persist` a localStorage.
- **React Three Fiber + drei** para el tablero 3D (chunk lazy: three.js solo se descarga en modo 3D).
- **Vitest + fast-check** (unit/property), **Playwright** (E2E), **oxlint + Prettier**.

## Capas

```
┌────────────────────────────────────────────────────────┐
│ UI (React)                                             │
│  components/board/Board2D.tsx   SVG interactivo        │
│  components/board/Board3D.tsx   R3F (lazy)             │
│  components/hud/Hud.tsx         controles + paneles    │
│  components/panels/SettingsPanel.tsx                   │
├────────────────────────────────────────────────────────┤
│ Estado (Zustand)                                       │
│  store/gameStore.ts     flujo de turnos, undo, IA,     │
│                         persistencia, replay record    │
│  store/settingsStore.ts ajustes + overrides por URL    │
├────────────────────────────────────────────────────────┤
│ Motores (sin React)                                    │
│  engines/BackgammonEngineAdapter.ts  interfaz          │
│  engines/BuiltInHeuristicEngine.ts   0-ply/1-ply       │
│  engines/ExpertEngineAdapter.ts      HTTP remoto       │
│  engines/engineClient.ts  timeout + fallback + caché   │
│  engines/worker/engine.worker.ts     host en Worker    │
├────────────────────────────────────────────────────────┤
│ Core de reglas (TypeScript puro, sin dependencias)     │
│  game/backgammon/{types,constants,initialState,dice,   │
│    moveGeneration,rules,notation,serialization,        │
│    pipCount,validate}.ts                               │
└────────────────────────────────────────────────────────┘
```

Dependencias solo hacia abajo. El core no conoce React ni el motor; el motor no conoce la UI; la UI no conoce el interior del motor (habla con `engineClient`).

## Decisiones clave

**Movimientos legales por prefijo.** La regla "hay que usar todos los dados posibles" es global al turno. `maximalSequences(turnStart)` enumera las secuencias maximales (con memoización por posición+dados para colapsar transposiciones de dobles) y la UI solo ofrece movimientos que son prefijo de alguna (`nextMovesAfterPrefix`). El undo re-aplica el prefijo desde el snapshot `turnStart` — nunca hay "reversa" ambigua.

**El motor devuelve intenciones, no estado.** `chooseMove` retorna una secuencia de `Move`s. El store la valida contra `maximalSequences` y cada movimiento pasa además por `applyMoveToGame`, que re-valida geometría (dirección, distancia, prioridad de barra, elegibilidad de bear-off, bloqueos) contra el generador. Un motor remoto malicioso o con bugs no puede corromper el tablero; si falla o expira el timeout, un greedy síncrono en el main thread juega el fallback.

**Worker + caché + fallback.** El cálculo pesado (1-ply = candidatos × 21 tiradas × mejores respuestas) corre en un Web Worker con caché por `positionKey` (posición + dados ordenados + turno; beginner no se cachea porque es ruidoso a propósito). `engineClient` aplica timeouts por dificultad y garantiza respuesta siempre.

**Determinismo y replay.** `DiceRoller` es una interfaz: crypto (rejection sampling) para juego normal, mulberry32 con semilla para reproducibilidad. El store persiste `seed` + `rollsUsed` y hace fast-forward al restaurar, así una partida con semilla sobrevive reloads con el mismo stream de dados. Cada turno queda registrado (`GameRecord`: semilla + tiradas + movimientos + notación) y es exportable como JSON desde Ajustes.

## Flujo de un turno

**Humano:** `rollDice()` → snapshot `turnStart` + secuencias maximales → clicks/drags aplican movimientos validados (con vuelo animado y sonido) → `Deshacer` re-aplica prefijo → `Confirmar` (habilitado solo sin dados jugables) registra la notación y pasa el turno.

**IA:** `runAiTurn()` → (cubo opcional: ofrece si `canOfferDouble` y el motor lo pide) → tira → `engineClient.chooseMove(turnStart)` en worker → validación de la secuencia → aplicación movimiento a movimiento con delays de animación → explicación en el panel → fin de turno o fin de juego. Si la página se recarga a mitad del turno de la IA, `resumeAiIfNeeded()` la retoma.

**Fin de juego:** `winKindFor` clasifica simple/gammon/backgammon → `applyGameResult` aplica puntos × cubo, flags de Crawford y ganador del match → banner + siguiente juego.

## Testing

- **Unit:** setup, dados, generación de movimientos (barra, bloqueos, golpes, dobles, dado mayor, trampas de prefijo), bear-off (exacto/overshoot/suspensión), scoring (gammon/backgammon/cubo/Crawford), notación, serialización.
- **Property (fast-check):** invariantes estructurales tras cada movimiento legal desde posiciones aleatorias alcanzables; los movimientos ofrecidos son subconjunto de los generados por dado.
- **Self-play:** 50 partidas con semilla terminan sin estados inválidos ni loops.
- **Motor:** la IA nunca devuelve secuencias ilegales en 100 posiciones aleatorias (+ verificación externa: el generador fue contrastado contra una implementación de referencia independiente en 80.000 posiciones aleatorias durante el review multi-agente).
- **E2E (Playwright):** carga, partida vs IA, tirar/mover/confirmar, respuesta legal de la IA en varios turnos, cambio de dificultad, undo, persistencia tras reload, viewport mobile.
