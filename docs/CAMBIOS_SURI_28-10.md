# Cambios del 28 de octubre de 2026

Archivos nuevos (frontend/src):
- components/suri-face.tsx — Suri animado en SVG: los ojos siguen el cursor (con perspectiva), parpadea, mira a los costados si no mueves el mouse, y cambia de cara según el estado (escucha, piensa, responde, listo, alerta). Un clic la hace saludar.
- components/bubble-dock.tsx — Burbujas de Tareas y Notas (reemplazan la columna derecha). Al tocar una se abre su tarjeta con lista, tildes animados y agregado rápido.
- components/about-page.tsx — Página "Acerca de". Todo el texto está en el objeto ABOUT al principio del archivo; lo que dice [entre corchetes] lo completás vos.
- suri-extras.css — estilos de todo lo anterior + botón animado (.suri-cta).

Modificados: routes/index.tsx, styles.css (importa suri-extras.css), quick-create.tsx, workspace-interactions.tsx, space-context.tsx, workspace-notices.ts.

Otros cambios:
- Botón "Nueva tarea" (y Agregar/Guardar en tareas, notas y calendario) ahora es .suri-cta, con animación; el formulario se despliega con transición.
- Se quitaron todos los textos "Guardado en este dispositivo" / "En este dispositivo".
- Menú: nueva opción "Acerca de" (también en el celular, que pasa a 5 botones).

Para volver al robot de imagen en la bienvenida: en routes/index.tsx, en el bloque suri-chat-greeting, reemplazar <SuriFace …/> por la <img className="suri-greeting-robot" …/>.

Pendiente de revisar en tu compu (no pude correr el build acá porque no tengo acceso a npm): npm run typecheck y npm run build.

## Suri con el robot de imagen (continuación)
- public/robot/: las 6 imágenes + versiones `-ne` (misma pose con los ojos pintados borrados). components/suri-face.tsx pone ojos animados encima (siguen cursor/toque, parpadean, se cierran al dormir). La boca no se tocó.
- Celular: saluda al abrir, mira alrededor, se estira, bosteza y se duerme (zZz); se despierta al tocar/escribir. Toque en Suri = reacciona. Giroscopio opcional (iOS pide permiso tras un toque). Respeta prefers-reduced-motion y se pausa con la pestaña oculta. Tiempos y frases editables arriba de suri-face.tsx (TIEMPOS, FRASES).
- Burbujas y tarjetas de Tareas/Notas usan las variables de suri-theme.css.
- Tareas: el tilde ahora es un botón .sp-check (círculo de 24×24 fijo, misma animación del tilde).
