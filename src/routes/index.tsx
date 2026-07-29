import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import salaLogo from "@/assets/sala-logo.png";
import salaHall from "@/assets/sala-hall.webp.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sala São Paulo — Trabalho de Matemática · Simulador Acústico" },
      {
        name: "description",
        content:
          "Simulador interativo do forro móvel da Sala São Paulo. Ajuste altura do teto, potência da fonte e posição do ouvinte, e escute em tempo real como reflexão, volume e reverberação moldam o som.",
      },
      { property: "og:title", content: "Sala São Paulo — Trabalho de Matemática" },
      {
        property: "og:description",
        content:
          "Simulador acústico interativo do forro móvel da Sala São Paulo.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

// ---------- Geometry constants ----------
const SOURCE = { x: 150, y: 318 };
const FLOOR_X_MIN = 190;
const FLOOR_X_MAX = 730;
const CEIL_Y_MIN = 55;
const CEIL_Y_MAX = 190;
const N_PANELS = 8;
const START_X = 70;
const END_X = 730;

const floorYAt = (x: number) => {
  const t = (x - 60) / (740 - 60);
  return 400 + t * 20;
};
const heightToY = (h: number) => {
  const t = (h - 6) / (25 - 6);
  return CEIL_Y_MAX - t * (CEIL_Y_MAX - CEIL_Y_MIN);
};
const roomVolume = (h: number) => {
  const t = (h - 6) / (25 - 6);
  return 12000 + t * (28000 - 12000);
};
const rt60 = (h: number) => {
  const t = (h - 6) / (25 - 6);
  return 1.2 + t * (2.3 - 1.2);
};
const PX_TO_M = 40 / 680;

function Index() {
  const [height, setHeight] = useState(15);
  const [volume, setVolume] = useState(95);
  const [listenerX, setListenerX] = useState(520);
  const [dragging, setDragging] = useState(false);
  const [toneOn, setToneOn] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const oscGainRef = useRef<GainNode | null>(null);

  const ceilY = heightToY(height);
  const clampedLx = Math.max(FLOOR_X_MIN, Math.min(FLOOR_X_MAX, listenerX));
  const listenerY = floorYAt(clampedLx);

  const dxPx = clampedLx - SOURCE.x;
  const dyPx = listenerY - SOURCE.y;
  const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
  const distM = Math.max(1, distPx * PX_TO_M);
  const spl = volume - 20 * Math.log10(distM);
  const V = roomVolume(height);
  const rt = rt60(height);

  // Ceiling panels & suspension cables
  const panels = useMemo(() => {
    const panelW = (END_X - START_X) / N_PANELS;
    return Array.from({ length: N_PANELS }, (_, i) => {
      const px = START_X + i * panelW;
      return { x: px + 2, w: panelW - 4, cableX: px + panelW / 2 };
    });
  }, []);

  // Reflection rays: source -> ceiling midpoint of each panel -> listener
  const rays = useMemo(() => {
    const panelW = (END_X - START_X) / N_PANELS;
    return panels.map((_, i) => {
      const midX = START_X + i * panelW + panelW / 2;
      const midY = ceilY + 7;
      return { midX, midY };
    });
  }, [panels, ceilY]);

  // Drag listener handling
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      const t = "touches" in e ? e.touches[0] : (e as MouseEvent);
      pt.x = t.clientX;
      pt.y = t.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const p = pt.matrixTransform(ctm.inverse());
      setListenerX(p.x);
    };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [dragging]);

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

  const gainFromSPL = (s: number) =>
    Math.max(0.02, Math.min(0.25, (s - 40) / 260));

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

    // Synthetic impulse response proportional to RT60
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

  // Update tone gain live as SPL changes
  useEffect(() => {
    if (toneOn && oscGainRef.current && audioCtxRef.current) {
      oscGainRef.current.gain.setTargetAtTime(
        gainFromSPL(spl),
        audioCtxRef.current.currentTime,
        0.05,
      );
    }
  }, [spl, toneOn]);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-10 md:py-14">
      {/* ---------- Header ---------- */}
      <header className="relative text-center">
        <div className="flex items-center justify-center gap-4">
          <img
            src={salaLogo}
            alt="Sala São Paulo"
            className="h-14 w-14 rounded-sm bg-parchment p-1.5 md:h-16 md:w-16"
          />
          <div className="text-left">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-brass">
              Programa · Física &amp; Acústica
            </div>
            <div className="font-display text-lg italic text-parchment-dim">
              Sala São Paulo
            </div>
          </div>
        </div>

        <h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-parchment md:text-6xl">
          Trabalho de <em className="italic text-brass-bright">Matemática</em>
          <span className="mt-2 block font-display text-lg font-normal not-italic tracking-[0.18em] text-parchment-dim md:text-xl">
            UM ESTUDO SOBRE REFLEXÃO, VOLUME E PROPAGAÇÃO
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-parchment-dim">
          Simulador do forro móvel da Sala São Paulo. Ajuste a altura do teto e
          a potência da fonte sonora, arraste o ouvinte pela plateia, e observe
          — e escute — como a geometria da sala molda cada nota.
        </p>

        <BrassRule className="mt-8" />
      </header>

      {/* ---------- Hero hall photograph ---------- */}
      <figure className="relative mt-10 overflow-hidden rounded-sm border border-walnut-dark shadow-[var(--shadow-panel)]">
        <img
          src={salaHall.url}
          alt="Interior da Sala São Paulo iluminada em tons âmbar"
          className="h-64 w-full object-cover md:h-[380px]"
          loading="lazy"
        />
      </figure>

      {/* ---------- Movement I: the score ---------- */}
      <SectionLabel roman="I" title="Corte transversal &amp; console" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* Diagram panel */}
        <Panel className="p-5 md:p-6">
          <PanelHeader title="Corte transversal da sala" />
          <svg
            ref={svgRef}
            viewBox="0 0 800 460"
            xmlns="http://www.w3.org/2000/svg"
            className="mt-3 block h-auto w-full select-none"
          >
            <defs>
              <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6a4327" />
                <stop offset="100%" stopColor="#2c1c10" />
              </linearGradient>
              <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a1c12" />
                <stop offset="100%" stopColor="#1a1109" />
              </linearGradient>
              <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff3d6" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fff3d6" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6b4327" />
                <stop offset="100%" stopColor="#3f2716" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="800" height="460" fill="url(#wallGrad)" />
            <rect
              x="30"
              y="40"
              width="740"
              height="380"
              fill="none"
              stroke="#5a3a20"
              strokeWidth="1"
            />
            {/* Decorative arches — orchestra hall feel */}
            {[100, 220, 340, 460, 580, 700].map((cx) => (
              <path
                key={cx}
                d={`M ${cx - 26} 220 L ${cx - 26} 130 A 26 26 0 0 1 ${cx + 26} 130 L ${cx + 26} 220`}
                fill="none"
                stroke="#4a3222"
                strokeWidth="1"
                opacity="0.7"
              />
            ))}

            {/* Floor / stage */}
            <polygon
              points="60,420 740,420 740,400 400,340 60,400"
              fill="url(#floorGrad)"
              stroke="#5a3a20"
            />
            <rect
              x="60"
              y="330"
              width="180"
              height="20"
              fill="#5a3a20"
              stroke="#7a4b2a"
            />
            <text
              x="150"
              y="325"
              textAnchor="middle"
              fontFamily="JetBrains Mono"
              fontSize="10"
              letterSpacing="2"
              fill="#c9bda3"
            >
              PALCO
            </text>

            {/* Cables */}
            {panels.map((p, i) => (
              <line
                key={`cable-${i}`}
                x1={p.cableX}
                y1={40}
                x2={p.cableX}
                y2={ceilY}
                stroke="#7a5a3a"
                strokeWidth="1"
                opacity="0.55"
              />
            ))}

            {/* Reflection rays */}
            {rays.map((r, i) => (
              <g key={`ray-${i}`} opacity="0.5">
                <line
                  x1={SOURCE.x}
                  y1={SOURCE.y}
                  x2={r.midX}
                  y2={r.midY}
                  stroke="#e6c65c"
                  strokeWidth="0.8"
                />
                <line
                  x1={r.midX}
                  y1={r.midY}
                  x2={clampedLx}
                  y2={listenerY}
                  stroke="#e6c65c"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                />
              </g>
            ))}

            {/* Ceiling panels */}
            {panels.map((p, i) => (
              <rect
                key={`panel-${i}`}
                x={p.x}
                y={ceilY}
                width={p.w}
                height={14}
                fill="url(#panelGrad)"
                stroke="#8b5a33"
                rx={2}
              />
            ))}

            {/* Source glow */}
            <circle cx={SOURCE.x} cy={SOURCE.y} r={34} fill="url(#glow)" />
            <circle
              cx={SOURCE.x}
              cy={SOURCE.y}
              r={7}
              fill="#fff3d6"
              stroke="#c9a227"
              strokeWidth="1.5"
            />
            <text
              x={SOURCE.x}
              y={SOURCE.y - 15}
              textAnchor="middle"
              fontFamily="JetBrains Mono"
              fontSize="9.5"
              letterSpacing="2"
              fill="#e6c65c"
            >
              FONTE
            </text>

            {/* Listener */}
            <g
              transform={`translate(${clampedLx},${listenerY})`}
              onMouseDown={() => setDragging(true)}
              onTouchStart={() => setDragging(true)}
              style={{ cursor: dragging ? "grabbing" : "grab" }}
            >
              <circle
                r={12}
                fill="none"
                stroke="#e6c65c"
                strokeWidth="1"
                opacity="0.4"
              />
              <circle
                r={9}
                fill="#6e1423"
                stroke="#e6c65c"
                strokeWidth="1.5"
              />
              <text
                y={-15}
                textAnchor="middle"
                fontFamily="JetBrains Mono"
                fontSize="9.5"
                letterSpacing="2"
                fill="#ede3d0"
              >
                OUVINTE
              </text>
            </g>

            {/* Height indicator */}
            <line
              x1={770}
              y1={420}
              x2={770}
              y2={ceilY}
              stroke="#c9a227"
              strokeWidth="1"
              strokeDasharray="2,3"
              opacity="0.7"
            />
            <text
              x={762}
              y={ceilY - 4}
              textAnchor="end"
              fontFamily="JetBrains Mono"
              fontSize="10"
              fill="#e6c65c"
            >
              {height.toFixed(1)} m
            </text>
          </svg>
          <p className="mt-3 text-[11.5px] text-parchment-dim">
            Arraste o marcador{" "}
            <b className="text-brass-bright">OUVINTE</b> pela plateia para
            reposicioná-lo.
          </p>
        </Panel>

        {/* Console panel */}
        <Panel className="flex flex-col gap-5 p-6">
          <div>
            <PanelHeader title="Console de controle" />
            <p className="mt-1 text-xs text-parchment-dim">
              Cada ajuste reescreve a geometria da sala em tempo real.
            </p>
          </div>

          <SliderRow
            label="Altura do teto móvel"
            value={`${height.toFixed(1)} m`}
            min={6}
            max={25}
            step={0.5}
            v={height}
            onChange={setHeight}
          />
          <SliderRow
            label="Potência da fonte (nível a 1 m)"
            value={`${volume} dB`}
            min={70}
            max={105}
            step={1}
            v={volume}
            onChange={setVolume}
          />

          <div className="grid grid-cols-2 gap-2.5">
            <Readout k="Volume de ar da sala" v={Math.round(V).toLocaleString("pt-BR")} unit="m³" />
            <Readout k="Distância fonte ouvinte" v={distM.toFixed(1)} unit="m" />
            <Readout k="Nível sonoro no ouvinte" v={spl.toFixed(1)} unit="dB" />
            <Readout k="Reverberação (RT60)" v={rt.toFixed(2)} unit="s" />
          </div>

          <div className="mt-1 flex flex-col gap-2.5">
            <button
              onClick={() => void playClap()}
              className="group relative overflow-hidden rounded-sm border border-[oklch(0.5_0.11_20)] bg-[var(--gradient-velvet)] px-4 py-3 text-sm font-semibold tracking-wide text-parchment shadow-[var(--shadow-velvet)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_oklch(0.28_0.09_20/0.6)] active:translate-y-0"
            >
              <span className="mr-2 text-brass-bright">▶</span>
              Tocar palma com reverberação da sala
            </button>
            <button
              onClick={toggleTone}
              className="rounded-sm border border-walnut bg-[linear-gradient(180deg,var(--walnut),var(--walnut-dark))] px-4 py-3 text-sm font-semibold tracking-wide text-parchment transition hover:-translate-y-0.5"
            >
              <span className="mr-2 text-brass-bright">{toneOn ? "■" : "▶"}</span>
              {toneOn ? "Parar tom contínuo" : "Tocar tom contínuo (Ré³)"}
            </button>
          </div>
        </Panel>
      </div>

      <footer className="mt-16 border-t border-walnut-dark/60 pt-6 text-center font-mono text-[10.5px] uppercase tracking-[0.22em] text-parchment-dim">
        Simulação educacional · Modelo geométrico simplificado
      </footer>
    </main>
  );
}

// ---------- Small design-system components ----------

function BrassRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <span className="h-px w-24 bg-[var(--gradient-brass-rule)]" />
      <span className="text-brass" aria-hidden>◆</span>
      <span className="h-px w-24 bg-[var(--gradient-brass-rule)]" />
    </div>
  );
}

function SectionLabel({ roman, title }: { roman: string; title: string }) {
  return (
    <div className="mt-16 flex items-baseline gap-4 border-b border-walnut-dark/70 pb-3">
      <span className="font-display text-3xl italic text-brass">{roman}.</span>
      <span
        className="font-mono text-[11px] uppercase tracking-[0.28em] text-parchment-dim"
        dangerouslySetInnerHTML={{ __html: title }}
      />
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-sm border border-walnut-dark bg-[var(--gradient-panel)] shadow-[var(--shadow-panel)] ${className}`}
    >
      {children}
    </section>
  );
}

function PanelHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-walnut-dark/60 pb-2">
      <h2 className="font-display text-xl font-semibold italic text-brass-bright md:text-2xl">
        {title}
      </h2>
      {meta && (
        <span className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-parchment-dim">
          {meta}
        </span>
      )}
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
      <label className="mb-2 flex items-baseline justify-between font-mono text-[11.5px] uppercase tracking-[0.1em] text-parchment">
        <span>{label}</span>
        <b className="font-mono text-[13px] font-bold not-italic text-brass-bright">
          {value}
        </b>
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

function Readout({ k, v, unit }: { k: string; v: string; unit: string }) {
  return (
    <div className="rounded-sm border border-walnut-dark/80 bg-void-2 px-3 py-2.5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-parchment-dim">
        {k}
      </div>
      <div className="mt-1 font-mono text-lg font-medium text-brass-bright">
        {v} <span className="text-[11px] font-normal text-parchment-dim">{unit}</span>
      </div>
    </div>
  );
}

function NoteCard({ heading, body }: { heading: string; body: string }) {
  return (
    <Panel className="p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-brass" aria-hidden>♪</span>
        <h3 className="font-display text-xl italic text-brass-bright">
          {heading}
        </h3>
      </div>
      <p className="text-sm leading-relaxed text-parchment-dim">{body}</p>
    </Panel>
  );
}
