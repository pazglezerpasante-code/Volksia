# SURI — implementación y auditoría

Fecha: 23 de octubre de 2026.

## Actualización: Excel desde el chat

Se retiraron de la interfaz el selector de conversaciones, los controles de memoria y la sección Excel. Se mantuvo la lógica anterior donde corresponde; no hay una nueva pestaña Excel. El menú lateral se contrae automáticamente al entrar a Herramientas.

El chat ahora crea planillas desde pedidos en español y modifica archivos XLS/XLSX adjuntos mediante `POST /api/ai/sheets/chat` (multipart: `message`, `history`, `file` opcional). El modelo configurado propone un plan JSON; un ejecutor Python valida y aplica exclusivamente operaciones declaradas, sin ejecutar código del modelo. La respuesta incluye vista previa, resumen de operaciones realmente ejecutadas y un XLSX temporal descargable. El archivo activo se conserva en memoria del navegador para seguir editándolo durante la sesión; «Quitar» lo desvincula. El original no se sobrescribe.

Se admiten creación de hojas/tablas de datos, edición de celdas, nuevas filas y columnas, actualización por encabezado y coincidencia de valor, reemplazos, ordenamiento y eliminación de filas en tablas simples, y color de encabezados. Se permiten fórmulas locales simples (SUM/AVERAGE/MIN/MAX/COUNT/COUNTA/IF/ROUND), sin ejecutar ni recalcularlas en el servidor. Excel las recalcula al abrir. No se implementaron macros, gráficos ni tablas dinámicas.

XLS requiere `xlrd>=2.0.1,<3.0`, agregado a requirements.txt. Se convierte a XLSX: valores, fechas, formatos numéricos y anchos de columna; fórmulas antiguas como valores guardados. Macros, gráficos y estilos avanzados de XLS no se conservan. Para XLSX se usa el lector existente de openpyxl y se conservan fórmulas/estilos compatibles; vínculos externos y objetos avanzados no se garantizan.

Límites: archivos y resultado de hasta 8 MB, 100.000 celdas, 200 columnas, hasta 30 hojas; 50 acciones por pedido y 10 hojas nuevas por creación. Solo se envían al proveedor de IA los encabezados y una vista acotada de hasta 51 filas por hoja (máximo aproximado de 14.000 caracteres de celdas), más el pedido y el historial corto. El servidor no persiste las planillas. Comparaciones por valor permiten editar filas fuera de la vista previa sin adivinar coordenadas.

Validaciones nuevas: 22 pruebas de planillas por chat (incluidos XLS y XLSX binarios reales), 3 pruebas TypeScript de detección de pedidos, y 77 pruebas de backend en total. Se comprobó en navegador con IA real la creación de Papa/Pepe/Pipi/Popo, la edición posterior de Horas/Turno y la carga/edición de un XLS antiguo. La descarga del navegador fue rechazada por su control de permisos durante QA: no se reintentó ni se sustituyó por otra vía; exportación/lectura del XLSX validada por pruebas de backend. La carga del XLSX de prueba en la vista compilada también fue rechazada por permisos del navegador: no se reintentó por otra vía. El compilado renderiza y pasa typecheck/build; la carga/edición multipart de XLSX está verificada en pruebas del backend.

Los apartados siguientes describen la implementación anterior y su auditoría original; los cambios de este apartado prevalecen.


## Punto de partida

La carpeta recibida es una copia del proyecto sin directorio `.git`; `git status` devuelve «not a git repository». No se creó una rama ni se publicó a producción. Los archivos principales originales (`index.tsx`, `styles.css`, `app.py`) se copiaron a `.suri-backup/` antes de editarlos. No se recibió la captura mencionada en el prompt: se inspeccionaron la interfaz ejecutada y los recursos existentes del robot.

Stack: React 19, TanStack Start/Router, Tailwind 4 y Vite; backend Flask/Python. Configuración existente de Vercel y Render conservada. El AGENTS.md del frontend contiene instrucciones para un entorno Grok/Linux que no coincide con esta computadora Windows; se conservaron los puentes y archivos de plataforma existentes.

## Inventario conservado

| Función | Implementación existente |
|---|---|
| Chat real | Gemini, Groq y xAI, selección y fallback en `services/ai_service.py` y `services/agent.py` |
| Herramientas del agente | Registro estructurado, validaciones y ejecutores en `services/agent_tools.py`; tareas, notas, eventos y archivos |
| Memoria | Opcional y local en `worker-memory.ts`; conserva un historial acotado del chat activo, sin planillas |
| Tareas, notas y agenda | CRUD compartido con el agente, JSON local o Supabase según configuración |
| Turnero, asistencia y encuestas | HTML originales de `public/suri-tools/`, ejecutores reales en `workspace-runner.ts` |
| Centro de herramientas | Workspace externo embebido, conservado como opción del catálogo |
| Archivos | Sandbox del backend con restricciones de rutas, extensiones y escritura |
| Identidad | Imágenes originales del robot, incluida la insignia del pecho y sus estados |

## Cambios realizados

- Paleta solicitada, navegación lateral expandible, estados activos y encabezado compacto. CSS nuevo en `src/workspace.css`, separado del sistema heredado.
- Chat con contexto ocultable, conversaciones independientes durante la sesión, copia de respuestas y cancelación de la recepción mediante AbortController. Cancelar no garantiza detener el procesamiento ni la facturación del proveedor.
- El chat permanece montado al cambiar de sección: navegar a tareas o herramientas no pierde la conversación de la sesión.
- Estado real de configuración del proveedor obtenido del backend; no se presenta como una comprobación de disponibilidad del modelo.
- Catálogo con búsqueda que abre el centro externo o los módulos locales reales de turnero, encuestas y asistencia.
- Visor de planillas accesible desde navegación y desde adjuntos XLSX/CSV del chat; nombre, tamaño, hojas, primeras 50 filas de datos y tablas con desplazamiento propio.
- Operaciones deterministas en el backend, sin ejecutar código generado ni enviar el archivo a un modelo externo.
- Cambios presentados en una copia temporal: confirmación al descargar y conservación del original. El resultado XLSX se vuelve a abrir para verificarlo.
- Respeto de movimiento reducido, controles táctiles, etiquetas y navegación por teclado.
- Corrección del aislamiento de `tests_online.py`: usaba variables de entorno al importar y referencias a controles retirados, contaminando otras pruebas.

## Operaciones de planillas

Se admiten XLSX y CSV UTF-8. XLS sigue disponible únicamente en los flujos especializados existentes; el nuevo visor no lo admite. El endpoint es `POST /api/ai/sheets` con multipart (`file`, `sheet`, `command`).

Ejemplos, usando los encabezados exactos del archivo:

```text
sumar Ingresos
sumar Ingresos por Persona
buscar duplicados
cambiar B2 por 125
cambiar A2 por Ana
ordenar por Fecha
filtrar Fecha entre 2026-10-01 y 2026-10-08
```

El ordenamiento y los filtros crean una hoja nueva. Las fechas aceptan valores de fecha de Excel, AAAA-MM-DD o DD/MM/AAAA. Cada solicitud parte del archivo cargado original: para encadenar cambios hay que descargar y cargar la nueva versión. Se rechazan encabezados ambiguos, operaciones desconocidas, escritura de fórmulas y sobrescritura de fórmulas. Ordenar o filtrar hojas con fórmulas o celdas combinadas se rechaza para evitar referencias incorrectas.

Límites: 8 MB por archivo, 40 MB descomprimidos, 100.000 celdas, 200 columnas, 100 grupos de resumen y 20 solicitudes por minuto/IP/proceso, con dos procesamientos simultáneos por proceso. El hosting puede imponer límites más bajos. No hay almacenamiento compartido de archivos ni URL pública de documentos; el resultado vuelve directamente a la misma solicitud. El límite de tasa es local al proceso, no distribuido entre workers.

Se conservan formatos y fórmulas compatibles con openpyxl. No hay motor de recálculo. Macros, vínculos externos y objetos avanzados no se garantizan. CSV se convierte a XLSX; las cadenas que parecen fórmulas permanecen texto.

## Verificaciones ejecutadas

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Correcto |
| `npm run build` | Correcto; genera salida Vercel. Advertencias de dependencias sobre `use client`; sin error de compilación |
| Backend: `python -m unittest discover -s WOLSKIA_Integrado/backend -p 'tests_*.py'` | 55 pruebas correctas, incluidas 16 de planillas |
| `npm test`, pruebas TypeScript | 59 correctas |
| Scripts `.test.mjs` ejecutados con lista explícita en PowerShell | 206 ejecutados: 195 correctos y 11 fallidos heredados |
| Memoria local | 4 pruebas correctas incluidas en los scripts anteriores |
| Chat en navegador | Consulta real de prueba respondida por Gemini: «prueba de conexión SURI.» |
| Carga en navegador | CSV ficticio cargado, hoja y datos visibles; endpoint respondió 200 |
| Planillas en compilado | Suma 35 y vista previa de B2 de 10 a 125 comprobadas en navegador. Generación XLSX validada por pruebas; descarga del navegador pendiente de verificación completa |
| Render del compilado | Contenido visible en escritorio y móvil, backend configurado y sin errores de consola en la revisión |
| Diseño del chat | Anchos 320, 360, 375, 390, 430, 768 y 1440 px: sin desbordamiento horizontal; compositor dentro de la pantalla |

Las pruebas de planillas cubren importación, suma, agrupación, fechas inclusivas, ordenamiento, duplicados, edición, exportación, preservación de original/estilos/fórmulas, fórmulas no evaluadas, inyección, formatos inválidos, hojas inexistentes y tasa de solicitudes. Las verificaciones automáticas del agente usan proveedores simulados; la consulta real se comprobó por separado en navegador.

Capturas reales: `screenshots/suri-desktop.png` y `screenshots/suri-mobile.png`. La confirmación de cambios se presenta dentro de la interfaz, seguida de un enlace de descarga, para evitar depender de diálogos nativos.

El patrón de scripts de `npm test` no descubre pruebas `.mjs` correctamente en esta instalación Windows: por eso se ejecutaron con una lista explícita. Los 11 fallos completos están en `WOLSKIA_Integrado/frontend/test-results-windows.log`: referencias a `.grok/skills/og` y app-env ausentes, creación de symlinks sin permiso y expectativas heredadas de tarjetas Open Graph. No se ocultaron ni marcaron como aprobados. Los scripts `browser-smoke.mjs` y `preview:restart` tienen rutas `/workspace` y dependencias Linux; se utilizó el navegador conectado y `npm run preview` para esta revisión Windows.

## Instalación y configuración

Requisitos usados en esta comprobación: Node 24.21 y Python 3.12. El proyecto conserva sus requisitos documentados de Node 22+ y Python 3.10+.

Desde `WOLSKIA_Integrado/backend`:

```powershell
python -m pip install -r requirements.txt
python app.py
```

Desde `WOLSKIA_Integrado/frontend`, en otra terminal:

```powershell
npm ci
npm run dev
```

También se conserva `WOLSKIA_Integrado/INICIAR_TODO.bat`. Para revisar el compilado, configurar `WOLSKIA_API` apuntando al backend y ejecutar `npm run preview -- --host 127.0.0.1 --port 8081`.

Las variables de ejemplo, sin secretos, están en `SURI_ENV.example`. Las credenciales reales permanecen en el servidor; nunca usar prefijo VITE para claves o secretos.

Despliegue: conservar `render.yaml` y las instrucciones de `WOLSKIA_Integrado/DEPLOY_ONLINE.md`. Instalar la nueva dependencia openpyxl en el backend, compilar frontend y desplegar ambas piezas de forma coordinada. Configurar `WOLSKIA_API` y el mismo `WOLSKIA_PROXY_SECRET` en los dos servicios; `WOLSKIA_PUBLIC_MODE=1` en el backend público. No se efectuó ese despliegue.

## Riesgos y alcance pendiente

- El perfil del navegador no es autenticación. Se conservó el comportamiento existente de tareas/notas/agenda. Antes de usar datos empresariales sensibles hace falta identidad verificada, autorización por usuario y revisión de la política de datos de cada proveedor. El identificador de espacio no proporciona aislamiento empresarial.
- Las conversaciones separadas duran la sesión; únicamente el chat activo puede persistirse mediante la memoria local opcional existente. No hay sincronización de conversaciones entre dispositivos.
- Las instrucciones de Excel del visor usan una gramática controlada: no comprenden cualquier solicitud libre. Agregar registros, inferir columnas, comparar períodos y construir fórmulas requieren ampliaciones. El chat mantiene sus herramientas especializadas y ofrece abrir el visor desde el adjunto; no se añadió traducción de instrucciones de planillas por function calling del modelo.
- No se creó un gestor autenticado de archivos ni proyectos nuevos, buscador global, notificaciones o controles ficticios de configuración.
- No se certificó cada flujo interno de las aplicaciones HTML de herramientas. Se conservan los ejecutores y las comprobaciones de puentes existentes.
- Las pruebas de anchos verificaron el chat; falta una matriz completa de cada formulario y herramienta, teclado virtual real y dispositivos físicos.
- Los archivos se procesan sin guardarse en disco en este flujo, pero sí se transmiten al backend de la aplicación. Revisar políticas corporativas antes de cargar información sensible.
- Los cambios son una implementación concreta y verificada de estas áreas; no constituyen la totalidad de los criterios empresariales del prompt ni una certificación de seguridad.
