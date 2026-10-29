# SURI — cambios implementados (29/10/2026)

## Cambios realizados sobre el ZIP suministrado

1. El robot animado preexistente permanece en el chat también después del primer mensaje, en formato compacto. Conserva las poses, parpadeos y transiciones existentes, vinculadas al estado `mood` del chat. No se reemplazó el personaje ni se alteraron sus recursos originales.
2. El flujo de planillas distingue fallos de conexión, respuestas HTML en lugar de JSON, HTTP 413, errores de autorización y caídas de backend (502/503/504). Conserva los mensajes de error específicos del backend cuando están disponibles.
3. Si falla el envío de un Excel, el chat restaura la consulta y el adjunto para facilitar el reintento. Se muestra el tamaño de cada adjunto al publicar el mensaje.
4. El lector XLSX rechaza archivos inválidos, cifrados, ZIP con exceso de entradas o relaciones de descompresión anormales; conserva límites previos para evitar sobrecargar el servicio.
5. Flask devuelve un mensaje JSON específico ante HTTP 413.

## Archivos modificados

- `WOLSKIA_Integrado/frontend/src/routes/index.tsx`: avatar animado, recuperación del mensaje/adjunto y tamaños.
- `WOLSKIA_Integrado/frontend/src/components/suri-face.tsx`: modo compacto sin globos obstructivos.
- `WOLSKIA_Integrado/frontend/src/suri-extras.css`: estilos del avatar compacto.
- `WOLSKIA_Integrado/frontend/src/lib/spreadsheet-chat.ts`: manejo diferenciado de errores HTTP y red.
- `WOLSKIA_Integrado/backend/services/sheets.py`: controles de XLSX.
- `WOLSKIA_Integrado/backend/app.py`: respuesta JSON para 413.

## Funciones conservadas

Las herramientas de turnero, asistencia, encuestas, memoria, tareas, notas, chat y las integraciones existentes no fueron reemplazadas. Esto no equivale a una validación funcional integral en producción.

## Pruebas realizadas

- `python -m compileall -q app.py services`: aprobado (sintaxis Python).
- `node --test scripts/api-proxy-shared.test.mjs`: 5/5 aprobadas.
- `node --experimental-strip-types --test scripts/suri-worker-memory.test.mjs`: 4/4 aprobadas.

No se pudo ejecutar la suite de Flask ni un build completo de React sin instalar las dependencias del proyecto en este entorno. Tampoco se validó el despliegue en Vercel/Render. Los cambios deben probarse en staging antes de publicar.

## Lo pendiente

La arquitectura de archivos grandes (500 MB), las cargas reanudables, los trabajos de fondo y una matriz completa de más de 50 emociones requieren rediseño con almacenamiento, autorización, mediciones y pruebas. No se afirman como implementados.
