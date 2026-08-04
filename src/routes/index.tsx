import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import salaLogo from "@/assets/sala-logo.png";
import salaHall from "@/assets/sala-hall.webp.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sala São Paulo · Trabalho de Matemática · Simulador 3D" },
      {
        name: "description",
        content:
          "Simulador 3D interativo do forro móvel da Sala São Paulo. Ajuste altura do teto, potência da fonte e posição do ouvinte, e escute em tempo real como reflexão, volume e reverberação moldam o som.",
      },
      { property: "og:title", content: "Sala São Paulo · Trabalho de Matemática" },
      {
        property: "og:description",
        content:
          "Simulador acústico 3D interativo do forro móvel da Sala São Paulo.",
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
  const A = 900 + 20 * h; // absorção equivalente aproximada
  return (0.161 * V) / A;
};

function Index() {
  const [height, setHeight] = useState(15);
  const [volume, setVolume] = useState(95);
  const [lx, setLx] = useState(24);
  const [lz, setLz] = useState(0);
  const [toneOn, setToneOn] = useState(false);
  const [mounted, setMounted] = useState(false);

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
          a potência da fonte sonora, clique na plateia para mover o ouvinte,
          observe e escute como a geometria da sala molda cada nota.
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

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* 3D hall panel */}
        <Panel className="p-5 md:p-6">
          <PanelHeader title="Sala em três dimensões" meta="Arraste para girar" />
          <div className="mt-3 h-[420px] w-full overflow-hidden rounded-sm border border-walnut-dark/70 bg-void-2 md:h-[520px]">
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
          <p className="mt-3 text-[11.5px] text-parchment-dim">
            Clique no piso da plateia para reposicionar o{" "}
            <b className="text-brass-bright">OUVINTE</b>. Use o mouse para
            girar, a roda para aproximar.
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
            label="Ouvinte · deslocamento lateral"
            value={`${lz.toFixed(1)} m`}
            min={-9}
            max={9}
            step={0.5}
            v={lz}
            onChange={(n) => moveListener(lx, n)}
          />

          <div className="grid grid-cols-2 gap-2.5">
            <Readout
              k="Volume de ar da sala"
              v={Math.round(V).toLocaleString("pt-BR")}
              unit="m³"
            />
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
