# WOLSKIA Studio Pro — asistente IA local

Asistente conversacional profesional (Gemini + búsqueda web gratuita + conocimiento de herramientas).

## Inicio rápido
1. Configurá rutas en `config.json`.
2. Copiá `.env.example` → `.env` y poné `GEMINI_API_KEY` + `GEMINI_MODEL=gemini-3.5-flash-lite`.
3. Ejecutá `INICIAR_WOLSKIA.bat` → http://127.0.0.1:5050

## Qué incluye esta versión Pro
- Clasificación de intención (herramientas / datos en vivo / código / análisis / general)
- Búsqueda web gratuita: dólar (dolarapi), clima (wttr.in), noticias (Google News RSS), Wikipedia
- Conocimiento de proyectos: catálogo + lectura de README locales
- Fallback automático entre modelos Gemini si uno falla
- Historial con resumen extractivo en conversaciones largas
- Rate limits locales, validación de mensajes, manejo de errores
- UI con render básico de Markdown (código, negritas, listas)
- Pruebas: `python tests_ai.py`

## Variables de entorno
| Variable | Uso |
|----------|-----|
| GEMINI_API_KEY | Clave Google AI Studio |
| GEMINI_MODEL | Modelo preferido (fallback interno si falla) |
| GROQ_API_KEY | Opcional |
| GROQ_MODEL | p.ej. openai/gpt-oss-20b |

## Límites
- Gemini free tier: cuotas variables (ver AI Studio). Search grounding tiene cupo diario.
- Fuentes web propias (dólar/clima/news) no dependen de ese cupo.
- Solo escucha en 127.0.0.1. No publicar sin autenticación.

## Seguridad
Claves solo en `.env`. No las subas a Git. No pegues claves en el chat.

## Agente con herramientas (v5)
WOLSKIA ahora **actúa** además de conversar (function calling con Gemini, Groq y xAI):

**Tu espacio** — al pedir *agregar / editar / eliminar* una Tarea, Nota o Evento, la IA llama a
`task_*`, `note_*` o `event_*` y el servidor guarda en `data/espacio.json` (por usuario). La UI usa el mismo almacén
(`/api/space/*`), así que ambos lados siempre ven lo mismo.

**Archivos** — `files_list`, `file_read`, `file_edit` (reemplazo exacto, cambio mínimo) y `file_create`,
solo dentro de las carpetas de `config.json → tool_roots`. Seguridad: sin `..`/rutas absolutas/symlinks hacia afuera,
`.env`/claves/`app.py`/`services/`/`data/` bloqueados, solo texto, respaldo automático en `data/backups/`,
y solo el rol `admin` escribe (`WOLSKIA_WORKERS_CAN_WRITE=1` para abrirlo).

**Cómo se garantiza que use la herramienta (3 capas)**
1. System prompt con reglas explícitas (`services/prompts.py`).
2. Intención clara → se *fuerza* function calling en la primera vuelta (`services/intents.py`: Gemini `mode=ANY`, OpenAI `tool_choice=required`).
3. Red de seguridad: si el modelo dice «listo, lo agregué» sin llamar a ninguna herramienta, se reintenta forzado; si insiste, no se muestra la afirmación falsa.

Documentación: `docs/system_prompt.md`, `docs/tools.schema.json`. Pruebas: `python tests_agent.py && python tests_api.py && python tests_ai.py`
