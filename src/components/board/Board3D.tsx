import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import type { Player } from "../../game/backgammon/types";
import { ownCount } from "../../game/backgammon/moveGeneration";
import { HUMAN, currentLegalMoves, useGame } from "../../store/gameStore";

// ---------------------------------------------------------------------------
// Layout: X across the board (12 columns + bar), Z along the points.
// Top row (indices 12..23) sits at negative Z; bottom row at positive Z.
// ---------------------------------------------------------------------------
const POINT_W = 0.92;
const EDGE_Z = 3.62;
const CHECKER_R = 0.4;
const CHECKER_H = 0.14;

function columnOf(index: number): number {
  return index >= 12 ? index - 12 : 11 - index;
}

function colX(col: number): number {
  return -5.98 + POINT_W / 2 + col * POINT_W + (col >= 6 ? 1.1 : 0);
}

function pointX(index: number): number {
  return colX(columnOf(index));
}

function isTop(index: number): boolean {
  return index >= 12;
}

function checkerPos3D(
  index: number,
  stackIdx: number,
): [number, number, number] {
  const layer = Math.floor(stackIdx / 5);
  const slot = stackIdx % 5;
  const dz = 0.45 + slot * (CHECKER_R * 2 + 0.02);
  const z = isTop(index) ? -EDGE_Z + dz : EDGE_Z - dz;
  return [pointX(index), 0.02 + CHECKER_H / 2 + layer * (CHECKER_H + 0.01), z];
}

function barPos3D(player: Player, stackIdx: number): [number, number, number] {
  const z =
    player === "white"
      ? -1.1 - (stackIdx % 3) * 0.9
      : 1.1 + (stackIdx % 3) * 0.9;
  return [
    0,
    0.21 + CHECKER_H / 2 + Math.floor(stackIdx / 3) * (CHECKER_H + 0.01),
    z,
  ];
}

function trayPos3D(player: Player, k: number): [number, number, number] {
  const z = player === "white" ? 2.1 + (k % 5) * 0.32 : -2.1 - (k % 5) * 0.32;
  return [
    6.65,
    0.02 + CHECKER_H / 2 + Math.floor(k / 5) * (CHECKER_H + 0.01),
    z,
  ];
}

const WHITE_MAT = { color: "#e8dcc2", roughness: 0.32, metalness: 0.05 };
const BLACK_MAT = { color: "#3a2a1e", roughness: 0.4, metalness: 0.08 };

/** Premium 3D board. Interaction: click checker → click destination. */
export function Board3D() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 12.5, 6.8], fov: 40 }}
      style={{ width: "100%", height: "100%", minHeight: 420 }}
    >
      <color attach="background" args={["#171008"]} />
      <fog attach="fog" args={["#171008", 22, 34]} />
      <ambientLight intensity={0.55} color="#ffe8c8" />
      <directionalLight
        position={[6, 12, 5]}
        intensity={1.5}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      <pointLight position={[-7, 6, -4]} intensity={18} color="#c9a45c" />
      <Scene />
      <OrbitControls
        enablePan={false}
        minPolarAngle={0.3}
        maxPolarAngle={1.25}
        minDistance={7}
        maxDistance={20}
        target={[0, 0, 0.2]}
      />
    </Canvas>
  );
}

function Scene() {
  const game = useGame((s) => s.match.game);
  const selected = useGame((s) => s.selected);
  const hintMoves = useGame((s) => s.hintMoves);
  const aiThinking = useGame((s) => s.aiThinking);
  const select = useGame((s) => s.select);
  const moveChecker = useGame((s) => s.moveChecker);

  const legal = useMemo(() => {
    void game;
    return currentLegalMoves(useGame.getState());
  }, [game]);
  const humanCanAct =
    game.phase === "moving" && game.turn === HUMAN && !aiThinking;

  const sources = useMemo(() => {
    const s = new Set<number | "bar">();
    if (humanCanAct) for (const m of legal) s.add(m.from);
    return s;
  }, [legal, humanCanAct]);

  const destinations = useMemo(() => {
    const s = new Set<number | "off">();
    if (selected !== null)
      for (const m of legal) if (m.from === selected) s.add(m.to);
    return s;
  }, [legal, selected]);

  const hint = hintMoves && hintMoves.length > 0 ? hintMoves[0] : null;

  function onLocClick(loc: number | "bar" | "off") {
    if (!humanCanAct) return;
    if (selected !== null && loc !== "bar") {
      const m = legal.find((x) => x.from === selected && x.to === loc);
      if (m) {
        moveChecker(selected, loc);
        return;
      }
    }
    if (loc !== "off" && sources.has(loc))
      select(selected === loc ? null : loc);
    else select(null);
  }

  return (
    <group>
      <BoardBase />
      {/* Point triangles */}
      {Array.from({ length: 24 }, (_, i) => (
        <PointTriangle
          key={i}
          index={i}
          isDestination={destinations.has(i)}
          isHint={hint !== null && (hint.to === i || hint.from === i)}
          onClick={() => onLocClick(i)}
        />
      ))}
      {/* Checkers */}
      {Array.from({ length: 24 }, (_, i) =>
        (["white", "black"] as Player[]).map((player) => {
          const count = ownCount(game.points, player, i);
          return Array.from({ length: count }, (_, k) => {
            const top = k === count - 1;
            return (
              <Checker3D
                key={`${i}-${player}-${k}`}
                position={checkerPos3D(i, k)}
                player={player}
                selected={selected === i && player === HUMAN && top}
                selectable={
                  humanCanAct && player === HUMAN && top && sources.has(i)
                }
                onClick={() => onLocClick(i)}
              />
            );
          });
        }),
      )}
      {/* Bar checkers */}
      {(["white", "black"] as Player[]).map((player) =>
        Array.from({ length: game.bar[player] }, (_, k) => (
          <Checker3D
            key={`bar-${player}-${k}`}
            position={barPos3D(player, k)}
            player={player}
            selected={
              selected === "bar" &&
              player === HUMAN &&
              k === game.bar[player] - 1
            }
            selectable={humanCanAct && player === HUMAN && sources.has("bar")}
            onClick={() => onLocClick("bar")}
          />
        )),
      )}
      {/* Borne-off checkers */}
      {(["white", "black"] as Player[]).map((player) =>
        Array.from({ length: game.off[player] }, (_, k) => (
          <mesh
            key={`off-${player}-${k}`}
            position={trayPos3D(player, k)}
            castShadow
          >
            <cylinderGeometry
              args={[CHECKER_R * 0.92, CHECKER_R * 0.92, CHECKER_H, 28]}
            />
            <meshStandardMaterial
              {...(player === "white" ? WHITE_MAT : BLACK_MAT)}
            />
          </mesh>
        )),
      )}
      {/* Off-tray destination glow + click zone */}
      <mesh
        position={[6.65, 0.06, 2.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={() => onLocClick("off")}
        visible={destinations.has("off")}
      >
        <planeGeometry args={[0.95, 3.4]} />
        <meshStandardMaterial
          color="#e8c987"
          emissive="#e8c987"
          emissiveIntensity={0.8}
          transparent
          opacity={0.5}
        />
      </mesh>
      <ClickZone
        x={6.65}
        z={2.6}
        w={1.1}
        d={3.6}
        onClick={() => onLocClick("off")}
      />
      <ClickZone
        x={0}
        z={0}
        w={1.3}
        d={7.6}
        onClick={() => onLocClick("bar")}
      />
      <Dice />
    </group>
  );
}

function BoardBase() {
  return (
    <group>
      {/* Outer walnut frame — its top face sits at y = 0 */}
      <RoundedBox
        args={[14.9, 0.6, 8.7]}
        radius={0.12}
        position={[0.35, -0.3, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          color="#3b2414"
          roughness={0.55}
          metalness={0.05}
        />
      </RoundedBox>
      {/* Felt playing fields */}
      <mesh
        position={[-3.25, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[5.9, 7.9]} />
        <meshStandardMaterial color="#1d3227" roughness={0.9} />
      </mesh>
      <mesh
        position={[3.25, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[5.9, 7.9]} />
        <meshStandardMaterial color="#1d3227" roughness={0.9} />
      </mesh>
      {/* Center bar */}
      <RoundedBox
        args={[1.05, 0.55, 8.5]}
        radius={0.1}
        position={[0, -0.07, 0]}
        castShadow
      >
        <meshStandardMaterial color="#5a3a20" roughness={0.5} />
      </RoundedBox>
      {/* Off tray recess */}
      <mesh
        position={[6.65, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[1.15, 7.9]} />
        <meshStandardMaterial color="#241708" roughness={0.75} />
      </mesh>
      {/* Gold edge strips (outer border only) */}
      {(
        [
          [0.35, -4.31, 14.94, 0.1],
          [0.35, 4.31, 14.94, 0.1],
          [-7.08, 0, 0.1, 8.72],
          [7.78, 0, 0.1, 8.72],
        ] as const
      ).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            color="#c9a45c"
            metalness={0.7}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  );
}

function PointTriangle({
  index,
  isDestination,
  isHint,
  onClick,
}: {
  index: number;
  isDestination: boolean;
  isHint: boolean;
  onClick: () => void;
}) {
  const top = isTop(index);
  const geometry = useMemo(() => {
    // After the -PI/2 X-rotation, shape +y maps to world -z. Top-row
    // triangles must point toward the center (+z), so their apex uses -y.
    const shape = new THREE.Shape();
    const half = POINT_W / 2 - 0.05;
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, top ? -3.1 : 3.1);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [top]);
  const light = index % 2 === (top ? 0 : 1);
  const color = light ? "#c4a97c" : "#6e2f36";
  return (
    <group
      position={[pointX(index), 0.022, top ? -EDGE_Z - 0.18 : EDGE_Z + 0.18]}
    >
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={onClick}
        receiveShadow
      >
        <meshStandardMaterial
          color={isDestination ? "#d8c08a" : isHint ? "#7dab7c" : color}
          emissive={isDestination ? "#e8c987" : isHint ? "#7dab7c" : "#000000"}
          emissiveIntensity={isDestination ? 0.45 : isHint ? 0.35 : 0}
          roughness={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>
      {isDestination && (
        <mesh
          position={[0, 0.02, top ? 0.7 : -0.7]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.22, 24]} />
          <meshStandardMaterial
            color="#e8c987"
            emissive="#e8c987"
            emissiveIntensity={1.2}
          />
        </mesh>
      )}
    </group>
  );
}

function ClickZone({
  x,
  z,
  w,
  d,
  onClick,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  onClick: () => void;
}) {
  return (
    <mesh position={[x, 0.35, z]} onClick={onClick} visible={false}>
      <boxGeometry args={[w, 0.7, d]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

function Checker3D({
  position,
  player,
  selected,
  selectable,
  onClick,
}: {
  position: [number, number, number];
  player: Player;
  selected: boolean;
  selectable: boolean;
  onClick: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  // Drop-in animation: newly mounted checkers scale up smoothly.
  useEffect(() => {
    ref.current?.scale.setScalar(0.55);
  }, []);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = selected ? 1.08 : 1;
    const s = THREE.MathUtils.damp(g.scale.x, target, 12, delta);
    g.scale.setScalar(s);
    g.position.y = THREE.MathUtils.damp(
      g.position.y,
      position[1] + (selected ? 0.18 : 0),
      10,
      delta,
    );
  });
  return (
    <group ref={ref} position={position}>
      <mesh
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          if (selectable) {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <cylinderGeometry args={[CHECKER_R, CHECKER_R, CHECKER_H, 32]} />
        <meshStandardMaterial
          {...(player === "white" ? WHITE_MAT : BLACK_MAT)}
          emissive={
            selected ? "#e8c987" : hovered && selectable ? "#c9a45c" : "#000000"
          }
          emissiveIntensity={selected ? 0.5 : hovered && selectable ? 0.3 : 0}
        />
      </mesh>
      {/* Engraved ring detail */}
      <mesh
        position={[0, CHECKER_H / 2 + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[CHECKER_R * 0.55, CHECKER_R * 0.62, 32]} />
        <meshStandardMaterial
          color={player === "white" ? "#b8a888" : "#6b4426"}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Dice: rounded cubes with painted pip textures, tumbling on each roll.
// ---------------------------------------------------------------------------
function makePipTexture(value: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f2ead6";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#221812";
  const c = size / 2;
  const o = size / 4;
  const spots: Record<number, [number, number][]> = {
    1: [[c, c]],
    2: [
      [o, o],
      [size - o, size - o],
    ],
    3: [
      [o, o],
      [c, c],
      [size - o, size - o],
    ],
    4: [
      [o, o],
      [o, size - o],
      [size - o, o],
      [size - o, size - o],
    ],
    5: [
      [o, o],
      [o, size - o],
      [c, c],
      [size - o, o],
      [size - o, size - o],
    ],
    6: [
      [o, o],
      [o, c],
      [o, size - o],
      [size - o, o],
      [size - o, c],
      [size - o, size - o],
    ],
  };
  for (const [x, y] of spots[value]) {
    ctx.beginPath();
    ctx.arc(x, y, size / 10, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** Face order for BoxGeometry materials: +x, -x, +y, -y, +z, -z. */
function faceValues(top: number): number[] {
  const pairs = [
    [1, 6],
    [2, 5],
    [3, 4],
  ].filter(([a, b]) => a !== top && b !== top && a !== 7 - top);
  const [p1, p2] = pairs;
  return [p1[0], p1[1], top, 7 - top, p2[0], p2[1]];
}

function Die({
  value,
  index,
  rollId,
}: {
  value: number;
  index: number;
  rollId: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const spin = useRef(0);
  const textures = useMemo(() => {
    const cache = new Map<number, THREE.CanvasTexture>();
    for (let v = 1; v <= 6; v++) cache.set(v, makePipTexture(v));
    return cache;
  }, []);
  const materials = useMemo(
    () =>
      faceValues(value).map(
        (v) =>
          new THREE.MeshStandardMaterial({
            map: textures.get(v),
            roughness: 0.25,
          }),
      ),
    [value, textures],
  );
  useEffect(() => {
    spin.current = 14 + index * 3;
  }, [rollId, index]);
  useFrame((_, delta) => {
    const m = ref.current;
    if (!m) return;
    if (spin.current > 0.05) {
      m.rotation.x += spin.current * delta;
      m.rotation.z += spin.current * 0.7 * delta;
      m.position.y = 0.5 + Math.abs(Math.sin(spin.current * 2)) * 0.35;
      spin.current = Math.max(spin.current - delta * 18, 0);
    } else {
      m.rotation.x = THREE.MathUtils.damp(
        m.rotation.x % (Math.PI * 2),
        0,
        14,
        delta,
      );
      m.rotation.z = THREE.MathUtils.damp(
        m.rotation.z % (Math.PI * 2),
        0,
        14,
        delta,
      );
      m.position.y = THREE.MathUtils.damp(m.position.y, 0.33, 12, delta);
    }
  });
  return (
    <mesh
      ref={ref}
      material={materials}
      position={[2.2 + index * 1.1, 0.33, 0.2]}
      castShadow
    >
      <boxGeometry args={[0.62, 0.62, 0.62]} />
    </mesh>
  );
}

function Dice() {
  const rolled = useGame((s) => s.match.game.rolled);
  const historyLen = useGame((s) => s.history.length);
  if (!rolled) return null;
  const rollId = historyLen * 100 + rolled[0] * 10 + rolled[1];
  return (
    <group>
      <Die value={rolled[0]} index={0} rollId={rollId} />
      <Die value={rolled[1]} index={1} rollId={rollId} />
    </group>
  );
}
