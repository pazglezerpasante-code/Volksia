import { Bot, FileSpreadsheet, Lightbulb, ListChecks, Mic, Sparkles, Wrench } from "lucide-react";
import { SuriFace } from "@/components/suri-face";
import type { CSSProperties, ReactNode } from "react";

/* ════════════════════════════════════════════════════════════
   ACERCA DE SURI — todo el texto está acá arriba, en ABOUT.
   Editá los textos de este objeto y listo; no hace falta tocar el diseño.
   Lo que dice [entre corchetes] es para que lo completes vos.
   ════════════════════════════════════════════════════════════ */
const ABOUT = {
  kicker: "Acerca de",
  title: "Hola, soy Suri",
  lead: "Un asistente de trabajo con IA que te ayuda a organizar tareas, guardar ideas y resolver planillas desde un chat.",

  who: {
    title: "Quiénes somos",
    text: "Somos Dylan Paz y Tomás Glezer, pasantes de Organización Sur Volkswagen. Creamos Suri para simplificar el trabajo diario, reducir las tareas manuales y dedicar más tiempo a lo importante.",
    cards: [
      { icon: "bot", title: "Un asistente, no un buscador", text: "Le hablás como a una persona y hace cosas: crea tareas, guarda notas y arma planillas." },
      { icon: "list", title: "Pensado para el día a día", text: "Tareas de hoy y notas rápidas siempre a mano, en burbujas que se abren con un toque." },
      { icon: "sheet", title: "Excel sin dolor", text: "Pedile una planilla o adjuntá una y decile qué cambiar. Te devuelve el archivo listo para bajar." },
    ],
  },

  how: {
    title: "Cómo lo hicimos",
    text: "Suri se construyó por etapas, probando cada pieza con el uso real antes de sumar la siguiente.",
    steps: [
      { when: "Etapa 1", title: "La idea", text: "La idea de Suri surgió al ver cuánto tiempo dedicábamos a completar y modificar planillas manualmente. Queríamos agilizar esas tareas y ofrecer una forma más simple e interactiva de resolverlas: pedir lo que necesitamos a través de una conversación." },
      { when: "Etapa 2", title: "El cerebro", text: "Un servidor en Python conecta el chat con modelos de IA (Gemini, Groq y xAI) y elige automáticamente uno que responda." },
      { when: "Etapa 3", title: "La cara", text: "La interfaz está hecha con React: un chat limpio, tareas, notas y un menú que se adapta a la compu y al celular." },
      { when: "Etapa 4", title: "Las herramientas", text: "Se integraron las herramientas de trabajo (turnero, asistencia, encuestas) y la creación y edición de planillas desde el chat." },
      { when: "Etapa 5", title: "Darle vida", text: "El rediseño de octubre 2026 sumó burbujas, animaciones y una Suri que te sigue con la mirada." },
    ],
  },

  stack: {
    title: "Con qué está hecho",
    chips: ["React 19", "TanStack Router", "Tailwind CSS 4", "Vite", "Python · Flask", "Gemini", "Groq", "xAI", "Excel (XLS / XLSX)"],
  },

  thanks: {
    title: "Contacto y agradecimientos",
    text: "Dylan Paz: Dylancitomar23@gmail    Tomas Glezer: glezertomas@gmail.com",
  },
} as const;

const ICONS: Record<string, ReactNode> = {
  bot: <Bot size={22} />,
  list: <ListChecks size={22} />,
  sheet: <FileSpreadsheet size={22} />,
};
const TINTS: (CSSProperties & Record<"--b1" | "--b2", string>)[] = [
  { "--b1": "#5b97ff", "--b2": "#2a55d6" },
  { "--b1": "#a78bfa", "--b2": "#6a47d6" },
  { "--b1": "#34d3a0", "--b2": "#138a68" },
];

export function AboutPage() {
  return (
    <div className="suri-about">
      <header className="ab-hero ab-rise" style={{ "--i": 0 } as React.CSSProperties}>
        <div>
          <div className="ab-kicker">{ABOUT.kicker}</div>
          <h1>{ABOUT.title}</h1>
          <p className="ab-lead">{ABOUT.lead}</p>
        </div>
        <SuriFace mood="idle" size={190} />
      </header>

      <section className="ab-rise" style={{ "--i": 1 } as React.CSSProperties}>
        <h2>{ABOUT.who.title}</h2>
        <p>{ABOUT.who.text}</p>
        <div className="ab-grid">
          {ABOUT.who.cards.map((c, i) => (
            <article className="ab-card" key={c.title} style={TINTS[i % TINTS.length]}>
              <span className="ab-ico">{ICONS[c.icon]}</span>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ab-rise" style={{ "--i": 2 } as React.CSSProperties}>
        <h2>{ABOUT.how.title}</h2>
        <p>{ABOUT.how.text}</p>
        <ol className="ab-steps">
          {ABOUT.how.steps.map((s, i) => (
            <li key={s.title}>
              <span className="ab-n">{i + 1}</span>
              <div><h3>{s.title}<small>{s.when}</small></h3><p>{s.text}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ab-rise" style={{ "--i": 3 } as React.CSSProperties}>
        <h2>{ABOUT.stack.title}</h2>
        <div className="ab-chips">{ABOUT.stack.chips.map((c) => <span key={c}>{c}</span>)}</div>
      </section>

      <section className="ab-rise" style={{ "--i": 4 } as React.CSSProperties}>
        <h2>{ABOUT.thanks.title}</h2>
        <p>{ABOUT.thanks.text}</p>
      </section>

    </div>
  );
}

/* Íconos importados para poder cambiarlos fácil en ABOUT */
export const ABOUT_ICON_SET = { Lightbulb, Mic, Sparkles, Wrench };
