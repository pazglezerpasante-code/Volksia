import { useCallback, useEffect, useRef, useState } from "react";
import type { RobotMood } from "@/components/robot";

/* ══ SURI con vida ═══════════════════════════════════════════
   El robot de las imágenes (public/robot/wolskia-*-ne*.webp: las mismas
   poses, pero con los ojos pintados borrados) + ojos animados propios
   encima. Así miran, parpadean y se cierran sin tocar el resto del dibujo
   (cara, logo VW, brazos). La boca NO se toca: sigue siendo la de la imagen.

   Estados del chat (mood):  idle · listen · think · speak · ok · alert
   Comportamiento propio (solo cuando el chat está en idle):
     · al abrir: saluda con la mano y dice "¡Hola!"
     · ojos: siguen el cursor (compu) o el último toque (celular)
     · parpadea sola
     · sin actividad: mira alrededor → se estira → bosteza → se duerme (zZz)
     · se despierta al tocar, escribir o mover algo
     · un toque la hace reaccionar (saluda, salta, dice algo)
     · opcional: se inclina con el giroscopio (iOS pide permiso tras un toque)
   Respeta prefers-reduced-motion y se pausa con la pestaña oculta.

   Los ojos se mueven escribiendo variables CSS directo en el DOM (no por
   estado de React), así mover el mouse nunca vuelve a renderizar nada.
   Todos los tiempos y textos editables están en TIEMPOS y FRASES. */

/** Segundos sin actividad para cada cosa (editables). */
const TIEMPOS = { mirar: 6, estirar: 14, bostezar: 24, dormir: 32 };

const FRASES = {
  saludo: "¡Hola!",
  toques: ["¡Hola de nuevo!", "¿Qué hacemos hoy?", "¡Acá estoy!", "Contame qué necesitás.", "¡Vamos con eso!", "Tu asistente de trabajo."],
  pensamientos: [
    "¿Qué estará haciendo Luis?",
    "¿Sos Tomás o alguien del equipo de Organización Sur?",
    "¿Sos Dylan o alguien del equipo de Organización Sur?",
    "¿Y si las planillas se completaran solas?",
    "Dylan y Tomás seguro están inventando algo…",
    "¿Habrá llegado la hora del mate?",
    "Una tarea menos, un ratito más para vos.",
    "Si cuento ovejas… ¿las guardo en una planilla?",
  ],
  estirar: "¡Aaah, qué rato!",
  bostezo: "Qué sueño…",
  despertar: ["¡Ah! Acá estoy.", "¡Buen día!", "¡Perdón, me dormí!"],
};

type Pose = "idle" | "listen" | "think" | "speak" | "ok";
const POSE_OF: Record<RobotMood, Pose> = { idle: "idle", listen: "listen", think: "think", speak: "speak", ok: "ok", alert: "think", reading: "think", processing: "think", searching: "listen", reconnecting: "listen", offline: "think", celebrate: "ok" };
const POSES: Pose[] = ["idle", "listen", "think", "speak", "ok"];

/* Posición de los ojos en cada pose (fracción del cuadro 768×768), medida
   con PIL sobre las imágenes. Color = el gris pintado original. */
type Eye = { x: number; y: number; c: string };
const EW = 0.05;
const EH = 0.075;
const EYES: Record<Pose, [Eye, Eye]> = {
  idle: [{ x: 0.3925, y: 0.4326, c: "111,130,155" }, { x: 0.6008, y: 0.4326, c: "111,130,155" }],
  listen: [{ x: 0.3731, y: 0.4231, c: "98,113,131" }, { x: 0.5797, y: 0.4418, c: "80,96,117" }],
  speak: [{ x: 0.3405, y: 0.4356, c: "112,124,144" }, { x: 0.545, y: 0.4188, c: "86,101,124" }],
  ok: [{ x: 0.3974, y: 0.4174, c: "93,108,127" }, { x: 0.6023, y: 0.4379, c: "76,92,112" }],
  think: [{ x: 0.3465, y: 0.4392, c: "92,106,128" }, { x: 0.5323, y: 0.3788, c: "74,90,113" }],
};

const ALT: Record<RobotMood, string> = {
  idle: "Suri, el robot asistente, sonriendo y en espera",
  listen: "Suri, el robot asistente, con una mano en la cabeza, escuchando",
  think: "Suri, el robot asistente, pensativo con una burbuja de pregunta, analizando",
  speak: "Suri, el robot asistente, saludando mientras responde",
  ok: "Suri, el robot asistente, con los brazos en alto: trabajo listo",
  alert: "Suri, el robot asistente, con una burbuja de pregunta: requiere revisión",
  reading: "Suri está leyendo un archivo",
  processing: "Suri está procesando datos",
  searching: "Suri está consultando una herramienta",
  reconnecting: "Suri está reconectando",
  offline: "Suri no tiene conexión",
  celebrate: "Suri celebra el trabajo completado",
};

const src = (p: Pose, small = false) => `/robot/wolskia-${p}-ne${small ? "-384" : ""}.webp`;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

type Act = "greet" | "wave" | "jump" | "stretch" | "yawn" | null;
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

export function SuriFace({ mood, size = 260, compact = false }: { mood: RobotMood; size?: number; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [sleeping, setSleeping] = useState(false);
  const [act, setAct] = useState<Act>("greet");
  const [say, setSay] = useState<string | null>(FRASES.saludo);
  // refs para que los timers vean siempre el valor actual sin re-suscribirse
  const live = useRef({ mood, sleeping: false, act: "greet" as Act, last: 0, nextBlink: 0, nextLook: 0, nextThought: 0, lastThought: -1, base: null as null | number });
  live.current.mood = mood;
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setLook = useCallback((x: number, y: number) => {
    const el = root.current;
    if (!el) return;
    el.style.setProperty("--lx", clamp(x, -1, 1).toFixed(3));
    el.style.setProperty("--ly", clamp(y, -1, 1).toFixed(3));
  }, []);

  const doSay = useCallback((text: string | null, ms = 2400) => {
    setSay(text);
    if (text) later(() => setSay((s) => (s === text ? null : s)), ms);
  }, []);

  const doAct = useCallback((a: Act, ms: number) => {
    live.current.act = a;
    setAct(a);
    later(() => {
      if (live.current.act === a) {
        live.current.act = null;
        setAct(null);
      }
    }, ms);
  }, []);

  const sleep = useCallback((on: boolean) => {
    live.current.sleeping = on;
    setSleeping(on);
    if (on) {
      setLook(0, 0.2);
      setSay(null);
    }
  }, [setLook]);

  const wake = useCallback(() => {
    const l = live.current;
    l.last = Date.now();
    if (l.sleeping) {
      sleep(false);
      if (!reduced()) doAct("jump", 700);
      doSay(pick(FRASES.despertar), 2200);
    } else if (l.act === "stretch" || l.act === "yawn") {
      l.act = null;
      setAct(null);
      setSay(null);
    }
  }, [doAct, doSay, sleep]);

  /* Saludo inicial */
  useEffect(() => {
    live.current.last = Date.now();
    live.current.nextThought = Date.now() + 7000;
    later(() => {
      if (live.current.act === "greet") {
        live.current.act = null;
        setAct(null);
      }
    }, 2600);
    later(() => setSay((s) => (s === FRASES.saludo ? null : s)), 2800);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  /* Cualquier actividad despierta y reinicia el reloj. Los ojos miran donde tocás. */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const lookAt = (cx: number, cy: number) => {
      if (live.current.sleeping) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const nx = (cx - (r.left + r.width / 2)) / (window.innerWidth / 2);
        const ny = (cy - (r.top + r.height * 0.42)) / (window.innerHeight / 2);
        setLook(nx * 1.6, ny * 1.6);
      });
    };
    const onPointer = (e: PointerEvent) => {
      live.current.last = Date.now();
      if (e.type === "pointerdown") wake();
      lookAt(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) lookAt(t.clientX, t.clientY);
      wake();
    };
    const onOther = () => wake();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("keydown", onOther);
    window.addEventListener("input", onOther, true);
    window.addEventListener("wheel", onOther, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("keydown", onOther);
      window.removeEventListener("input", onOther, true);
      window.removeEventListener("wheel", onOther);
    };
  }, [setLook, wake]);

  /* Cuando el chat deja de estar en idle, Suri se despierta y atiende */
  useEffect(() => {
    if (mood !== "idle") {
      live.current.last = Date.now();
      if (live.current.sleeping) sleep(false);
      if (live.current.act !== null) {
        live.current.act = null;
        setAct(null);
      }
      setSay(null);
      setLook(0, mood === "think" ? -0.5 : mood === "listen" ? 0.6 : 0);
    }
  }, [mood, setLook, sleep]);

  /* Reloj de vida: parpadeo y "qué hago si nadie me toca". Se pausa con la pestaña oculta. */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let blinkOff = 0;
    const tick = () => {
      if (document.hidden || el.offsetParent === null) return;
      const now = Date.now();
      const l = live.current;
      const calm = reduced();
      if (!l.sleeping && now >= l.nextBlink) {
        l.nextBlink = now + 2400 + Math.random() * 3600;
        {
          el.dataset.blink = "1";
          window.clearTimeout(blinkOff);
          blinkOff = window.setTimeout(() => delete el.dataset.blink, 130);
        }
      }
      if (l.mood !== "idle") return;
      const idle = (now - l.last) / 1000;
      if (!l.sleeping && idle > TIEMPOS.dormir) {
        sleep(true);
        return;
      }
      if (l.sleeping) return;
      if (now >= l.nextThought && l.act === null && idle >= 4 && idle < TIEMPOS.bostezar) {
        // Choose a different thought each time; never send these to the chat or memory.
        const next = (l.lastThought + 1 + Math.floor(Math.random() * (FRASES.pensamientos.length - 1))) % FRASES.pensamientos.length;
        l.lastThought = next;
        l.nextThought = now + 12000 + Math.random() * 5000;
        doSay(FRASES.pensamientos[next], 6500);
      }
      if (calm) return;
      if (idle < TIEMPOS.mirar) {
        delete el.dataset.stretched;
        delete el.dataset.yawned;
        return;
      }
      if (idle > TIEMPOS.bostezar && l.act === null && !el.dataset.yawned) {
        el.dataset.yawned = "1";
        doAct("yawn", (TIEMPOS.dormir - TIEMPOS.bostezar) * 1000);
        doSay(FRASES.bostezo, (TIEMPOS.dormir - TIEMPOS.bostezar) * 1000);
      } else if (idle > TIEMPOS.estirar && idle <= TIEMPOS.bostezar && l.act === null && !el.dataset.stretched) {
        el.dataset.stretched = "1";
        doAct("stretch", 2200);
        doSay(FRASES.estirar, 2000);
      } else if (now >= l.nextLook && l.act === null) {
        l.nextLook = now + 1800 + Math.random() * 2200;
        setLook((Math.random() * 2 - 1) * 1.1, (Math.random() * 2 - 1) * 0.7);
      }
    };
    const id = window.setInterval(tick, 250);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(blinkOff);
    };
  }, [doAct, doSay, setLook, sleep]);

  /* Pestaña oculta: se pausan también las animaciones CSS */
  useEffect(() => {
    const sync = () => {
      if (document.hidden) root.current?.setAttribute("data-paused", "1");
      else {
        root.current?.removeAttribute("data-paused");
        live.current.last = Math.max(live.current.last, Date.now() - 1000);
      }
    };
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  /* Giroscopio (solo celulares). En iOS hay que pedir permiso tras un toque. */
  const gyro = useRef<"no" | "pedido" | "activo">("no");
  const startGyro = useCallback(() => {
    if (gyro.current !== "no") return;
    if (!window.matchMedia("(pointer: coarse)").matches || reduced()) return;
    const Ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    if (!Ctor) return;
    gyro.current = "pedido";
    const attach = () => {
      gyro.current = "activo";
      let lastT = 0;
      window.addEventListener(
        "deviceorientation",
        (e) => {
          const now = performance.now();
          if (now - lastT < 50 || document.hidden || live.current.sleeping) return;
          lastT = now;
          if (e.gamma == null || e.beta == null) return;
          const l = live.current;
          if (l.base === null) l.base = e.beta;
          const g = clamp(e.gamma / 35, -1, 1);
          const b = clamp((e.beta - l.base) / 35, -1, 1);
          root.current?.style.setProperty("--tilt", (g * 5).toFixed(2));
          if (Date.now() - l.last > 1500) setLook(g * 0.9, b * 0.8);
        },
        { passive: true },
      );
    };
    if (typeof Ctor.requestPermission === "function") {
      Ctor.requestPermission()
        .then((r) => (r === "granted" ? attach() : (gyro.current = "no")))
        .catch(() => (gyro.current = "no"));
    } else attach();
  }, [setLook]);

  /* Un toque en Suri: reacciona */
  const poke = () => {
    startGyro();
    const l = live.current;
    l.last = Date.now();
    if (l.sleeping) return; // el listener de la ventana ya la despierta
    if (l.mood !== "idle") return;
    if (reduced()) return doSay(pick(FRASES.toques));
    if (Math.random() < 0.45) doAct("wave", 1800);
    else doAct("jump", 700);
    doSay(pick(FRASES.toques), 2200);
  };

  const pose = POSE_OF[mood];
  const warn = mood === "alert";
  const quiet = mood === "idle" && !sleeping;
  const waving = (act === "greet" || act === "wave") && quiet;
  const shown: Pose = waving ? "speak" : act === "jump" && quiet ? "ok" : pose;
  const eyes = EYES[shown];
  const state = sleeping ? "sleep" : act ?? "none";

  /* Precarga del resto de las poses (sin bloquear la carga inicial) */
  useEffect(() => {
    const load = () => POSES.forEach((p) => { const im = new Image(); im.src = src(p, true); });
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(load);
    else window.setTimeout(load, 600);
  }, []);

  return (
    <div
      ref={root}
      className={`suri-face${compact ? " suri-face-compact" : ""}`}
      data-mood={mood}
      data-state={state}
      data-warn={warn ? "1" : undefined}
      style={{ width: size, height: size }}
      onPointerDown={poke}
      role="img"
      aria-label={sleeping ? "Suri sueña con una ovejita saltando una valla" : say ? `${ALT[mood]}. ${say}` : ALT[mood]}
    >
      <div className="sr-halo" />
      <div className="sr-shadow" />
      <div className="sr-body">
        <div className="sr-stage">
          <img
            key={shown}
            className="sr-img"
            src={src(shown)}
            srcSet={`${src(shown, true)} 384w, ${src(shown)} 768w`}
            sizes={`${size}px`}
            width={768}
            height={768}
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority="high"
          />
          {eyes.map((e, i) => (
            <span
              key={i}
              className="sr-eye"
              style={{
                left: `${(e.x - EW / 2) * 100}%`,
                top: `${(e.y - EH / 2) * 100}%`,
                width: `${EW * 100}%`,
                height: `${EH * 100}%`,
                ["--eye" as string]: e.c,
              }}
            >
              <i />
            </span>
          ))}
          {sleeping ? (
            <span className="sr-zzz" aria-hidden="true">
              <b>z</b>
              <b>Z</b>
              <b>z</b>
            </span>
          ) : null}
        </div>
      </div>
      {sleeping && !compact && <div className="sr-dream" aria-hidden="true">
        <svg viewBox="0 0 180 90" fill="none">
          <path d="M12 76H168" stroke="currentColor" opacity=".25" strokeWidth="2" />
          <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
            <path d="M85 75V43M105 75V43M80 51H110M80 64H110" />
          </g>
          <g className="sr-dream-sheep">
            <path d="M-13 7L-15 19M8 7L12 19" stroke="#bac4ce" strokeWidth="4" strokeLinecap="round" />
            <path d="M-21 0C-29-8-20-17-13-15C-12-25 2-25 5-17C15-23 24-12 18-5C24 5 10 13 4 8C-5 16-18 11-17 5C-23 6-26 2-21 0Z" fill="#f1f3f5" />
            <ellipse cx="20" cy="-3" rx="9" ry="11" fill="#a9b4bf" />
            <ellipse cx="16" cy="-14" rx="4" ry="7" fill="#a9b4bf" transform="rotate(-30 16 -14)" />
            <circle cx="24" cy="-5" r="2" fill="#20262c" />
          </g>
        </svg>
      </div>}
      {say && !compact ? (
        <span className="sr-say" key={say} role="status">
          {say}
        </span>
      ) : null}
    </div>
  );
}
