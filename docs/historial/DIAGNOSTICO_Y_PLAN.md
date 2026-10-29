# VOLKSIA: diagnóstico y plan de integración de archivos

Fecha: 26 de octubre de 2026. Estado: auditoría y copia completadas; implementación pendiente de aprobación del alcance que exige el prompt.

## Copia y preservación

- Original: `<ruta-local>/Volksia-main`.
- Copia de trabajo: `<ruta-local>/Volksia-archivos`.
- Se copiaron y compararon por SHA-256 191 archivos. El inventario está en `estado-original.json`, sin contenidos ni valores de credenciales.
- Se excluyeron dependencias instaladas, cachés, compilados, logs, capturas y respaldos históricos de recursos; se conservaron fuentes, recursos usados por la aplicación, configuración, lockfile, pruebas y datos locales presentes en la copia recibida. La copia puede contener datos privados: no es un paquete para publicar.
- No se movieron ni editaron fuentes del original. No se reiniciaron sus servicios para esta auditoría.
- No hay repositorio Git en la carpeta recibida. `git status` y `git log` fallan con `not a git repository`; no puede auditarse historial de commits ni prepararse una rama desde esta copia.
- No se crearon commits ni se hicieron pushes o despliegues.

## Arquitectura encontrada

| Área | Evidencia y comportamiento |
| --- | --- |
| Interfaz | React 19, TanStack Start/Router, Tailwind 4, Vite 8; `frontend/src/routes/index.tsx` reúne el chat y la navegación actual. |
| Backend | Flask y Python; `backend/app.py` expone chat, planillas, herramientas y Tu espacio. |
| IA | `services/ai_service.py` selecciona Gemini, Groq o xAI según claves/configuración. `services/agent.py` implementa adaptadores y llamadas a herramientas. No es necesario cambiar de proveedor. |
| Mensajes | El chat envía JSON a `/api/ai/chat` mediante `src/lib/ai-api.ts`. Hay historial acotado, acciones reales, cancelación y actualizaciones de Tu espacio. |
| Excel | `spreadsheet-chat.ts` y `/api/ai/sheets/chat` reciben un archivo, piden un plan JSON al modelo y ejecutan operaciones limitadas con `spreadsheet_chat.py`. XLS se convierte a XLSX con advertencias. Hay otro endpoint determinista `/api/ai/sheets`, cuya interfaz fue retirada por pedido del usuario. |
| Adjuntos restantes | Se aceptan algunos formatos de texto y se agregan hasta 24.000 caracteres al mensaje. No existe todavía un registro general de adjuntos ni devolución de documentos editados. Los binarios diferentes de Excel no tienen procesadores integrados. |
| Conversación | Estado React conservado al navegar. Memoria local opcional y filtrada en `worker-memory.ts`; sus controles fueron retirados. Los archivos activos y URLs Blob viven en memoria de la página; no sobreviven a una recarga. |
| Identidad y permisos | El producto usa un identificador aleatorio de navegador y no tiene login activo. Hay componentes de autenticación heredados, pero Vercel declara `VITE_AUTH_ENABLED=false`. El identificador no equivale a una identidad autenticada. |
| Protección del backend | `local_only`, candado de proxy en modo público, secreto servidor a servidor, rol worker en público y límites de IA. Las nuevas rutas deben conservar estas protecciones. |
| Descargas | Excel vuelve codificado en la respuesta y el navegador crea una URL Blob. No hay un repositorio público de documentos ni endpoint de descarga por identificador. |
| Datos de Tu espacio | JSON local en `backend/data/espacio.json`; Supabase opcional si están configuradas sus variables. Es un flujo ajeno a los adjuntos y debe preservarse. |
| Herramientas actuales | Turnero, asistencia y encuestas mantienen ejecutores HTML y puentes de mensajes locales. Herramientas abre el centro externo sin los filtros adicionales retirados. |
| Hosting | Frontend Vercel y backend Render, definidos en `vercel.json`, middleware del proxy y `render.yaml`. |

Variables relevantes identificadas en código/configuración: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `XAI_API_KEY`, `XAI_MODEL`, `WOLSKIA_API`, `WOLSKIA_PROXY_SECRET`, `WOLSKIA_PUBLIC_MODE`, `WOLSKIA_ALLOW_REMOTE`, `WOLSKIA_GLOBAL_DAILY_LIMIT`, `WOLSKIA_SPACE_FILE`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SPACE_TABLE`, `HOST`, `PORT`. Sus valores no se registraron en este informe. No se encontraron claves en un `.env` del backend de la copia recibida; sí existe `.env.example`. El entorno de un proceso ya abierto puede contener configuración que no está disponible en los archivos.

## Riesgos concretos

1. Vercel limita los cuerpos de solicitud y respuesta de sus Functions a 4,5 MB. La interfaz actual anuncia 8 MB por planilla; eso no garantiza funcionamiento online. Base64 aumenta el tamaño de una respuesta aproximadamente un tercio. Deben limitarse los bytes reales del conjunto y de la respuesta completa, no solo cada archivo.
2. El proxy actual corta una solicitud al backend a los 55 segundos; el adaptador de IA puede esperar 60 segundos y probar varios modelos. El procesamiento general necesita un presupuesto global menor que el proxy y errores recuperables, sin aumentar tiempos de producción silenciosamente.
3. No hay login real que permita prometer propiedad de archivos entre cuentas. La solución inicial debe ser temporal y privada por sesión, sin introducir enlaces públicos ni un almacén persistente basado solamente en el identificador de navegador.
4. Cambiar los mensajes de texto por un endpoint general de archivos podría romper tareas/notas/eventos o herramientas especializadas. Debe existir una separación explícita y pruebas de enrutamiento; mensajes sin adjuntos siguen usando el contrato vigente.
5. La preservación de objetos avanzados en Office no puede garantizarse por extensión. PDF no es un documento de texto refluible; XLS y DOC antiguos requieren estrategias distintas de XLSX y DOCX.
6. No hay LibreOffice ni Tesseract detectados en PATH. No puede prometerse conversión DOC ni OCR de PDF escaneado sin otra dependencia o servicio.
7. Están disponibles openpyxl, xlrd y Pillow en el intérprete inspeccionado. No están instalados python-docx, python-pptx, pypdf, odfpy, striprtf ni defusedxml; su selección y alta deben formar parte de la implementación, con pruebas y límites.
8. El AGENTS.md del frontend contiene contratos de una plantilla Linux/Grok que no coinciden con Windows. Las habilidades `.grok` referenciadas no forman parte de esta copia. No deben borrarse puentes, middleware ni recursos de plataforma para resolver esa diferencia.

Fuentes de hosting consultadas: [límites de Vercel Functions](https://vercel.com/docs/functions/limitations), [límite del cuerpo de respuesta](https://vercel.com/docs/errors/function_response_payload_too_large), [duración configurable](https://vercel.com/docs/functions/configuring-functions/duration). No se modificaron configuraciones remotas. La URL publicada indicada en el prompt no pudo abrirse con el lector web en esta auditoría; no se presenta como verificado su estado actual ni como equivalente a las fuentes locales.

## Alcance propuesto para aprobar

Implementar incrementalmente dentro del MISMO chat copiado, sin rediseño general, nuevo proveedor obligatorio, almacenamiento pago ni publicación:

| Formato | Alcance a implementar y verificar |
| --- | --- |
| TXT, MD, código y LOG | Lectura, consultas, cambios por operaciones declaradas o contenido completo validado, salida en el formato original. Nunca ejecutar el archivo. |
| JSON, XML, YAML, INI | Lectura y edición con validación sintáctica cuando exista parser seguro. Rechazar XML activo/entidades externas. |
| DOCX | Texto de párrafos y tablas con identificadores de elementos, cambios puntuales y comparación de elementos ajenos al pedido; salida DOCX. No garantizar preservación de todas las funciones avanzadas de Word. |
| XLS/XLSX | Reutilizar el ejecutor actual. Mantener las fórmulas y estilos soportados, asegurar que los cambios estructurales no corrompan referencias; advertir conversión XLS. Añadir análisis y operaciones comunes sin ejecutar código del modelo. |
| CSV/TSV | Lectura con detección controlada de delimitador/codificación; edición, conservación del dialecto cuando se devuelve texto y conversión a XLSX bajo pedido. |
| PDF | Extracción de texto de PDF digital, consultas, resumen exportado a DOCX/TXT y modificaciones explícitas compatibles (por ejemplo, operaciones de páginas). No prometer corrección del texto original conservando maquetación ni OCR sin herramienta disponible. |
| PPTX | Lectura y cambios puntuales de textos/títulos/listas/tablas compatibles. Intentar preservar temas, imágenes, notas y posiciones. Validar paquete y registrar advertencias sobre elementos especiales. |
| ODT/RTF/ODS | Módulos opcionales separados con pruebas de round-trip y advertencias; activar edición solo donde se demuestre conservación aceptable. Si no es viable, informar incompatibilidad o proponer conversión, sin cambio silencioso de fórmulas a valores. |
| PNG/JPEG/WEBP | Validar y extraer metadatos; operaciones reales deterministas disponibles en Pillow (dimensiones, recorte, giro, conversión). No declarar análisis visual semántico ni retoque generativo si no se integra y verifica una capacidad del proveedor actual. |
| SVG | Lectura/edición XML controlada con rechazo de scripts, entidades, eventos y referencias remotas. No mostrar SVG recibido como HTML activo. |
| DOC antiguo | Detección y explicación de conversión necesaria. Sin convertidor seguro disponible, pedir DOCX o PDF. No instalar ejecutables ni servicios pagos automáticamente. |
| Ejecutables, macros, cifrados, dañados o no admitidos | Rechazo explícito con alternativa; nunca ejecución ni falsa confirmación. |

## Estrategia de integración

1. **Registro de adjuntos en el cliente:** IDs criptográficos, relación con la conversación actual, originales inmutables, versiones y archivos activos. Drag-and-drop y pegado de imágenes reutilizan un mismo validador. Separar nombre visible de identificación interna. Límites acumulados y revocación de URLs Blob al quitar/expirar/cerrar.
2. **Transporte existente:** nuevo endpoint bajo `/api/ai/` y el mismo proxy/candado. Mantener `/api/ai/chat`, endpoints Excel y herramientas originales. JSON de entrada de herramientas validado; ningún código generado se ejecuta.
3. **Procesadores:** registro modular por formato, detección real por estructura además de extensión/MIME, extracción con identificadores de elementos y límites. Generación/edición exclusivamente mediante una lista de operaciones de cada procesador.
4. **IA actual:** reutilizar selectores de proveedor y adaptadores; pasar solo contenido necesario y acotado como datos no confiables. Resolver referencias de la conversación; pedir aclaración ante ambigüedad. El resumen de éxito procede del ejecutor y no de una promesa del modelo.
5. **Resultados y seguridad:** respuesta privada en la solicitud que procesó los archivos y descargas Blob de esa sesión; no crear GET público por filename ni guardar archivos de usuarios en disco persistente. Para muchos resultados, devolver salidas individuales y ZIP solo dentro del presupuesto total. Si una futura fase requiere almacenamiento remoto, detenerse y acordar autenticación/propiedad y proveedor antes de implementarlo.
6. **Estados reales:** recibido, analizando, modificando, exportando, validando y listo se emiten únicamente al llegar a cada etapa. Propuesta: eventos de respuesta transmitidos por el proxy existente, tras verificar compatibilidad y timeout; sin temporizadores que simulen avance. Manejar cancelación y desconexión.
7. **Preservación y validación:** abrir el resultado con el parser correspondiente, comparar estructura y contenido no intervenido y rechazar discrepancias no previstas. Mantener original más última versión; explicar limitaciones del formato antes de conversiones con pérdida.
8. **Hosting:** presupuesto inicial propuesto de 3 MB acumulados de entrada, máximo 5 adjuntos, resultado total con margen para Base64/JSON por debajo de 4,5 MB y plazos menores de 55 segundos. Son límites a implementar y medir; no resultados ya comprobados. No aumentar tamaños, tiempos ni servicios de producción sin acuerdo.

La privacidad por sesión no se describirá como autenticación entre cuentas. Si se exige historial de archivos entre dispositivos o descargas permanentes, ese alcance requiere una decisión adicional sobre login y almacenamiento; no se sustituirá por URLs públicas.

## Archivos previstos

Rutas relativas a `WOLSKIA_Integrado/` dentro de la copia nueva:

**Cambios puntuales:**
- `frontend/src/routes/index.tsx`: integración con adjuntos, contexto, eventos y resultados dentro del chat existente.
- `frontend/src/workspace.css`: estilos mínimos para adjuntos, estados y errores accesibles.
- `frontend/src/lib/ai-api.ts`: tipos compartidos cuando sean necesarios; mantener contratos actuales.
- `frontend/src/lib/spreadsheet-chat.ts`: integración compatible con registro general, sin retirar API heredada.
- `frontend/server/middleware/api-proxy.ts`: límites/eventos para nuevas rutas sin alterar otras APIs.
- `backend/app.py`: registro y protección del nuevo flujo.
- `backend/services/spreadsheet_chat.py`, `backend/services/sheets.py`: reutilización y extensiones probadas.
- `backend/requirements.txt`: dependencias de formato seleccionadas y acotadas.

**Módulos nuevos propuestos:**
- `frontend/src/lib/attachments.ts` y sus pruebas: IDs, validación, límites y versiones de conversación.
- `frontend/src/lib/file-chat.ts`: cliente del flujo de archivos y eventos reales.
- `frontend/src/components/chat-attachments.tsx`: selector, drop, pegado, lista y estados.
- `backend/services/file_chat.py`: orquestación y presupuesto de ejecución.
- `backend/services/file_processors/`: contrato, registro, validaciones comunes y módulos text/docx/pdf/pptx/sheets/images/legacy según compatibilidad comprobada.
- `backend/tests_file_chat.py`, `backend/tests_file_security.py` y fixtures pequeños sintéticos por formato.
- Documentación de formatos, límites, configuración, resultados de QA y diferencias respecto del original.

No se prevé reemplazar el router, el shell, los adaptadores de proveedor, las herramientas de Tu espacio, los HTML de herramientas o la identidad del robot.

## Pruebas y puertas de entrega

Línea de base ya ejecutada **en la copia**:

```
python -m unittest discover -p 'tests*.py'
77 pruebas; OK.
```

En esta auditoría no se instalaron dependencias de frontend en la copia ni se ejecutó su build/typecheck. El árbol original de node_modules no se enlazó a la copia para evitar escrituras compartidas. Tampoco se probaron formatos todavía no implementados.

Pruebas previstas al implementar:
- Mensajes normales, historial, tareas/notas/agenda y ejecutores originales sin regresiones.
- Selección, drop, pegado compatible, vista de adjuntos y retiro; móvil/tablet/escritorio.
- Preguntas de lectura sin cambios de archivo; DOCX editado, XLSX con fórmulas, XLS con advertencia, CSV/TSV a XLSX, PDF compatible, PPTX y código modificado.
- Múltiples archivos, referencias por ID/nombre, resultados múltiples y ZIP bajo límites.
- Tamaño acumulado, timeout, cancelación, caída del modelo, resultado inválido y ausencia de falsa confirmación.
- Extensiones falsas, MIME inconsistente, ZIP bombs, path traversal, contenido activo, documentos cifrados, XML peligroso y prompt injection.
- Privacidad: no existe descarga pública por nombre/ID; archivos/versiones de otra conversación no accesibles desde el registro de la sesión; resultados no almacenados en logs o carpetas públicas.
- Lectura de cada resultado por una biblioteca compatible y comparación de celdas, fórmulas, párrafos, tablas, slides y elementos no solicitados.
- Build y typecheck, pruebas relevantes de scripts y frontend, navegador real en dev y compilado, descarga e importación del archivo resultante cuando el permiso del navegador lo permita.

Si el navegador rechaza permisos, registrar qué prueba queda pendiente; no eludir el rechazo. No presentar un render, un enlace visible o una respuesta del modelo como evidencia suficiente de descarga completa.

## Aprobación antes de implementar

El archivo `message (3).txt` termina solicitando: «Después, presentá un diagnóstico y un plan de cambios concreto» y «Una vez aprobado el alcance, implementá la solución». Este documento y la copia verificable completan esas acciones previas. Se solicita aprobar el alcance y las limitaciones de la tabla anterior para iniciar código y dependencias, exclusivamente en la carpeta nueva.
