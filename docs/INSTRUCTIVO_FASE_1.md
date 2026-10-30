# Instructivo: fase 1

Procesamiento offline del Excel; no se ejecutan macros ni se usa IA para buscar.
No se procesan la carpeta de 2 GB, PDF, Word, fotos ni videos en esta fase.
La integración al chat queda para la fase 4 (ya implementada).

## Ingesta en Windows (PowerShell)

```powershell
Set-Location "C:\Users\pasante\Desktop\Volksia\WOLSKIA_Integrado\backend"
python -m kb.ingest --xlsm "data\manuales_origen\INSTRUCTIVO DE TRABAJO (MACROS).xlsm"
```

Se extrajo únicamente ese Excel del ZIP provisto a `backend/data/manuales_origen/`.
No se descomprimió el resto. También podés indicar la ruta a otra copia del Excel.
La ingesta reemplaza de forma atómica los fragmentos de la misma fuente (nombre
completo del archivo). No uses el mismo nombre para dos fuentes distintas.
El archivo predeterminado es `backend/data/kb.sqlite`; `--db` permite elegir otro
índice para uso offline. El endpoint consulta únicamente el índice predeterminado.

## Búsqueda

Con el backend local iniciado como siempre:

```powershell
Invoke-RestMethod 'http://127.0.0.1:5050/api/kb/search?q=recepcion'
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:5050/api/kb/search' -ContentType 'application/json' -Body '{"q":"asesor turno"}'
```

Usá el puerto configurado de tu backend si difiere de 5050. Sin índice devuelve
una lista vacía; no crea una base al buscar. No necesita clave de IA. Devuelve
fuente, etapa, paso, responsable, extracto y ranking BM25 (menor valor es mejor).
La consulta une términos con OR tras quitar stopwords, no garantiza relevancia
semántica. Búsqueda local y rate limit existentes; en modo público también exige
la clave del proxy. No se modificó el proxy ni se publicó el endpoint en producción.

## Extracción y privacidad

- Lee celdas, notas XML y textos de formas por las relaciones de cada hoja.
- Las notas conservan su texto completo, dividido en partes de hasta 750 palabras
  con 100 palabras de solapamiento cuando hace falta.
- Usa número de nota o número junto al título; si discrepan, conserva sin asociar.
- Recupera el responsable desde la nota o la etiqueta cercana `Resp.:`.
- Preguntas, SI/NO y formas se guardan con coordenadas sin inferir conexiones.
- Tablas conservan encabezado y filas. Correos y posibles teléfonos se reemplazan
  por `[contacto reservado]`, también en metadatos; se marca `sensible=1`.
- La detección de contactos es heurística: revisar antes de compartir el índice.
  Puede ocultar números que no sean teléfonos y no detecta toda información personal.
- No hay herramientas de ejecución, IA ni evaluación de fórmulas en este módulo.
- La asociación visual es heurística. `sin_asociar=1` preserva texto ambiguo;
  no representa una reconstrucción validada de las rutas del diagrama.

## Archivos internos

El índice, sus archivos auxiliares y `data/manuales_origen/` quedan ignorados por
Git, además de las carpetas `manuales_origen/`, `Manual de Instructivo/` y `*.xlsm`.
No agregues estos archivos con `git add -f`. El índice sigue siendo confidencial,
aunque se hayan ocultado contactos: contiene procedimientos internos. No va al
repositorio público. El despliegue privado se documentará en la fase 4 (ya implementada).

## Verificación

```powershell
python -m unittest tests_kb tests_sheets tests_xlsx_prefix tests_spreadsheet_chat tests_spreadsheet_bulk tests_sheet_reader
```

Los tests usan exclusivamente datos sintéticos. Incluyen asociación de notas,
responsables, decisiones, texto adversarial, búsqueda sin tildes, filtros,
redacción de contactos, reingesta atómica y acceso al endpoint.
