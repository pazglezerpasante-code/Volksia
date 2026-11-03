import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { RobotMood } from "@/components/robot";
import type { Emotion } from "@/lib/suri-life";
import { EMOTION_STYLE, IDLE_TIMINGS } from "@/lib/suri-life";
import idleImage from "@/assets/suri-idle.webp?inline";
import "./suri-motion.css";

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
const TIEMPOS = IDLE_TIMINGS;

const FRASES = {
  saludo: "¡Hola!",
  toques: [
    "¡Hola de nuevo!",
    "¿Qué hacemos hoy?",
    "¡Acá estoy!",
    "Contame qué necesitás.",
    "¡Vamos con eso!",
    "Tu asistente de trabajo.",
  ],
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
const POSE_OF: Record<RobotMood, Pose> = {
  idle: "idle",
  listen: "listen",
  think: "think",
  speak: "speak",
  ok: "ok",
  alert: "think",
  reading: "think",
  processing: "think",
  searching: "listen",
  reconnecting: "listen",
  offline: "think",
  celebrate: "ok",
};
const POSES: Pose[] = ["idle", "listen", "think", "speak", "ok"];

/* Posición de los ojos en cada pose (fracción del cuadro 768×768), medida
   con PIL sobre las imágenes. Color = el gris pintado original. */
type Eye = { x: number; y: number; c: string };
const EW = 0.05;
const EH = 0.075;
const EYES: Record<Pose, [Eye, Eye]> = {
  idle: [
    { x: 0.3925, y: 0.4326, c: "111,130,155" },
    { x: 0.6008, y: 0.4326, c: "111,130,155" },
  ],
  listen: [
    { x: 0.3731, y: 0.4231, c: "98,113,131" },
    { x: 0.5797, y: 0.4418, c: "80,96,117" },
  ],
  speak: [
    { x: 0.3405, y: 0.4356, c: "112,124,144" },
    { x: 0.545, y: 0.4188, c: "86,101,124" },
  ],
  ok: [
    { x: 0.3974, y: 0.4174, c: "93,108,127" },
    { x: 0.6023, y: 0.4379, c: "76,92,112" },
  ],
  think: [
    { x: 0.3465, y: 0.4392, c: "92,106,128" },
    { x: 0.5323, y: 0.3788, c: "74,90,113" },
  ],
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

type Act =
  | "greet"
  | "wave"
  | "jump"
  | "stretch"
  | "yawn"
  | "play"
  | "stargaze"
  | "hum"
  | "sneeze"
  | "tickle"
  | "pet"
  | "dance"
  | "hide"
  | "startle"
  | null;
type Rest = "awake" | "drowsy" | "yawn" | "nod" | "settle" | "sleep" | "wake";
type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function SuriFace({
  mood,
  size = 260,
  compact = false,
}: {
  mood: RobotMood;
  size?: number;
  compact?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lastPoke = useRef(0);
  const proximity = useRef({ near: false, last: 0 });
  const [sleeping, setSleeping] = useState(false);
  const [act, setAct] = useState<Act>("greet");
  const [say, setSay] = useState<string | null>(FRASES.saludo);
  const [feeling, setFeeling] = useState<Emotion>("calma");
  const [secondary, setSecondary] = useState<Emotion | null>(null);
  const [tired, setTired] = useState(false);
  const [rest, setRest] = useState<Rest>("awake");
  const awakeAfterNap = useRef(false);
  const nextActivity = useRef(0);
  const touchHistory = useRef({ x: 0, y: 0, time: 0, strokes: 0, lastPet: 0 });
  const light = useRef({ dragging: false, timer: 0 });
  const [loaded, setLoaded] = useState<Partial<Record<Pose, boolean>>>({});
  const [displayed, setDisplayed] = useState<Pose>("idle");
  const [warmImages, setWarmImages] = useState(false);
  const restRef = useRef<Rest>("awake");
  const sleepToken = useRef(0),
    actToken = useRef(0),
    sleptAt = useRef(0);
  const restTo = useCallback((phase: Rest) => {
    restRef.current = phase;
    setRest(phase);
  }, []);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [storm, setStorm] = useState(false);
  // refs para que los timers vean siempre el valor actual sin re-suscribirse
  const live = useRef({
    mood,
    sleeping: false,
    act: "greet" as Act,
    last: 0,
    nextBlink: 0,
    nextLook: 0,
    nextThought: 0,
    lastThought: -1,
    base: null as null | number,
  });
  live.current.mood = mood;
  const timers = useRef(new Set<number>());
  const managedLife = useRef(false);
  const lastLifeLine = useRef("");
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
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
    if (a === "hide" && root.current) {
      const el = root.current,
        box = el.getBoundingClientRect(),
        chat = el.closest(".suri-chat")?.getBoundingClientRect();
      el.style.setProperty(
        "--peek-travel",
        `${Math.max(0, (chat?.right ?? box.right) - box.right) + box.width * 0.73}px`,
      );
    }
    const token = ++actToken.current;
    live.current.act = a;
    setAct(a);
    later(() => {
      if (actToken.current === token && live.current.act === a) {
        live.current.act = null;
        setAct(null);
      }
    }, ms);
  }, []);

  const sleep = useCallback(
    (on: boolean) => {
      if (on && awakeAfterNap.current) return;
      if (live.current.sleeping === on) return;
      const token = ++sleepToken.current;
      live.current.sleeping = on;
      setSleeping(on);
      if (on) {
        sleptAt.current = Date.now();
        actToken.current++;
        live.current.act = null;
        setAct(null);
        setLook(0, 0.2);
        setSay(null);
        restTo("settle");
        later(
          () => {
            if (token === sleepToken.current) restTo("sleep");
          },
          reduced() ? 0 : 1800,
        );
      } else {
        awakeAfterNap.current = true;
        nextActivity.current = Date.now() + 5000;
        try {
          sessionStorage.setItem("suri-awake-play", "1");
        } catch {
          /* Sin almacenamiento también funciona. */
        }
        window.dispatchEvent(new Event("suri-awake-play"));
        restTo("wake");
        later(
          () => {
            if (token === sleepToken.current) restTo("awake");
          },
          reduced() ? 0 : 2100,
        );
      }
    },
    [setLook, restTo],
  );

  const wake = useCallback(() => {
    const l = live.current;
    l.last = Date.now();
    if (l.sleeping) {
      sleep(false);
      doSay(
        Date.now() - sleptAt.current < 15000
          ? "Uy… me estaba acomodando. Ya estoy."
          : pick(FRASES.despertar),
        2600,
      );
    } else if (restRef.current !== "wake") restTo("awake");
    if (l.act && !["greet", "wave", "jump", "tickle", "dance"].includes(l.act)) {
      actToken.current++;
      l.act = null;
      setAct(null);
      setSay(null);
    }
  }, [doSay, sleep, restTo]);

  useEffect(() => {
    try {
      awakeAfterNap.current = sessionStorage.getItem("suri-awake-play") === "1";
    } catch {
      /* Sesión local. */
    }
    const stayAwake = () => {
      awakeAfterNap.current = true;
      nextActivity.current = Date.now() + 5000;
    };
    window.addEventListener("suri-awake-play", stayAwake);
    return () => window.removeEventListener("suri-awake-play", stayAwake);
  }, []);

  // El motor persistente dirige el reposo; los estados de trabajo tienen prioridad.
  useEffect(() => {
    const sync = (event: Event) => {
      const d = (
        event as CustomEvent<{
          asleep: boolean;
          quiet: boolean;
          line: string;
          emotion: Emotion;
          secondary?: Emotion | null;
          tired?: boolean;
          temperature: number | null;
          storm: boolean;
          activeAt: number;
        }>
      ).detail;
      if (!d) return;
      managedLife.current = true;
      setFeeling(d.emotion);
      setSecondary(d.secondary ?? null);
      setTired(d.tired ?? false);
      setTemperature(d.temperature);
      setStorm(d.storm);
      if (Number.isFinite(d.activeAt)) live.current.last = Math.max(live.current.last, d.activeAt);
      if (live.current.mood !== "idle" && live.current.mood !== "listen") return;
      sleep(d.asleep && !d.quiet);
      if (d.quiet) setSay(null);
      else if (d.line && d.line !== lastLifeLine.current) {
        lastLifeLine.current = d.line;
        doSay(d.line, 6000);
      }
    };
    window.addEventListener("suri-life-state", sync);
    window.dispatchEvent(new Event("suri-life-request"));
    return () => window.removeEventListener("suri-life-state", sync);
  }, [doSay, sleep]);

  useEffect(() => {
    window.dispatchEvent(new Event("suri-life-request"));
  }, [mood]);

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
      timers.current.clear();
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
        if (
          !compact &&
          restRef.current === "awake" &&
          !live.current.act &&
          ["idle", "listen"].includes(live.current.mood)
        ) {
          const px = (cx - r.left) / r.width,
            py = (cy - r.top) / r.height;
          el.style.setProperty("--approach-x", `${clamp(px - 0.5, -1, 1) * 2.5}%`);
          el.style.setProperty("--approach-y", `${clamp(py - 0.43, -1, 1) * 1.2}%`);
          const near = px > 0.3 && px < 0.7 && py > 0.3 && py < 0.55;
          if (
            near &&
            !proximity.current.near &&
            performance.now() - proximity.current.last > 4500
          ) {
            proximity.current.last = performance.now();
            doAct("startle", 1000);
          }
          proximity.current.near = near;
        }
      });
    };
    const onPointer = (e: PointerEvent) => {
      if (e.type === "pointerdown") wake();
      if (el.dataset.lightGuided) return;
      lookAt(e.clientX, e.clientY);
      if (
        e.type !== "pointermove" ||
        compact ||
        live.current.sleeping ||
        live.current.mood !== "idle"
      )
        return;
      if (e.pointerType === "touch" && !e.buttons) return;
      const rect = el.getBoundingClientRect(),
        x = (e.clientX - rect.left) / rect.width,
        y = (e.clientY - rect.top) / rect.height;
      const h = touchHistory.current,
        now = performance.now(),
        distance = Math.hypot(e.clientX - h.x, e.clientY - h.y),
        dt = now - h.time;
      h.x = e.clientX;
      h.y = e.clientY;
      h.time = now;
      if (
        x > 0.25 &&
        x < 0.73 &&
        y > 0.18 &&
        y < 0.54 &&
        dt > 0 &&
        dt < 180 &&
        distance > 2 &&
        distance / dt < 0.8
      )
        h.strokes += distance;
      else if (dt > 250 || x < 0.2 || x > 0.8 || y > 0.6) h.strokes = 0;
      if (h.strokes > 45 && now - h.lastPet > 3000) {
        h.strokes = 0;
        h.lastPet = now;
        setFeeling("ternura");
        doAct("pet", 2200);
        doSay("Mmm… qué lindo mimo.", 2200);
        window.dispatchEvent(
          new CustomEvent("suri-life", { detail: { text: "un mimo y un abrazo" } }),
        );
      }
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
  }, [setLook, wake, compact, doAct, doSay]);

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
      if (l.mood !== "idle" && l.mood !== "listen") return;
      const idle = (now - l.last) / 1000;
      if (!awakeAfterNap.current && !l.sleeping && idle >= TIEMPOS.dormir) {
        sleep(true);
        return;
      }
      if (l.sleeping) return;
      if (now >= l.nextThought && l.act === null && idle >= 4 && idle < TIEMPOS.bostezar) {
        // Choose a different thought each time; never send these to the chat or memory.
        const next =
          (l.lastThought + 1 + Math.floor(Math.random() * (FRASES.pensamientos.length - 1))) %
          FRASES.pensamientos.length;
        l.lastThought = next;
        l.nextThought = now + 12000 + Math.random() * 5000;
        const micro = EMOTION_STYLE[feeling].line;
        doSay(next % 3 === 0 && micro ? micro : FRASES.pensamientos[next], 6500);
      }
      if (restRef.current !== "wake") {
        restTo(
          awakeAfterNap.current
            ? "awake"
            : idle >= TIEMPOS.acomodar
              ? "settle"
              : idle >= TIEMPOS.cabecear
                ? "nod"
                : idle >= TIEMPOS.bostezar
                  ? "yawn"
                  : idle >= 40
                    ? "drowsy"
                    : "awake",
        );
      }
      if (calm) return;
      if (awakeAfterNap.current) {
        if (idle >= 4 && l.act === null && now >= nextActivity.current) {
          nextActivity.current = now + 8000 + Math.random() * 6000;
          doAct(pick(["play", "hide", "stargaze", "hum", "stretch", "dance"] as const), 6500);
        }
        return;
      }
      if (idle < TIEMPOS.mirar) {
        delete el.dataset.stretched;
        delete el.dataset.yawned;
        delete el.dataset.played;
        return;
      }
      if (idle >= TIEMPOS.jugar && l.act === null && !el.dataset.played) {
        el.dataset.played = "1";
        doAct(pick(["play", "hide", "stargaze", "hum"] as const), 6500);
      } else if (idle > TIEMPOS.bostezar && l.act === null && !el.dataset.yawned) {
        el.dataset.yawned = "1";
        doAct("yawn", 4500);
        if (!managedLife.current) doSay(FRASES.bostezo, (TIEMPOS.dormir - TIEMPOS.bostezar) * 1000);
      } else if (
        idle > TIEMPOS.estirar &&
        idle <= TIEMPOS.bostezar &&
        l.act === null &&
        !el.dataset.stretched
      ) {
        el.dataset.stretched = "1";
        doAct("stretch", 2200);
        if (!managedLife.current) doSay(FRASES.estirar, 2000);
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
  }, [doAct, doSay, setLook, sleep, restTo, feeling]);

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
  const gyroCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => gyroCleanup.current?.(), []);
  const startGyro = useCallback(() => {
    if (gyro.current !== "no") return;
    if (!window.matchMedia("(pointer: coarse)").matches || reduced()) return;
    const Ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor })
      .DeviceOrientationEvent;
    if (!Ctor) return;
    gyro.current = "pedido";
    const attach = () => {
      gyro.current = "activo";
      let lastT = 0;
      const orient = (e: DeviceOrientationEvent) => {
        const now = performance.now();
        if (now - lastT < 50 || document.hidden || live.current.sleeping) return;
        lastT = now;
        if (e.gamma == null || e.beta == null) return;
        const l = live.current;
        if (l.base === null) l.base = e.beta;
        const g = clamp(e.gamma / 35, -1, 1);
        const b = clamp((e.beta - l.base) / 35, -1, 1);
        // El teléfono dirige la mirada, nunca deja todo el dibujo inclinado.
        if (Date.now() - l.last > 1500) setLook(g * 0.9, b * 0.8);
      };
      const reset = () => {
        live.current.base = null;
        setLook(0, 0);
      };
      window.addEventListener("deviceorientation", orient, { passive: true });
      window.addEventListener("orientationchange", reset);
      gyroCleanup.current = () => {
        window.removeEventListener("deviceorientation", orient);
        window.removeEventListener("orientationchange", reset);
      };
    };
    if (typeof Ctor.requestPermission === "function") {
      // Sin cuadros de permisos: el movimiento con el dedo ya funciona.
      gyro.current = "no";
    } else attach();
  }, [setLook]);

  /* Un toque en Suri: reacciona */
  const poke = () => {
    const wasAsleep = live.current.sleeping || restRef.current === "wake";
    window.dispatchEvent(new Event("suri-poke"));
    startGyro();
    const l = live.current;
    l.last = Date.now();
    if (wasAsleep) {
      wake();
      return;
    }
    if (l.mood !== "idle") return;
    const now = performance.now();
    if (lastPoke.current > 0 && now - lastPoke.current < 380) {
      lastPoke.current = 0;
      setFeeling("diversión");
      doAct("dance", 4400);
      doSay("¡Un pasito y seguimos!", 2200);
      return;
    }
    lastPoke.current = now;
    if (reduced()) return doSay(pick(FRASES.toques));
    doAct(pick(["wave", "jump", "tickle", "sneeze"] as const), 1800);
    doSay(pick(FRASES.toques), 2200);
  };

  const pose = POSE_OF[mood];
  const warn = mood === "alert";
  const quiet = (mood === "idle" || mood === "listen") && !sleeping;
  const waving = (act === "greet" || act === "wave" || act === "hide" || act === "dance") && quiet;
  const shown: Pose = waving ? "speak" : act === "jump" && quiet ? "ok" : pose;
  const eyes = EYES[displayed];
  const state = rest !== "awake" ? rest : (act ?? "none");
  const profile = EMOTION_STYLE[feeling];
  const guideLight = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!light.current.dragging) return;
    const el = root.current;
    if (!el) return;
    const box = el.getBoundingClientRect(),
      x = clamp((event.clientX - box.left) / box.width, 0.08, 0.92),
      y = clamp((event.clientY - box.top) / box.height, 0.05, 0.8);
    el.style.setProperty("--fly-x", String(x * 100));
    el.style.setProperty("--fly-y", String(y * 100));
    el.dataset.lightGuided = "1";
    setLook((x - 0.5) * 1.8, (y - 0.43) * 1.8);
  };
  useEffect(() => () => window.clearTimeout(light.current.timer), []);

  // Conservamos la última pose completa hasta que la siguiente esté decodificada.
  useEffect(() => {
    if (loaded[shown]) setDisplayed(shown);
  }, [loaded, shown]);

  /* La pose inicial viaja con el código. Las demás se cargan en segundo plano. */
  useEffect(() => {
    const timer = window.setTimeout(() => setWarmImages(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      ref={root}
      className={`suri-face${compact ? " suri-face-compact" : ""}`}
      data-mood={mood}
      data-state={state}
      data-emotion={feeling}
      data-secondary={secondary ?? undefined}
      data-tired={tired ? "1" : undefined}
      data-expression={profile.expression}
      data-effect={profile.effect}
      data-weather={
        storm
          ? "storm"
          : temperature !== null && temperature > 30
            ? "hot"
            : temperature !== null && temperature < 10
              ? "cold"
              : undefined
      }
      data-warn={warn ? "1" : undefined}
      style={{
        width: size,
        height: size,
        ["--emotion-eye-x" as string]: profile.eyeX,
        ["--emotion-eye-y" as string]: profile.eyeY,
        ["--emotion-y" as string]: `${profile.bodyY}%`,
        ["--breath" as string]: `${profile.breath}s`,
      }}
      onPointerDown={poke}
      role="group"
      tabIndex={0}
      title="Doble toque para bailar. Pasá suavemente por la cabeza para acariciar."
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          wake();
          doAct("dance", 4400);
        }
      }}
      aria-label={
        sleeping
          ? "Suri duerme y respira suavemente. Zzz…"
          : `${ALT[mood]}. ${feeling}${secondary ? ` y ${secondary}` : ""}${say ? `. ${say}` : ""}`
      }
    >
      <div className="sr-halo" />
      <div className="sr-shadow" />
      <div className="sr-body">
        <div className="sr-stage">
          {POSES.filter((layer) => layer === "idle" || layer === shown || warmImages).map(
            (layer) => (
              <div
                className="sr-pose"
                key={layer}
                data-visible={layer === displayed ? "1" : undefined}
                data-ready={loaded[layer] ? "1" : undefined}
              >
                <img
                  className="sr-img"
                  src={layer === "idle" ? idleImage : src(layer, true)}
                  width={768}
                  height={768}
                  alt=""
                  draggable={false}
                  decoding={layer === "idle" ? "sync" : "async"}
                  fetchPriority={layer === shown || layer === "idle" ? "high" : "low"}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    void image
                      .decode()
                      .then(() => setLoaded((s) => ({ ...s, [layer]: true })))
                      .catch(() => {
                        if (image.naturalWidth > 0) setLoaded((s) => ({ ...s, [layer]: true }));
                      });
                  }}
                />
                {EYES[layer].map((e, i) => (
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
              </div>
            ),
          )}
          <svg
            className="sr-feelings"
            viewBox="0 0 100 100"
            aria-hidden="true"
            style={{ opacity: loaded[displayed] ? undefined : 0 }}
          >
            {eyes.map((eye, i) => (
              <g key={i}>
                <ellipse
                  className="sr-blush"
                  cx={eye.x * 100 + (i === 0 ? -3 : 3)}
                  cy={eye.y * 100 + 5}
                  rx="4"
                  ry="1.8"
                />
                <path
                  className="sr-tear"
                  d={`M${eye.x * 100 + 2} ${eye.y * 100 + 3} q-2 4 0 4 q2 0 0-4`}
                />
              </g>
            ))}
            <path className="sr-sweat" d="M68 34q-4 7 0 7q4 0 0-7" />
            <g className="sr-scarf">
              <path d="M34 56Q50 63 65 56" />
              <path d="M60 59L63 70" />
            </g>
            <g className="sr-heart">
              <path d="M73 24C66 16 59 25 73 33C87 25 80 16 73 24" />
            </g>
            <g className="sr-question">
              <text x="68" y="29">
                ?
              </text>
            </g>
            <g className="sr-spark">
              <path d="M27 26v8m-4-4h8M73 45v6m-3-3h6" />
            </g>
          </svg>
          {["play", "stargaze", "hum"].includes(act ?? "") && !sleeping && quiet && (
            <svg
              className={`sr-idle-toy sr-activity-${act}`}
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <g className="sr-stars" fill="#d4deef">
                <circle cx="26" cy="18" r=".8" />
                <circle cx="68" cy="12" r="1" />
                <circle cx="78" cy="23" r=".7" />
              </g>
              <text className="sr-hum" x="77" y="31" fill="#b5cad8" fontSize="9">
                ♪
              </text>
            </svg>
          )}
          {sleeping ? (
            <span className="sr-zzz" aria-hidden="true">
              <b>z</b>
              <b>Z</b>
              <b>z</b>
            </span>
          ) : null}
        </div>
      </div>
      {!compact && quiet && rest !== "wake" && (
        <button
          type="button"
          className="sr-light-guide"
          aria-label="Jugar con el reflejo de luz"
          title="Arrastrá el reflejo con el cursor o el dedo para que Suri lo siga"
          onPointerDown={(event) => {
            event.stopPropagation();
            wake();
            window.dispatchEvent(new Event("suri-poke"));
            actToken.current++;
            live.current.act = null;
            setAct(null);
            light.current.dragging = true;
            window.clearTimeout(light.current.timer);
            event.currentTarget.setPointerCapture(event.pointerId);
            guideLight(event);
          }}
          onPointerMove={guideLight}
          onPointerUp={(event) => {
            event.stopPropagation();
            light.current.dragging = false;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            light.current.timer = window.setTimeout(() => {
              if (root.current) delete root.current.dataset.lightGuided;
            }, 2200);
          }}
          onPointerCancel={() => {
            light.current.dragging = false;
            if (root.current) delete root.current.dataset.lightGuided;
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            const offsets: Record<string, [number, number]> = {
              ArrowLeft: [-8, 0],
              ArrowRight: [8, 0],
              ArrowUp: [0, -8],
              ArrowDown: [0, 8],
            };
            const offset = offsets[event.key];
            if (!offset) return;
            event.preventDefault();
            const el = root.current;
            if (!el) return;
            const x = clamp(Number(el.style.getPropertyValue("--fly-x") || 78) + offset[0], 8, 92),
              y = clamp(Number(el.style.getPropertyValue("--fly-y") || 25) + offset[1], 5, 80);
            el.style.setProperty("--fly-x", String(x));
            el.style.setProperty("--fly-y", String(y));
            setLook((x / 100 - 0.5) * 1.8, (y / 100 - 0.43) * 1.8);
          }}
        >
          <span className="sr-reflection-core" aria-hidden="true" />
        </button>
      )}
      {say && !compact ? (
        <span className="sr-say" key={say} role="status">
          {say}
        </span>
      ) : null}
    </div>
  );
}
