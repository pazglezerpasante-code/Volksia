# Instructivo: fase 2 (PDF y Word offline)

Se agregaron lectores opcionales para PDF y DOCX, sin modificar las dependencias
del servidor ni conectar todavía el manual al chat.

## Usar el entorno offline en Windows

Desde PowerShell:

```powershell
cd "C:\Users\pasante\Desktop\Volksia\WOLSKIA_Integrado\backend"
# Estos dos pasos ya se hicieron en esta PC; solo hacen falta en otra instalación.
python -m venv --system-site-packages data/kb-offline-env
& "data/kb-offline-env/Scripts/python.exe" -m pip install pypdf python-docx

# Repetí este comando para actualizar o retomar una ingesta interrumpida.
& "data/kb-offline-env/Scripts/python.exe" -m kb.ingest --folder "data/manuales_origen"
```

También se acepta la ruta a una carpeta externa, con recorrido recursivo.
`--folder` espera una carpeta, no un ZIP. Para el material adjunto se extrajeron
únicamente los tres PDF y un DOCX (aproximadamente 1,6 MB), manteniendo las
subcarpetas dentro de `data/manuales_origen`. El resto del ZIP no se extrajo.
No hay subidas, llamadas a IA ni copia de fotos/videos.

El entorno virtual y el índice están en `data/`, excluido de Git. No se cambió
`requirements.txt`. Si se ejecuta con el Python común sin lectores opcionales,
se omiten esos formatos con un aviso. No impide iniciar Flask.

## Reanudación, duplicados y errores

- SHA-256 se calcula en bloques de 1 MB, sin cargar la carpeta en memoria.
- Se procesa un archivo por vez y se confirma una transacción por archivo.
- El índice guarda huella, opciones, estado y referencias a duplicados en
  `ingestion_files`; registra páginas pendientes y errores en `ingestion_issues`.
- Los archivos terminados y sin cambios no se vuelven a parsear. Las copias con
  igual contenido y opciones apuntan a la fuente canónica y no duplican texto.
- Si un archivo cambia, reemplaza sus fragmentos. Si falla o se interrumpe durante
  la lectura, conserva la versión anterior y revierte los fragmentos incompletos.
- Los archivos rotos o sin dependencia se informan y se reintentan en otra pasada.
- Los archivos eliminados de origen NO se purgan automáticamente del índice.
- Las fuentes se identifican con nombre de carpeta raíz más ruta relativa. No
  uses dos carpetas raíz distintas con el mismo nombre en el mismo índice.
- No sigue enlaces simbólicos. Los tipos no soportados se anotan como omitidos.

## Páginas, títulos y OCR opcional

PDF conserva página (numerada desde 1), título inicial y fragmentos de hasta
750 palabras con solapamiento. DOCX conserva títulos, párrafos y texto de tablas,
sin inventar números de página (dependen de cómo se renderice Word).
La búsqueda agrega `page` y `path_relativo` sin quitar los campos previos.

Una página sin texto queda como `requiere_ocr`. De forma predeterminada NO se
rasteriza ni se ejecuta OCR. Para habilitarlo explícitamente:

```powershell
& "data/kb-offline-env/Scripts/python.exe" -m pip install pymupdf pytesseract Pillow
& "data/kb-offline-env/Scripts/python.exe" -m kb.ingest --folder "data/manuales_origen" --ocr
```

Además se necesita Tesseract instalado con el idioma `spa` y accesible desde PATH.
La fase 2 se verificó con extracción de texto; no se instaló ni probó un motor
Tesseract real. El cambio de flag fuerza una nueva pasada para intentar OCR.
Hay un límite de rasterización de 16 millones de píxeles y 120 segundos por página.
Las páginas con errores se registran sin impedir procesar los otros documentos.

## Privacidad y límites

El contenido del documento es dato: no se ejecutan macros, comandos, instrucciones
ni código incrustado. No se usa ningún proveedor de IA. Se mantiene la redacción
heurística de contactos de la fase 1; no garantiza anonimizar nombres, direcciones
ni toda información personal. El índice y los documentos siguen siendo internos:
no agregarlos a Git ni publicarlos. Los logs también deben manejarse localmente.

Un PDF necesita un lector opcional (`pypdf` o `pymupdf`); Word necesita
`python-docx`. Se limita el contenido descomprimido de DOCX a 80 MB. Cada biblioteca
puede usar memoria para un documento individual; no se garantiza memoria constante
para un PDF/Word excepcionalmente grande. PDF cifrados se omiten.

## Pruebas sintéticas

```powershell
& "data/kb-offline-env/Scripts/python.exe" -m unittest tests_kb_folder tests_kb tests_sheets tests_xlsx_prefix tests_spreadsheet_chat tests_spreadsheet_bulk tests_sheet_reader
```

Cubren PDF/Word reales generados para las pruebas, página sin texto, títulos,
tablas, contacto, duplicados, reanudación, rollback, modificación del origen,
errores por archivo y OCR desactivado por defecto. Con Python sin lectores,
las pruebas que los necesitan se omiten explícitamente.

La pantalla y el chat siguen iguales. Fotos/videos corresponden a la fase 3;
la integración de las respuestas de SURI corresponde a la fase 4 (ya implementada).
