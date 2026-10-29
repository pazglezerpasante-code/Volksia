import { useEffect, useRef, useState } from "react";
import { Mic, X, Check } from "lucide-react";
import { useSpace } from "@/lib/space-context";
import { saveAudio, readAudio, removeAudio } from "@/lib/audio-store";

/* Bencho Voice note: 56px capsule, 70ms samples, hold/release and a 90px cancel gesture.
   Unlike the original study, levels come from AnalyserNode, the clip from MediaRecorder,
   and playback from a real audio element. Stop tracks and close the audio graph on every exit. */
export function VoiceRecorder() {
  const { add } = useSpace();
  const [phase, setPhase] = useState<"idle" | "rec" | "clip">("idle");
  const [pending, setPending] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [ms, setMs] = useState(0);
  const [pull, setPull] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const held = useRef(false);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const initialX = useRef(0);
  const drag = useRef(0);
  const stopResources = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      held.current = false;
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stopResources();
    };
  }, []);
  const finish = (cancel = false) => {
    held.current = false;
    const rec = recorder.current;
    if (!rec || rec.state !== "recording") return;
    const keep = !cancel && performance.now() - started.current >= 500;
    rec.onstop = () => {
      stopResources();
      recorder.current = null;
      if (!mounted.current) return;
      if (!keep) {
        setClip(null);
        setPhase("idle");
        setPull(0);
      }
    };
    // ondataavailable arrives before onstop and sees whether this recording is kept.
    rec.ondataavailable = (event) => {
      if (keep && mounted.current) {
        if (event.data.size) {
          setClip(event.data);
          setPhase("clip");
          setPull(0);
        } else {
          setPhase("idle");
          setError("El micrófono no produjo audio. Volvé a intentarlo.");
        }
      }
    };
    rec.stop();
    stopResources();
  };
  const begin = async () => {
    if (pendingRef.current || recorder.current || phase !== "idle") return;
    held.current = true;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error(
          "Este navegador no permite grabar. Usá un navegador actualizado con acceso al micrófono.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!held.current || !mounted.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const graph = new AudioContext();
      context.current = graph;
      await graph.resume();
      if (!held.current || !mounted.current) {
        stopResources();
        return;
      }
      const analyser = graph.createAnalyser();
      analyser.fftSize = 256;
      graph.createMediaStreamSource(media).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      rec.onerror = () => {
        held.current = false;
        stopResources();
        recorder.current = null;
        if (mounted.current) {
          setPhase("idle");
          setError("La grabación se interrumpió. Volvé a intentarlo.");
        }
      };
      rec.start();
      started.current = performance.now();
      setMs(0);
      setLevels([]);
      setPull(0);
      drag.current = 0;
      setPhase("rec");
      timer.current = setInterval(() => {
        const duration = performance.now() - started.current;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
        setLevels((previous) => [...previous.slice(-27), level]);
        setMs(duration);
        if (duration >= 30000) finish();
      }, 70);
    } catch (cause) {
      stopResources();
      if (mounted.current) {
        setPhase("idle");
        setError(
          cause instanceof Error && cause.name === "NotAllowedError"
            ? "Permití el micrófono en tu navegador para grabar."
            : cause instanceof Error
              ? cause.message
              : "No se pudo iniciar el micrófono.",
        );
      }
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  };
  const save = async () => {
    if (!clip || saving) return;
    setSaving(true);
    setError("");
    const id = crypto.randomUUID();
    try {
      await saveAudio(id, clip);
      if (
        !(await add("notes", {
          title: `Nota de voz · ${new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`,
          content: "",
          audioId: id,
        }))
      ) {
        await removeAudio(id);
        throw new Error("No se pudo guardar la nota. El audio sigue disponible para reintentar.");
      }
      setClip(null);
      setPhase("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el audio.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="voice-note-section bencho-scope" aria-label="Nota de voz">
      <div className="voice-heading">
        <Mic size={18} />
        <span>También podés decirlo.</span>
        <small>Audio local, hasta 30 segundos</small>
      </div>
      {phase !== "clip" ? (
        <div
          className="voice-capture vn"
          data-phase={phase}
          role="button"
          tabIndex={0}
          aria-label={
            phase === "rec"
              ? "Grabando. Soltá para conservar; Escape para descartar"
              : "Mantener para grabar nota de voz"
          }
          style={
            {
              "--w": phase === "idle" ? "216px" : "300px",
              "--r": "28px",
              "--ov": "1.2",
              "--pull": pull,
            } as React.CSSProperties
          }
          onPointerDown={(e) => {
            if (phase !== "idle") return;
            initialX.current = e.clientX;
            e.currentTarget.setPointerCapture(e.pointerId);
            void begin();
          }}
          onPointerMove={(e) => {
            if (phase !== "rec") return;
            drag.current = Math.max(0, Math.min(1, (initialX.current - e.clientX) / 90));
            setPull(drag.current);
          }}
          onPointerUp={() => finish(drag.current >= 1)}
          onPointerCancel={() => finish(true)}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              void begin();
            }
            if (e.key === "Escape") finish(true);
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              finish();
            }
          }}
          onBlur={() => {
            if (held.current) finish(true);
          }}
        >
          {phase === "idle" ? (
            <span className="voice-idle">
              <Mic size={19} />
              {pending ? "Habilitando micrófono…" : "Mantener para grabar"}
            </span>
          ) : (
            <span className="voice-active">
              <span className="vn-dot" />
              <span>{(ms / 1000).toFixed(1)}s</span>
              <span className="vn-wave">
                {levels.map((value, i) => (
                  <i className="vn-bar" key={i} style={{ "--l": value } as React.CSSProperties} />
                ))}
              </span>
              {pull >= 1 && <X size={18} />}
            </span>
          )}
        </div>
      ) : (
        <div className="voice-clip">
          <AudioClip blob={clip} />
          <button disabled={saving} onClick={save}>
            <Check size={17} />
            Guardar audio
          </button>
          <button
            disabled={saving}
            aria-label="Descartar audio sin guardar"
            onClick={() => {
              setClip(null);
              setPhase("idle");
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {phase === "rec" && (
        <small>
          {pull >= 1 ? "Soltá para descartar" : "Deslizá a la izquierda para descartar"}
        </small>
      )}
      {error && (
        <p role="alert" className="voice-error">
          {error}
        </p>
      )}
    </section>
  );
}
function AudioClip({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? (
    <audio controls src={url} preload="metadata" aria-label="Reproducir nota de voz" />
  ) : null;
}
export function AudioNotePlayer({ id }: { id: string }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void readAudio(id)
      .then((value) => {
        if (live) {
          setBlob(value);
          if (!value) setError("El audio no está disponible en este navegador.");
        }
      })
      .catch(() => {
        if (live) setError("No se pudo recuperar el audio.");
      });
    return () => {
      live = false;
    };
  }, [id]);
  return error ? <p role="status">{error}</p> : <AudioClip blob={blob} />;
}
