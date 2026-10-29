import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function useChatVoice({ active, disabled, text, onText }: { active: boolean; disabled: boolean; text: string; onText: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const update = useRef(onText);
  update.current = onText;
  function cancel() {
    const current = recognition.current;
    recognition.current = null;
    if (current) { current.onresult = null; current.onend = null; current.onerror = null; current.abort(); }
    clearTimeout(timer.current);
    setListening(false);
  }
  useEffect(() => {
    if (!active || disabled) { cancel(); setStatus(""); }
  }, [active, disabled]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { cancel(); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  function toggle() {
    if (recognition.current) { recognition.current.stop(); return; }
    if (disabled || !active) return;
    const host = window as SpeechWindow;
    const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Constructor) { setStatus("Este navegador no admite dictado. Abrí Suri en Chrome o Edge, o escribí tu mensaje."); return; }
    window.speechSynthesis?.cancel();
    const instance = new Constructor();
    recognition.current = instance;
    const prefix = text.trim();
    let heard = false;
    let error = false;
    instance.lang = "es-AR";
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (event) => {
      if (recognition.current !== instance) return;
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(" ").trim();
      heard = Boolean(transcript);
      update.current([prefix, transcript].filter(Boolean).join(" "));
    };
    instance.onerror = (event) => {
      error = true;
      const messages: Record<string, string> = {
        "not-allowed": "Habilitá el micrófono en los permisos del navegador para hablar con Suri.",
        "service-not-allowed": "El navegador bloqueó el dictado. Probá abrir Suri en Chrome o Edge.",
        "audio-capture": "No encuentro un micrófono disponible. Revisá su conexión.",
        "network": "No se pudo conectar el dictado. Revisá internet y volvé a intentar.",
        "no-speech": "No escuché palabras. Tocá el micrófono para volver a intentar.",
      };
      setStatus(messages[event.error] ?? "No se pudo transcribir. Podés volver a intentar o escribir.");
    };
    instance.onend = () => {
      if (recognition.current !== instance) return;
      recognition.current = null;
      clearTimeout(timer.current);
      setListening(false);
      if (!error) setStatus(heard ? "Listo. Revisá el mensaje y envialo a Suri." : "No escuché palabras. Volvé a intentar.");
    };
    try {
      instance.start();
      setListening(true);
      setStatus("Te escucho… Tocá detener cuando termines.");
      timer.current = setTimeout(() => instance.stop(), 60000);
    } catch { cancel(); setStatus("No se pudo iniciar el micrófono. Volvé a intentar."); }
  }
  return { listening, status, cancel, button: <button type="button" className="chat-mic" disabled={disabled} aria-label={listening ? "Terminar dictado" : "Hablar con Suri"} title={listening ? "Terminar dictado" : "Hablar con Suri"} aria-pressed={listening} onClick={toggle}>{listening ? <Square size={18} /> : <Mic size={19} />}</button> };
}

export function SpeakResponse({ text, active }: { text: string; active: boolean }) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const owned = useRef<SpeechSynthesisUtterance | null>(null);
  function stop() {
    if (owned.current) { owned.current = null; window.speechSynthesis?.cancel(); }
    setSpeaking(false);
  }
  useEffect(() => { if (!active) stop(); }, [active]);
  useEffect(() => () => { if (owned.current) window.speechSynthesis?.cancel(); }, []);
  function play() {
    if (speaking) { stop(); return; }
    if (!window.speechSynthesis) { setError("Este navegador no puede leer en voz alta."); return; }
    window.speechSynthesis.cancel();
    const spoken = text.replace(/```[\s\S]*?```/g, " Código disponible en el mensaje. ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*#_`|]/g, " ");
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = "es-AR";
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.lang === "es-AR") ?? voices.find(v => v.lang.startsWith("es")) ?? null;
    owned.current = utterance;
    utterance.onend = () => { owned.current = null; setSpeaking(false); };
    utterance.onerror = (event) => { owned.current = null; setSpeaking(false); if (!["canceled", "interrupted"].includes(event.error)) setError("No se pudo reproducir la voz. Volvé a intentar."); };
    setError(""); setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  return <><button type="button" className="suri-copy" disabled={!active} aria-label={speaking ? "Detener lectura" : "Escuchar respuesta de Suri"} onClick={play}>{speaking ? <Square size={13} /> : <Volume2 size={14} />}{speaking ? "Detener" : "Escuchar"}</button>{error && <p role="status">{error}</p>}</>;
}
