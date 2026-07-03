# Reglas implementadas

Referencia de las reglas estándar de backgammon tal como las implementa el core (`src/game/backgammon/`), con sus casos límite. Todas están cubiertas por tests unitarios y property tests (`src/game/backgammon/tests/`).

## Representación

- 24 puntos (`points[0..23]`, enteros con signo: positivo = blancas, negativo = negras). El índice `i` es el punto `i+1` en la numeración de las blancas; las negras usan la numeración espejada `24-i`.
- Blancas mueven hacia el índice 0 y sacan desde los índices 0–5 (su home board). Negras mueven hacia el 23 y sacan desde 18–23.
- Barra y fichas fuera (`bar`, `off`) por jugador. 15 fichas por lado, invariante verificado tras cada movimiento.

## Setup y tirada inicial

- Posición inicial estándar (2/24, 5/13, 3/8, 5/6 por lado, espejado).
- Tirada inicial: cada jugador tira un dado; empates se repiten. El ganador empieza **usando ambos dados de la tirada inicial** (nunca dobles).

## Movimiento

- Cada dado mueve una ficha esa cantidad de pips en la dirección propia.
- Un punto con 2+ fichas rivales está **bloqueado**.
- Caer en un punto con exactamente 1 ficha rival la **golpea** y la manda a la barra.
- Con fichas en la barra es **obligatorio entrar primero** (blancas entran en `24-dado`, negras en `dado-1`). Si ambas entradas están bloqueadas, se pierde el turno (*dance*).
- Dobles = 4 movimientos del mismo valor.
- **Uso máximo obligatorio de dados:** solo son legales las secuencias que juegan la cantidad máxima de dados posible. La UI deriva los movimientos individuales legales como prefijos de secuencias maximales, así que es imposible "encerrarse" jugando un dado que mataría al otro.
- **Regla del dado mayor:** con tirada no doble, si solo se puede jugar un dado y cualquiera de los dos podría jugarse individualmente, es obligatorio jugar el mayor.

## Bear-off

- Solo con las 15 fichas (no sacadas) dentro del home board propio; una ficha en la barra lo suspende hasta reingresar y volver todas al home.
- Dado exacto siempre saca (estando en bear-off).
- Dado mayor que el punto solo saca desde el **punto más lejano ocupado**.
- Movimientos internos dentro del home siguen permitidos.
- La partida termina en el momento en que la ficha 15 sale; los dados restantes se descartan.

## Puntuación

- Victoria simple: 1 punto. **Gammon** (rival sin fichas sacadas): 2. **Backgammon** (rival sin sacar y con fichas en la barra o en el home del ganador): 3. Todo multiplicado por el valor del cubo.
- Partidas a 1, 3, 5, 7 u 11 puntos.
- **Regla de Crawford:** cuando un jugador llega a `longitud - 1`, el siguiente juego se juega sin cubo; después se rehabilita.

## Cubo de doblaje (opcional, off por default)

- Se ofrece antes de tirar, solo por quien posee el cubo (o desde el centro).
- Aceptar duplica el valor y transfiere la propiedad al aceptante. Rechazar concede el valor **previo** al doble.
- La IA decide con umbrales de probabilidad de victoria (doble ~0.65–0.85; take ≥ 0.25 — take point clásico cubeless).

## Abandono (simplificación documentada)

En reglas de torneo, abandonar es una **oferta a un nivel declarado** (simple/gammon/backgammon) que el rival puede rechazar. Simplificación v1: la concesión se escala automáticamente — si el ganador ya sacó 10+ fichas y el que abandona ninguna, se concede la clasificación actual (gammon/backgammon); si no, simple. Esto impide esquivar un gammon cantado abandonando a tiempo. Negociación de nivel explícita: fuera de alcance v1.

## Dados

- Aleatoriedad por `crypto.getRandomValues` con rejection sampling (uniforme exacto).
- Modo semilla (mulberry32) para partidas reproducibles, replay y E2E (`?seed=N` en la URL).
- La IA jamás ve ni altera dados futuros: recibe la posición con los dados ya tirados, y cada movimiento que propone se re-valida contra el core.

## Casos límite cubiertos por tests

- Entrada obligatoria con barra y dance con home cerrado.
- Prefijos sin salida excluidos (trampa del "5 que mata al 6").
- Dado mayor forzado cuando solo un dado es jugable.
- Overshoot de bear-off bloqueado con fichas más lejanas; permitido solo desde la más lejana.
- Bear-off suspendido tras un golpe durante el bear-off.
- Gammon vs backgammon (barra y home del ganador).
- Dobles colapsados en notación (`13/9(2)`), golpes (`8/5*`), `bar/22`, `4/off`, `(no play)`.
- Invariantes estructurales tras cada movimiento en 50 partidas de self-play + property tests con fast-check.
