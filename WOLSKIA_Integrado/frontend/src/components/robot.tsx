import { useEffect, useRef } from "react";

export type RobotMood = "idle" | "listen" | "think" | "speak" | "ok" | "alert";

const COPY: Record<RobotMood, string> = {
  idle: "En espera",
  listen: "Escuchando",
  think: "Analizando",
  speak: "Respondiendo",
  ok: "Listo",
  alert: "Requiere revision",
};

// Cinco poses con fondo transparente (WebP), repartidas entre los seis estados.
const POSE_OF: Record<RobotMood, string> = {
  idle: "idle", // en espera: sonriente, de frente
  listen: "listen", // mano en la cabeza: atento
  think: "think", // pensativo con burbuja "?"
  speak: "speak", // saludando: respondiendo
  ok: "ok", // brazos arriba con destellos: trabajo listo
  alert: "think", // burbuja "?": hay que revisar algo
};
const POSES = ["idle", "listen", "think", "speak", "ok"] as const;
const poseSrc = (pose: string, small = false) => `/robot/wolskia-${pose}${small ? "-384" : ""}.webp`;

// Texto alternativo descriptivo, segun el estado.
const ALT: Record<RobotMood, string> = {
  idle: "Wolskia, el robot asistente, sonriendo y en espera",
  listen: "Wolskia, el robot asistente, con una mano en la cabeza, escuchando",
  think: "Wolskia, el robot asistente, pensativo con una burbuja de pregunta, analizando",
  speak: "Wolskia, el robot asistente, saludando mientras responde",
  ok: "Wolskia, el robot asistente, con los brazos en alto: trabajo listo",
  alert: "Wolskia, el robot asistente, con una burbuja de pregunta: requiere revisión",
};

const DOT: Record<RobotMood, string> = {
  idle: "bg-accent",
  listen: "bg-accent-2",
  think: "bg-accent-2 animate-pulse",
  speak: "bg-accent-2",
  ok: "bg-ok",
  alert: "bg-warn",
};

// "lg" se achica solo en pantallas bajas, para que el chat entre sin scroll.
const DIM = {
  lg: "h-44 w-44 [@media(min-height:780px)]:h-64 [@media(min-height:780px)]:w-64",
  md: "h-44 w-44",
  sm: "h-36 w-36",
  fit: "wol-robot-fit",
} as const;
// Ancho aproximado en pantalla, para que el navegador elija la imagen justa (384w o 768w).
const SIZES = {
  lg: "(min-height: 780px) 256px, 176px",
  md: "176px",
  sm: "144px",
  fit: "144px",
} as const;

/** Avatar chico (cabeza del robot) para encabezado y mensajes del chat. */
export function RobotAvatar({ px = 24, className = "" }: { px?: number; className?: string }) {
  return (
    <img
      src="/robot/wolskia-avatar.webp"
      srcSet="/robot/wolskia-avatar-96.webp 96w, /robot/wolskia-avatar.webp 192w"
      sizes={`${px}px`}
      width={px}
      height={px}
      alt="Wolskia, el robot asistente"
      loading="lazy"
      decoding="async"
      className={`shrink-0 rounded-full bg-[#0d1c2c] object-cover ring-1 ring-accent-2/40 ${className}`}
      style={{ width: px, height: px }}
    />
  );
}

/** Indicador de "pensando…": el robot en su pose pensativa mientras la IA responde. */
export function RobotThinking({ label = "Pensando…" }: { label?: string }) {
  return (
    <div
      className="flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-line bg-bg/80 py-1.5 pl-2 pr-4"
      role="status"
      aria-live="polite"
    >
      <img
        src={poseSrc("think", true)}
        width={384}
        height={384}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="wol-wobble h-11 w-11 shrink-0 object-contain"
      />
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent-2" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    </div>
  );
}

export function Robot({
  mood,
  size = "lg",
}: {
  mood: RobotMood;
  size?: keyof typeof DIM;
}) {
  const warn = mood === "alert";
  const lensRef = useRef<HTMLDivElement>(null);

  // Precarga las demas poses (sin bloquear la carga inicial) para que el cambio de estado no parpadee.
  useEffect(() => {
    const load = () => {
      for (const pose of POSES) {
        const im = new Image();
        im.sizes = SIZES[size];
        im.srcset = `${poseSrc(pose, true)} 384w, ${poseSrc(pose)} 768w`;
        im.src = poseSrc(pose, true);
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(load);
    else window.setTimeout(load, 600);
  }, [size]);

  // El robot mira hacia donde esta el cursor: la imagen se desliza unos px
  // dentro de su lente (el aro y el cuadro no se mueven).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = lensRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
        el.style.setProperty("--look-x", `${(nx * 8).toFixed(1)}px`);
        el.style.setProperty("--look-y", `${(ny * 6).toFixed(1)}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  const ringColor = warn
    ? "rgba(224,161,74,0.95)"
    : mood === "ok"
      ? "rgba(61,214,164,0.95)"
      : "rgba(106,212,255,0.95)";
  const pose = POSE_OF[mood];
  const eager = size !== "md"; // el robot grande es lo primero que se ve; el lateral del chat es lazy
  return (
    <figure className="m-0 flex flex-col items-center gap-3">
      <div className={`relative ${DIM[size]}`}>
        {/* Brillo de fondo acorde a la paleta */}
        <div
          className="absolute inset-6 rounded-full blur-2xl"
          style={{
            background: warn ? "rgba(224,161,74,0.35)" : "rgba(47,141,255,0.35)",
            animation: "wol-pulse 2.4s ease-in-out infinite",
          }}
        />
        {/* Disco oscuro detras: el robot (ya sin fondo) sobresale de el */}
        <div
          className="absolute inset-3 rounded-full"
          style={{ background: "radial-gradient(circle at 50% 38%, rgba(13,40,72,0.95), rgba(5,11,19,0.9) 72%)" }}
        />
        {/* Anillo: fijo y suave en reposo, giratorio mientras analiza */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              mood === "think"
                ? `conic-gradient(from 0deg, transparent 0%, ${ringColor} 40%, transparent 70%)`
                : `linear-gradient(135deg, ${ringColor.replace("0.95", "0.55")}, rgba(47,141,255,0.12))`,
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            animation: mood === "think" ? "wol-spin 1.1s linear infinite" : "none",
          }}
        />
        <div ref={lensRef} className={`absolute inset-0 wol-glow ${mood === "think" ? "" : "wol-float"}`}>
          <img
            key={mood}
            src={poseSrc(pose)}
            srcSet={`${poseSrc(pose, true)} 384w, ${poseSrc(pose)} 768w`}
            sizes={SIZES[size]}
            width={768}
            height={768}
            alt={ALT[mood]}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            decoding="async"
            draggable={false}
            className="wol-swap h-full w-full select-none object-contain"
            style={{
              transform: "translate3d(var(--look-x, 0px), var(--look-y, 0px), 0)",
              transition: "transform 140ms ease-out",
              // el corte inferior del robot se desvanece en vez de verse cortado en seco
              WebkitMaskImage: "linear-gradient(to bottom, #000 86%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, #000 86%, transparent 100%)",
            }}
          />
        </div>
      </div>
      <figcaption className="flex flex-col items-center gap-1.5 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-bg/70 px-3 py-1 text-xs text-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[mood]}`} />
          {COPY[mood]}
        </div>
      </figcaption>
    </figure>
  );
}
