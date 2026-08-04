import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Square,
  SlidersHorizontal,
  X,
} from "lucide-react";
import salaLogo from "@/assets/sala-logo.png";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sala São Paulo · Simulador Acústico 3D" },
      {
        name: "description",
        content:
          "Simulador 3D interativo do forro móvel da Sala São Paulo. Ajuste altura do teto, potência da fonte e posição do ouvinte, e escute em tempo real como reflexão, volume e reverberação moldam o som.",
      },
      { property: "og:title", content: "Sala São Paulo · Simulador Acústico 3D" },
      {
        property: "og:description",
        content: "Simulador acústico 3D interativo do forro móvel da Sala São Paulo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

const Hall3D = lazy(() => import("@/components/Hall3D"));

// ---------- Acoustic model (meters) ----------
const HALL_LEN = 40;
const HALL_W = 22;
const SOURCE_3D = { x: 2.5, y: 2.2, z: 0 };

const roomVolume = (h: number) => HALL_LEN * HALL_W * h;
const rt60 = (h: number) => {
  const V = roomVolume(h);
  const A = 900 + 20 * h;
  return (0.161 * V) / A;
};

function Index() {
  const [height, setHeight] = useState(15);
  const [volume, setVolume] = useState(95);
  const [lx, setLx] = useState(24);
  const [lz, setLz] = useState(0);
  const [toneOn, setToneOn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => setMounted(true), []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const oscGainRef = useRef<GainNode | null>(null);

  const ly = 1.6 + (lx - 9) * 0.09;
  const dx = lx - SOURCE_3D.x;
  const dy = ly - SOURCE_3D.y;
  const dz = lz - SOURCE_3D.z;
  const distM = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const spl = volume - 20 * Math.log10(distM);
  const V = roomVolume(height);
  const rt = rt60(height);

  const moveListener = (x: number, z: number) => {
    setLx(Math.max(9, Math.min(HALL_LEN - 2, x)));
    setLz(Math.max(-HALL_W / 2 + 2, Math.min(HALL_W / 2 - 2, z)));
  };

  // ---------- Audio engine ----------
  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new Ctor();
    }
    if (audioCtxRef.current.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const gainFromSPL = (s: number) => Math.max(0.02, Math.min(0.25, (s - 40) / 260));

  const loadBuffer = async () => {
    if (bufferRef.current) return bufferRef.current;
    const ctx = ensureAudio();
    const res = await fetch("/singleclap.mp3");
    const arr = await res.arrayBuffer();
    bufferRef.current = await ctx.decodeAudioData(arr);
    return bufferRef.current;
  };

  const playClap = async () => {
    const ctx = ensureAudio();
    const buffer = await loadBuffer();
    if (!buffer) return;

    const master = ctx.createGain();
    master.gain.value = gainFromSPL(spl);
    master.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const rate = ctx.sampleRate;
    const length = Math.floor(rate * rt);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (rate * (rt / 6.91)));
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;

    source.connect(master);
    source.connect(convolver);
    convolver.connect(master);
    source.start(ctx.currentTime);
  };

  const toggleTone = () => {
    const ctx = ensureAudio();
    if (!toneOn) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 293.7;
      g.gain.value = gainFromSPL(spl);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      oscRef.current = osc;
      oscGainRef.current = g;
      setToneOn(true);
    } else {
      oscRef.current?.stop();
      oscRef.current = null;
      oscGainRef.current = null;
      setToneOn(false);
    }
  };

  useEffect(() => {
    if (toneOn && oscGainRef.current && audioCtxRef.current) {
      oscGainRef.current.gain.setTargetAtTime(
        gainFromSPL(spl),
        audioCtxRef.current.currentTime,
        0.05,
      );
    }
  }, [spl, toneOn]);

  const controlsContent = (
    <>
      <div className="space-y-4">
        <SliderRow
          label="Altura do teto"
          value={`${height.toFixed(1)} m`}
          min={6}
          max={25}
          step={0.5}
          v={height}
          onChange={setHeight}
        />
        <SliderRow
          label="Potência da fonte"
          value={`${volume} dB`}
          min={70}
          max={105}
          step={1}
          v={volume}
          onChange={setVolume}
        />
        <SliderRow
          label="Ouvinte · distância do palco"
          value={`${lx.toFixed(1)} m`}
          min={9}
          max={38}
          step={0.5}
          v={lx}
          onChange={(n) => moveListener(n, lz)}
        />
        <SliderRow
          label="Ouvinte · lateral"
          value={`${lz.toFixed(1)} m`}
          min={-9}
          max={9}
          step={0.5}
          v={lz}
          onChange={(n) => moveListener(lx, n)}
        />
      </div>

      <div className="mt-5 space-y-2.5">
        <button
          onClick={() => void playClap()}
          className="group flex w-full items-center gap-2.5 rounded-sm border border-[oklch(0.5_0.11_20)] bg-[var(--gradient-velvet)] px-4 py-3 text-sm font-semibold tracking-wide text-parchment shadow-[var(--shadow-velvet)] transition hover:-translate-y-0.5 active:translate-y-0"
        >
          <Play className="h-4 w-4 text-brass-bright" />
          Tocar palma com reverberação
        </button>
        <button
          onClick={toggleTone}
          className="flex w-full items-center gap-2.5 rounded-sm border border-walnut bg-[linear-gradient(180deg,var(--walnut),var(--walnut-dark))] px-4 py-3 text-sm font-semibold tracking-wide text-parchment transition hover:-translate-y-0.5"
        >
          {toneOn ? (
            <Square className="h-4 w-4 text-brass-bright" />
          ) : (
            <Play className="h-4 w-4 text-brass-bright" />
          )}
          {toneOn ? "Parar tom contínuo" : "Tocar tom contínuo (Ré³)"}
        </button>
      </div>
    </>
  );

  return (
    <div className="relative h-[100svh] w-full overflow-hidden bg-void">
      {/* ---------- Fullscreen 3D ---------- */}
      <div className="absolute inset-0">
        {mounted ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.2em] text-parchment-dim">
                Montando a sala…
              </div>
            }
          >
            <Hall3D
              height={height}
              listenerX={lx}
              listenerZ={lz}
              onMove={moveListener}
            />
          </Suspense>
        ) : null}
      </div>

      {/* ---------- Vignette ---------- */}
      <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_180px_rgba(0,0,0,0.5)]" />

      {/* ---------- Top HUD ---------- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/20 to-transparent px-4 py-3 md:px-6 md:py-4">
        <div className="flex items-center gap-3">
          <img
            src={salaLogo}
            alt="Sala São Paulo"
            className="h-9 w-9 rounded-sm bg-parchment p-1 md:h-11 md:w-11"
          />
          <div>
            <div className="font-display text-base italic text-brass-bright md:text-lg">
              Sala São Paulo
            </div>
            <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-parchment-dim md:text-[9px]">
              Simulador Acústico · Forro Móvel
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-parchment-dim md:flex">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brass-bright" />
          tempo real
        </div>
      </header>

      {/* ---------- Bottom metric chips ---------- */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-wrap gap-2 md:bottom-5 md:left-5">
        <HudChip label="Vol. ar" value={Math.round(V).toLocaleString("pt-BR")} unit="m³" />
        <HudChip label="Distância" value={distM.toFixed(1)} unit="m" />
        <HudChip label="Nível" value={spl.toFixed(1)} unit="dB" />
        <HudChip label="RT60" value={rt.toFixed(2)} unit="s" />
      </div>

      {/* ---------- Instruction hint (desktop) ---------- */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-20 hidden font-mono text-[10px] uppercase tracking-wider text-parchment-dim/60 lg:block">
        clique no piso para mover · arraste para girar · scroll para zoom
      </div>

      {/* ---------- Console ---------- */}
      {isMobile ? (
        <>
          {!consoleOpen && (
            <button
              onClick={() => setConsoleOpen(true)}
              className="absolute bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-brass/40 bg-void-2/90 text-brass-bright shadow-lg backdrop-blur-md transition hover:scale-105"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          )}
          {consoleOpen && (
            <div className="absolute inset-x-0 bottom-0 z-30 max-h-[62vh] overflow-y-auto rounded-t-2xl border-t border-brass/25 bg-void-2/95 p-5 shadow-2xl backdrop-blur-lg">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg italic text-brass-bright">Console</h2>
                <button
                  onClick={() => setConsoleOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-sm border border-walnut-dark text-parchment-dim transition hover:text-parchment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {controlsContent}
            </div>
          )}
        </>
      ) : (
        <>
          <aside
            className={`absolute right-0 top-0 z-30 h-full w-[340px] border-l border-brass/20 bg-void-2/85 backdrop-blur-md transition-transform duration-300 ${
              consoleOpen ? "translate-x-0" : "translate-x-[340px]"
            }`}
          >
            <div className="flex h-full flex-col overflow-y-auto p-5">
              <div className="mb-5 border-b border-walnut-dark/50 pb-3">
                <h2 className="font-display text-xl italic text-brass-bright">Console</h2>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-parchment-dim">
                  controles em tempo real
                </p>
              </div>
              {controlsContent}
              <div className="mt-auto pt-5">
                <p className="font-mono text-[9px] uppercase tracking-wider text-parchment-dim/60">
                  Clique no piso da plateia para reposicionar o ouvinte
                </p>
              </div>
            </div>
          </aside>
          {/* Toggle tab */}
          <button
            onClick={() => setConsoleOpen(!consoleOpen)}
            className="absolute top-1/2 z-40 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-sm border-y border-l border-brass/30 bg-void-2/85 text-brass-bright backdrop-blur-md transition hover:bg-void-2"
            style={{ right: consoleOpen ? "340px" : "0px" }}
          >
            {consoleOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ---------- HUD components ----------

function HudChip({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-sm border border-walnut-dark/70 bg-void/80 px-3 py-2 backdrop-blur-sm">
      <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-parchment-dim">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-bold text-brass-bright">
        {value}
        <span className="ml-1 text-[10px] font-normal text-parchment-dim">{unit}</span>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  v,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: string;
  v: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="mb-2 flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.1em] text-parchment">
        <span>{label}</span>
        <b className="font-mono text-[12px] font-bold text-brass-bright">{value}</b>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider-orchestra"
      />
    </div>
  );
}
