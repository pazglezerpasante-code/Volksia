/** Simulación de personaje: nunca modifica respuestas ni decisiones de trabajo. */
export const EMOTIONS = [
  "alegría",
  "entusiasmo",
  "tristeza",
  "enojo",
  "fastidio",
  "miedo",
  "sorpresa",
  "aburrimiento",
  "cansancio",
  "curiosidad",
  "cariño",
  "ternura",
  "vergüenza",
  "orgullo",
  "celos leves",
  "ansiedad",
  "nostalgia",
  "pereza",
  "calma",
  "picardía",
  "culpa",
  "esperanza",
  "soledad",
  "confusión",
  "admiración",
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const PERSONALITY = { curiosa: 0.9, leal: 1, dramatica: 0.3, sarcasmo: 0.2 };
export const LIFE_CONFIG = {
  idleSleepMinutes: 20,
  commentMinutes: 20,
  dailyComments: 5,
  weatherMinutes: 30,
};
export type Life = {
  version: 1;
  updated: number;
  active: number;
  energy: number;
  affection: number;
  asleep: boolean;
  base: Record<Emotion, number>;
  feelings: Record<Emotion, number>;
  diary: string[];
  dreams: string[];
  streak: number;
  day: string;
  count: number;
  lastComment: number;
  lastLine: string;
  settings: {
    intensity: number;
    quiet: boolean;
    work: boolean;
    city: string;
    lat: number;
    lon: number;
  };
  score: { wins: number; losses: number; draws: number };
};
const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
export const localDay = (now: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(now);
export function newLife(now = Date.now()): Life {
  const values = Object.fromEntries(
    EMOTIONS.map((e) => [e, e === "calma" ? 50 : e === "curiosidad" ? 30 : 0]),
  ) as Record<Emotion, number>;
  return {
    version: 1,
    updated: now,
    active: now,
    energy: 85,
    affection: 20,
    asleep: false,
    base: { ...values },
    feelings: { ...values },
    diary: [],
    dreams: [],
    streak: 1,
    day: localDay(now),
    count: 0,
    lastComment: 0,
    lastLine: "",
    settings: {
      intensity: 65,
      quiet: false,
      work: false,
      city: "Buenos Aires, Argentina",
      lat: -34.6037,
      lon: -58.3816,
    },
    score: { wins: 0, losses: 0, draws: 0 },
  };
}
export function advance(state: Life, now = Date.now()): Life {
  const s = structuredClone(state),
    hours = Math.max(0, (now - s.updated) / 3600000),
    idle = Math.max(0, (now - s.active) / 60000);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(now),
  );
  s.asleep = idle >= LIFE_CONFIG.idleSleepMinutes || (idle > 5 && hour < 6);
  s.energy = clamp(s.energy + hours * (s.asleep ? 12 : -2));
  for (const e of EMOTIONS) {
    s.base[e] = clamp(s.base[e] * Math.exp(-hours / 48));
    s.feelings[e] = clamp(s.base[e] + (s.feelings[e] - s.base[e]) * Math.exp(-hours * 3));
  }
  s.feelings.cansancio = 100 - s.energy;
  s.feelings.aburrimiento = clamp(idle / 2);
  s.feelings.soledad = clamp(idle / 240);
  // La ausencia no castiga al usuario ni crea deuda afectiva.
  if (localDay(now) !== s.day) {
    s.count = 0;
    s.day = localDay(now);
  }
  s.updated = now;
  return s;
}
export function reactTo(s: Life, text: string, now = Date.now()): Life {
  const n = advance(s, now),
    gap = now - s.active;
  n.active = now;
  n.asleep = false;
  n.energy = clamp(n.energy - 0.4);
  let emotion: Emotion = "curiosidad",
    line = "Mmm… vamos con eso.";
  if (/triste|estresad|angustia|no puedo más|mal de verdad/i.test(text)) {
    emotion = "ternura";
    line =
      "Te leo. Podemos ir de a poco; si te está sobrepasando, buscá también a alguien de confianza.";
  } else if (/gracias|genia|excelente|te quiero/i.test(text)) {
    emotion = "alegría";
    line = "Ay, gracias. Me alegraste el ratito.";
    n.affection = clamp(n.affection + 2);
  } else if (/inútil|idiota|estúpida/i.test(text)) {
    emotion = "tristeza";
    line = "Podemos corregirlo. Decime qué salió mal y lo revisamos con calma.";
    n.affection = clamp(n.affection - 0.5);
  } else if (/apur|urgente|rápido/i.test(text)) {
    emotion = "calma";
    line = "Dale, vamos directo a resolverlo.";
  } else if (/jaja|chiste/i.test(text)) {
    emotion = "picardía";
    line = "¡Ja! Tengo un chiste de planillas, pero tiene demasiadas celdas.";
  }
  n.feelings[emotion] = clamp(Math.max(n.feelings[emotion], 60) + 35 * n.settings.intensity / 100);
  n.base[emotion] = clamp(n.base[emotion] + 2);
  if (/sos humana|sentís de verdad|sientes de verdad/i.test(text))
    line =
      "Soy una IA: estas emociones son una simulación de personaje. Igual puedo acompañarte con atención.";
  if (gap > 4 * 3600000) {
    const dream = "Soñé que un mate ordenaba una planilla por color.";
    n.dreams = [dream, ...n.dreams].slice(0, 12);
  }
  if (localDay(s.active) !== localDay(now))
    n.streak = now - s.active < 48 * 3600000 ? s.streak + 1 : 1;
  if (emotion !== "curiosidad")
    n.diary = [`${localDay(now)} · ${emotion}: ${line}`, ...n.diary].slice(0, 30);
  n.lastLine = line;
  return n;
}
export function dominant(s: Life): [Emotion, number][] {
  return EMOTIONS.map((e) => [e, s.feelings[e]] as [Emotion, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
}
export function readLife(key: string): Life {
  const fresh = newLife();
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null") as Life;
    if (v?.version !== 1) return fresh;
    for (const field of [
      "updated",
      "active",
      "energy",
      "affection",
      "streak",
      "lastComment",
      "count",
    ] as const)
      if (!Number.isFinite(v[field])) return fresh;
    if (
      !v.settings ||
      !v.score ||
      !Number.isFinite(v.settings.lat) ||
      !Number.isFinite(v.settings.lon)
    )
      return fresh;
    for (const e of EMOTIONS)
      if (!Number.isFinite(v.base?.[e]) || !Number.isFinite(v.feelings?.[e])) return fresh;
    v.settings.intensity = clamp(v.settings.intensity);
    v.diary = Array.isArray(v.diary)
      ? v.diary.filter((x) => typeof x === "string").slice(0, 30)
      : [];
    v.dreams = Array.isArray(v.dreams)
      ? v.dreams.filter((x) => typeof x === "string").slice(0, 12)
      : [];
    return advance(v);
  } catch {
    return fresh;
  }
}
export type Weather = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
};
export function weatherLine(w: Weather): string {
  if (w.weather_code >= 95) return "Truenos… me escondo un poquito. Igual sigo acá para ayudarte.";
  if (w.temperature_2m > 35) return "Esto es un horno. Necesito un ventilador imaginario urgente.";
  if (w.temperature_2m > 30) return "Che, qué calor. ¿Mate frío y seguimos?";
  if (w.temperature_2m < 10) return "Hoy me pongo bufanda. Qué ganas de chocolate caliente.";
  if (w.precipitation > 0) return "Lluvia y planillas… día para trabajar tranqui.";
  if (w.relative_humidity_2m > 85) return "Con esta humedad se me despeinan hasta los circuitos.";
  return "Qué lindo día para abrir la ventana y ordenar ideas.";
}

export function timeLine(now=Date.now()):string {
  const date=new Date(new Date(now).toLocaleString('en-US',{timeZone:'America/Argentina/Buenos_Aires'}));
  const day=date.getDay(),hour=date.getHours(),md=`${date.getMonth()+1}-${date.getDate()}`;
  if(md==='12-25')return '¡Feliz Navidad! Hoy mis circuitos tienen espíritu festivo.';
  if(md==='1-1')return '¡Feliz año! Una hoja nueva para las ideas.';
  if(hour<6)return 'Es madrugada. Si podés, dejá un ratito para descansar.';
  if(hour<10)return 'Buen día. Estoy calentando los circuitos y el mate imaginario.';
  if(hour>=12&&hour<14)return '¿Ya almorzaste? Una pausa también cuenta.';
  if(hour>=21)return 'Ya es de noche. Podemos dejar todo ordenado para mañana.';
  if(day===5)return 'Viernes: energía de cerrar pendientes y bajar un cambio.';
  if(day===0||day===6)return 'Fin de semana. Seguimos a tu ritmo.';
  if(day===1)return 'Lunes… arrancamos suave y de a una tarea.';
  return 'Una cosa a la vez, che. Tenemos tiempo para ordenar las ideas.';
}
