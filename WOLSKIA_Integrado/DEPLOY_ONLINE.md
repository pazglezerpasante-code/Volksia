# Wolskia online (sin login) — guía de publicación

Dos piezas, las dos gratis para empezar:

| Pieza | Dónde | Qué es |
|---|---|---|
| Backend (IA + «Tu espacio») | **Render** | `WOLSKIA_Integrado/backend` (Flask) |
| Sitio (la página que ve la gente) | **Vercel** | `WOLSKIA_Integrado/frontend` |

El sitio le habla al backend **por el servidor de Vercel**, que agrega una clave secreta.
El navegador nunca ve esa clave ni la URL del backend, y el backend rechaza (403) a
cualquiera que entre directo. Así no hace falta login y tus claves de IA no quedan expuestas.

## 1. Backend en Render
1. En render.com: **New > Blueprint** y elegí este repositorio. Detecta `render.yaml` solo.
2. Cuando pida variables, cargá `GEMINI_API_KEY` (y `GROQ_API_KEY` si tenés). Dejá `SUPABASE_*` vacío por ahora.
3. Esperá el deploy. Abrí `https://TU-SERVICIO.onrender.com/api/health`: tiene que mostrar `"ok": true`.
4. En el servicio > **Environment**, copiá el valor de `WOLSKIA_PROXY_SECRET` (lo generó Render). Lo vas a necesitar en Vercel.

## 2. Sitio en Vercel
1. En vercel.com: **Add New > Project**, elegí este repositorio.
2. **Root Directory:** `WOLSKIA_Integrado/frontend`. Node.js Version: 22.x.
3. En **Environment Variables** agregá:
   - `WOLSKIA_API` = `https://TU-SERVICIO.onrender.com`
   - `WOLSKIA_PROXY_SECRET` = el mismo valor que copiaste de Render
4. **Deploy.** Al terminar, Vercel te da la dirección pública del sitio.

Si el build falla, copiá el final del log y pasámelo.

## 3. «Tu espacio» que no se borre (recomendado)
En el plan gratis de Render el disco se borra cuando el servicio se reinicia o se duerme, y se perderían tareas y notas.
Para guardarlas en Supabase:
1. Supabase > **SQL Editor** > pegá el contenido de `backend/supabase_schema.sql` > **Run**.
2. Supabase > Project Settings > API: copiá la **Project URL** y la clave **service_role** (secreta).
3. En Render > Environment cargá `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` y guardá (se reinicia solo).

Sin esas dos variables, funciona igual pero con el disco temporal.

## 4. Que no tarde en despertar (opcional)
Render gratis duerme el backend a los 15 minutos sin uso y la primera consulta tarda ~30–60 s
(el sitio avisa y se reintenta). Para evitarlo, creá un monitor gratis en uptimerobot.com que abra
`https://TU-SERVICIO.onrender.com/api/health` cada 5 minutos.

## Qué protege y qué NO (sin login)
Protege:
- Nadie puede usar el backend saltándose el sitio (candado con clave secreta).
- La IA no puede escribir ni modificar archivos del servidor.
- Límite por IP y **tope global diario** (`WOLSKIA_GLOBAL_DAILY_LIMIT`, 300 por defecto) para que nadie gaste tu cuota de IA.
- Los identificadores cortos o genéricos (`default`, `admin`) no se aceptan.

No protege:
- **Cualquier persona con el link puede chatear con la IA** (hasta el tope diario).
- «Tu espacio» se separa **por navegador**, no por persona. Quien borre los datos del navegador o cambie de dispositivo ve un espacio vacío, y no hay forma de recuperarlo.
- No guardes datos sensibles (contraseñas, datos personales de terceros, información confidencial de la empresa).
Si más adelante necesitás cuentas, hay que agregar login real.

## Variables (resumen)
| Dónde | Variable | Para qué |
|---|---|---|
| Render | `WOLSKIA_PUBLIC_MODE=1` | activa las protecciones (ya viene en `render.yaml`) |
| Render | `WOLSKIA_PROXY_SECRET` | clave secreta compartida |
| Render | `GEMINI_API_KEY` / `GROQ_API_KEY` | IA |
| Render | `WOLSKIA_GLOBAL_DAILY_LIMIT` | tope diario de consultas |
| Render | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | guardar «Tu espacio» (opcional) |
| Vercel | `WOLSKIA_API` | URL del backend |
| Vercel | `WOLSKIA_PROXY_SECRET` | la misma clave secreta |

## Probar todo en tu PC
- Frontend: `cd frontend`, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- Backend: `cd backend`, `pip install -r requirements.txt`, `python tests_public.py`, `python tests_api.py`, `python tests_agent.py`, `python tests_ai.py`.
