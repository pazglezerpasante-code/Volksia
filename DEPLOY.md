# Publicar WOLSKIA (sin login)

Backend (IA + "Tu espacio") en **Render**, sitio en **Vercel**. Los dos gratis.

## 1. GitHub
Subí TODO el contenido de esta carpeta a un repo nuevo (`render.yaml` tiene que quedar en la raíz).

## 2. Render (backend)
1. render.com → **New → Blueprint** → elegí el repo → Apply.
2. En el servicio `wolskia-backend` → Environment: pegá al menos una clave de IA (`GEMINI_API_KEY`, `GROQ_API_KEY` o `XAI_API_KEY`).
3. Copiá dos cosas: la URL del servicio (`https://wolskia-backend-xxxx.onrender.com`) y el valor de `WOLSKIA_PROXY_SECRET` (se genera solo).

## 3. Vercel (sitio)
1. vercel.com → **Add New → Project** → mismo repo.
2. **Root Directory:** `WOLSKIA_Integrado/frontend`
3. Environment Variables:
   - `WOLSKIA_API` = URL de Render
   - `WOLSKIA_PROXY_SECRET` = el mismo valor de Render
   - `VITE_AUTH_ENABLED` = `false`
4. Deploy. Listo.

## Cómo queda protegido
- El navegador solo habla con Vercel. Vercel le agrega el secreto al pedir a Render; entrar directo a Render da 403.
- Límite 20 pedidos/min por IP y tope de 300 chats por día en todo el sitio (`WOLSKIA_DAILY_CAP`).
- Todos los visitantes son "worker": la IA no puede escribir archivos del servidor.

## Limitaciones (sin login)
- Cada navegador tiene su espacio propio (id al azar). Si borra datos o cambia de dispositivo, pierde su espacio.
- Render gratis duerme tras 15 min: el primer pedido tarda 30-60 s.
- El disco gratis de Render se borra al reiniciar: Tareas/Notas/Eventos pueden perderse. Para que no pase hace falta una base (Supabase) o disco pago.
- No guardes datos sensibles.
