import { useEffect, useRef, useState } from "react";
import {
  advance,
  dominant,
  LIFE_CONFIG,
  newLife,
  reactTo,
  readLife,
  timeLine,
  weatherLine,
  type Life,
  type Weather,
} from "@/lib/suri-life";
import "./suri-life.css";

/** Motor invisible. La única superficie del personaje es el avatar real del chat. */
export function SuriLife() {
  const [life, setLife] = useState<Life>(() => newLife());
  const [ready, setReady] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const busy = useRef(false),
    nextWeather = useRef(0);
  useEffect(() => {
    const saved = readLife("suri-life-v1");
    // Configuración de producto, nunca una pantalla de configuración del usuario.
    saved.settings = { ...newLife().settings };
    setLife(saved);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("suri-life-v1", JSON.stringify(life));
    } catch {
      /* Funciona también sin almacenamiento. */
    }
  }, [life, ready]);
  useEffect(() => {
    const message = (event: Event) => {
      const d = (event as CustomEvent<{ text?: string; busy?: boolean; success?: boolean }>).detail;
      if (typeof d.busy === "boolean") busy.current = d.busy;
      if (d.text) setLife((s) => reactTo(s, d.text!));
      else if (d.success)
        setLife((s) => ({
          ...s,
          feelings: { ...s.feelings, orgullo: Math.max(s.feelings.orgullo, 55) },
        }));
    };
    let last = 0;
    const activity = () => {
      if (Date.now() - last < 15000) return;
      last = Date.now();
      setLife((s) => ({ ...advance(s), active: Date.now(), asleep: false }));
    };
    const poke = () => setLife((s) => reactTo(s, "hola"));
    window.addEventListener("suri-life", message);
    window.addEventListener("keydown", activity);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("suri-poke", poke);
    return () => {
      window.removeEventListener("suri-life", message);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("suri-poke", poke);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      setLife((s) => {
        const n = advance(s);
        if (busy.current) {
          n.asleep = false;
          return n;
        }
        const idle = Date.now() - n.active;
        if (
          idle > 90000 &&
          Date.now() - n.lastComment > LIFE_CONFIG.commentMinutes * 60000 &&
          n.count < LIFE_CONFIG.dailyComments
        ) {
          const options = n.asleep
            ? ["zzz… contando celdas, no ovejas."]
            : n.energy < 30
              ? ["Un bostezo y seguimos."]
              : weather
                ? [weatherLine(weather), timeLine(Date.now()), "¿Pausa para un mate?"]
                : [timeLine(Date.now()), "¿Y si las planillas se completaran solas?"];
          const line = options.find((x) => x !== n.lastLine);
          if (line) {
            n.lastLine = line;
            n.lastComment = Date.now();
            n.count++;
          }
        }
        return n;
      });
    }, 15000);
    return () => clearInterval(timer);
  }, [ready, weather]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      if (document.hidden || Date.now() < nextWeather.current) return;
      try {
        const params = new URLSearchParams({
          latitude: "-34.6037",
          longitude: "-58.3816",
          current:
            "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
          timezone: "America/Argentina/Buenos_Aires",
        });
        const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params, {
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!Number.isFinite(data.current?.temperature_2m)) throw Error();
        if (active) {
          nextWeather.current = Date.now() + LIFE_CONFIG.weatherMinutes * 60000;
          setWeather(data.current);
        }
      } catch {
        if (active) setWeather(null);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!weather) return;
    setLife((s) => ({
      ...s,
      feelings: {
        ...s.feelings,
        miedo: weather.weather_code >= 95 ? 70 : s.feelings.miedo,
        fastidio: weather.temperature_2m > 30 ? 65 : s.feelings.fastidio,
        nostalgia: weather.precipitation > 0 ? 55 : s.feelings.nostalgia,
      },
    }));
  }, [weather]);
  const emotion = dominant(life)[0][0];
  useEffect(() => {
    if (!ready) return;
    const broadcast = () =>
      window.dispatchEvent(
        new CustomEvent("suri-life-state", {
          detail: {
            asleep: life.asleep && !busy.current,
            quiet: false,
            line: life.lastLine,
            emotion,
            energy: life.energy,
            temperature: weather?.temperature_2m ?? null,
            storm: (weather?.weather_code ?? 0) >= 95,
          },
        }),
      );
    broadcast();
    window.addEventListener("suri-life-request", broadcast);
    return () => window.removeEventListener("suri-life-request", broadcast);
  }, [ready, life.asleep, life.lastLine, life.energy, emotion, weather]);
  return null;
}
