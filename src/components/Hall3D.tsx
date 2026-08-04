import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

/**
 * 3D model of Sala São Paulo (simplified).
 * Coordinates in meters: stage at x = 0, audience extends to x = HALL_LEN.
 * Movable ceiling sits at y = height.
 */
const HALL_LEN = 40;
const HALL_W = 22;
const SOURCE = new THREE.Vector3(2.5, 2.2, 0);

const WOOD = "#b07a3f";
const WOOD_DARK = "#6b4327";
const STONE = "#d8bd8c";
const SEAT = "#5d1a24";

function Columns() {
  const xs = useMemo(
    () => Array.from({ length: 9 }, (_, i) => 4 + i * 4.2),
    [],
  );
  return (
    <>
      {xs.map((x) =>
        [-HALL_W / 2 + 0.9, HALL_W / 2 - 0.9].map((z) => (
          <group key={`${x}-${z}`} position={[x, 0, z]}>
            <mesh position={[0, 7, 0]} castShadow>
              <cylinderGeometry args={[0.75, 0.85, 14, 20]} />
              <meshStandardMaterial color={STONE} roughness={0.85} />
            </mesh>
            {/* capital */}
            <mesh position={[0, 14.3, 0]}>
              <boxGeometry args={[2.1, 0.8, 2.1]} />
              <meshStandardMaterial color="#e6cfa0" roughness={0.8} />
            </mesh>
            {/* base */}
            <mesh position={[0, 0.3, 0]}>
              <boxGeometry args={[2.2, 0.6, 2.2]} />
              <meshStandardMaterial color="#c9ab7c" roughness={0.9} />
            </mesh>
          </group>
        )),
      )}
    </>
  );
}

function Seats() {
  const rows = 16;
  const cols = 18;
  const positions = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let r = 0; r < rows; r++) {
      const x = 9 + r * 1.75;
      const y = 0.25 + r * 0.16;
      for (let c = 0; c < cols; c++) {
        const z = -HALL_W / 2 + 2.4 + c * ((HALL_W - 5) / (cols - 1));
        out.push([x, y, z]);
      }
    }
    return out;
  }, []);

  return (
    <>
      {/* raked floor */}
      <mesh position={[24, 0.9, 0]} rotation={[0, 0, -0.055]} receiveShadow>
        <boxGeometry args={[34, 0.4, HALL_W - 2]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.95} />
      </mesh>
      {positions.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <boxGeometry args={[0.5, 0.35, 0.75]} />
            <meshStandardMaterial color={SEAT} roughness={0.9} />
          </mesh>
          <mesh position={[-0.28, 0.42, 0]}>
            <boxGeometry args={[0.14, 0.85, 0.75]} />
            <meshStandardMaterial color={SEAT} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Orchestra() {
  const chairs = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 11; c++) {
        out.push([1.4 + r * 1.5, 1.35, -6.5 + c * 1.3]);
      }
    }
    return out;
  }, []);
  return (
    <>
      {/* stage */}
      <mesh position={[3.5, 0.6, 0]} receiveShadow>
        <boxGeometry args={[9, 1.2, HALL_W - 4]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {chairs.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <boxGeometry args={[0.42, 0.3, 0.42]} />
            <meshStandardMaterial color="#2f4f7a" roughness={0.85} />
          </mesh>
          <mesh position={[0.22, 0.42, 0]}>
            <boxGeometry args={[0.1, 0.55, 0.42]} />
            <meshStandardMaterial color="#2f4f7a" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function MovableCeiling({ height }: { height: number }) {
  const panels = useMemo(() => {
    const out: { pos: [number, number, number]; size: [number, number, number] }[] =
      [];
    const nx = 5;
    const nz = 3;
    const pw = (HALL_LEN - 4) / nx;
    const pd = (HALL_W - 4) / nz;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        out.push({
          pos: [2 + pw * (i + 0.5), 0, -((HALL_W - 4) / 2) + pd * (j + 0.5)],
          size: [pw - 0.5, 0.55, pd - 0.5],
        });
      }
    }
    return out;
  }, []);

  return (
    <group position={[0, height, 0]}>
      {panels.map((p, i) => (
        <group key={i} position={p.pos}>
          <mesh castShadow>
            <boxGeometry args={p.size} />
            <meshStandardMaterial color={WOOD} roughness={0.55} metalness={0.05} />
          </mesh>
          {/* suspension cables up to the truss roof */}
          {[
            [-p.size[0] / 2 + 0.4, p.size[2] / 2 - 0.4],
            [p.size[0] / 2 - 0.4, -p.size[2] / 2 + 0.4],
          ].map(([cx, cz], k) => {
            const len = Math.max(0.2, 26 - height);
            return (
              <mesh key={k} position={[cx, len / 2 + 0.3, cz]}>
                <cylinderGeometry args={[0.045, 0.045, len, 6]} />
                <meshStandardMaterial color="#8a6a44" roughness={0.6} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function Rays({
  height,
  listener,
}: {
  height: number;
  listener: THREE.Vector3;
}) {
  const segments = useMemo(() => {
    const nx = 5;
    const pw = (HALL_LEN - 4) / nx;
    return Array.from({ length: nx }, (_, i) => {
      const hit = new THREE.Vector3(2 + pw * (i + 0.5), height - 0.35, 0);
      return [
        [SOURCE.clone(), hit.clone()],
        [hit.clone(), listener.clone()],
      ];
    }).flat();
  }, [height, listener]);

  return (
    <>
      <Line
        points={[SOURCE.clone(), listener.clone()]}
        color="#fff0c0"
        lineWidth={2}
      />
      {segments.map((s, i) => (
        <Line
          key={i}
          points={s}
          color="#e6c65c"
          lineWidth={1}
          dashed={i % 2 === 1}
          dashSize={0.5}
          gapSize={0.4}
          transparent
          opacity={0.7}
        />
      ))}
    </>
  );
}

function Scene({
  height,
  listenerX,
  listenerZ,
  onMove,
}: {
  height: number;
  listenerX: number;
  listenerZ: number;
  onMove: (x: number, z: number) => void;
}) {
  const listener = useMemo(
    () => new THREE.Vector3(listenerX, 1.6 + (listenerX - 9) * 0.09, listenerZ),
    [listenerX, listenerZ],
  );

  return (
    <>
      <color attach="background" args={["#120c07"]} />
      <fog attach="fog" args={["#120c07", 40, 110]} />
      <ambientLight intensity={0.35} color="#ffd9a0" />
      <hemisphereLight intensity={0.35} color="#ffcf8f" groundColor="#3a2415" />
      <directionalLight
        position={[10, 24, 12]}
        intensity={1.1}
        color="#ffca7a"
        castShadow
      />
      <pointLight
        position={[SOURCE.x, SOURCE.y + 1, 0]}
        intensity={40}
        distance={20}
        color="#fff3d6"
      />
      <pointLight position={[26, height - 1, 0]} intensity={60} distance={40} color="#ffb765" />

      {/* base floor / click surface */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[HALL_LEN / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onMove(e.point.x, e.point.z);
        }}
        receiveShadow
      >
        <planeGeometry args={[HALL_LEN, HALL_W]} />
        <meshStandardMaterial color="#3b2617" roughness={1} />
      </mesh>

      {/* walls */}
      {[-HALL_W / 2, HALL_W / 2].map((z) => (
        <mesh key={z} position={[HALL_LEN / 2, 11, z]}>
          <boxGeometry args={[HALL_LEN, 22, 0.6]} />
          <meshStandardMaterial color="#c2a377" roughness={0.9} side={THREE.BackSide} />
        </mesh>
      ))}
      {/* stage-end wall with arches */}
      <mesh position={[-0.3, 11, 0]}>
        <boxGeometry args={[0.6, 22, HALL_W]} />
        <meshStandardMaterial color="#cdae82" roughness={0.9} />
      </mesh>
      {[-6, -2, 2, 6].map((z) => (
        <mesh key={z} position={[0.1, 4.5, z]}>
          <boxGeometry args={[0.3, 5, 2.4]} />
          <meshStandardMaterial color="#2a1a10" roughness={1} />
        </mesh>
      ))}
      {/* truss roof */}
      <mesh position={[HALL_LEN / 2, 26.5, 0]}>
        <boxGeometry args={[HALL_LEN, 0.6, HALL_W]} />
        <meshStandardMaterial color="#1c130c" roughness={1} side={THREE.BackSide} />
      </mesh>

      <Columns />
      <Orchestra />
      <Seats />
      <MovableCeiling height={height} />
      <Rays height={height} listener={listener} />

      {/* source marker */}
      <mesh position={SOURCE.toArray()}>
        <sphereGeometry args={[0.4, 24, 24]} />
        <meshStandardMaterial
          color="#fff3d6"
          emissive="#ffd27a"
          emissiveIntensity={1.4}
        />
      </mesh>
      <Html position={[SOURCE.x, SOURCE.y + 1.4, 0]} center distanceFactor={26}>
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-brass-bright">
          Fonte
        </span>
      </Html>

      {/* listener marker */}
      <group position={listener.toArray()}>
        <mesh>
          <sphereGeometry args={[0.45, 20, 20]} />
          <meshStandardMaterial
            color="#6e1423"
            emissive="#e6c65c"
            emissiveIntensity={0.35}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
          <ringGeometry args={[0.8, 1, 32]} />
          <meshBasicMaterial color="#e6c65c" transparent opacity={0.6} />
        </mesh>
        <Html position={[0, 1.5, 0]} center distanceFactor={26}>
          <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-parchment">
            Ouvinte
          </span>
        </Html>
      </group>

      <OrbitControls
        target={[16, 6, 0]}
        enablePan
        minDistance={12}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.05}
        makeDefault
      />
    </>
  );
}

export default function Hall3D(props: {
  height: number;
  listenerX: number;
  listenerZ: number;
  onMove: (x: number, z: number) => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [46, 16, 20], fov: 48 }}
      className="h-full w-full"
    >
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas>
  );
}
