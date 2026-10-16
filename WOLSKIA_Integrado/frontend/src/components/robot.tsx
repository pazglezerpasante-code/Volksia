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

// Tres poses de la mascota, repartidas entre los seis estados.
const POSE = {
  idle: "/robot/wolskia-idle.jpg", // sonriente, logo W
  listen: "/robot/wolskia-listen.jpg", // ícono de sonido en el pecho
  think: "/robot/wolskia-think.jpg", // ojos punteados, mano en el mentón
} as const;

const SRC: Record<RobotMood, string> = {
  idle: POSE.idle,
  listen: POSE.listen,
  think: POSE.think,
  speak: POSE.listen,
  ok: POSE.idle,
  alert: POSE.think,
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
} as const;

export function Robot({
  mood,
  size = "lg",
}: {
  mood: RobotMood;
  size?: keyof typeof DIM;
}) {
  const warn = mood === "alert";
  const lensRef = useRef<HTMLDivElement>(null);

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
  return (
    <figure className="m-0 flex flex-col items-center gap-3">
      <div className={`relative ${DIM[size]}`}>
        <div
          className="absolute inset-6 rounded-full blur-2xl"
          style={{
            background: warn ? "rgba(224,161,74,0.35)" : "rgba(47,141,255,0.35)",
            animation: "wol-pulse 2.4s ease-in-out infinite",
          }}
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
        <div
          ref={lensRef}
          className="absolute inset-2 overflow-hidden rounded-full shadow-[0_0_40px_rgba(47,141,255,0.25)]"
          style={{ animation: mood === "think" ? "none" : "wol-breathe 3.6s ease-in-out infinite" }}
        >
          <img
            key={mood}
            src={SRC[mood]}
            alt=""
            className="h-full w-full object-cover"
            style={{
              transform: "translate3d(var(--look-x, 0px), var(--look-y, 0px), 0) scale(1.2)",
              transition: "transform 140ms ease-out",
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
