# Instructivo: fase 3 — fotos y videos como referencias

La ingesta agrega referencias por nombre, carpeta, extensión, tamaño y fecha.
No interpreta el contenido visual ni publica, copia o sirve los binarios.
La integración al chat se documenta en `INSTRUCTIVO_FASE_4.md`.

## Indexar el ZIP real sin extraer los medios

```powershell
cd "C:\Users\pasante\Desktop\Volksia\WOLSKIA_Integrado\backend"
& "data/kb-offline-env/Scripts/python.exe" -m kb.ingest --media-zip "C:\Users\pasante\Desktop\proyectos con luis\Manual de Instructivo.zip"
```

`--media-zip` lee solo el directorio central del ZIP: nombres, carpetas, tamaños,
CRC y fechas. No abre miembros ni descomprime videos/fotos. No vuelve a ingerir
PDF, Word ni Excel: las fases anteriores conservan sus fragmentos.
Se registraron 49 referencias del ZIP provisto: 31 imágenes (incluye un icono)
y 18 videos. La segunda pasada las reconoce sin duplicarlas.
La fecha del ZIP no incluye zona horaria: se indica explícitamente.

## Medios en una carpeta local

```powershell
& "data/kb-offline-env/Scripts/python.exe" -m kb.ingest --folder "C:\ruta\manuales"
```

El mismo recorrido incluye PDF/Word y ahora referencias de imágenes y videos.
Para las referencias básicas no se abre el binario: se usa tamaño y fecha de
modificación de alta resolución para detectar cambios. La fecha se informa en UTC.
Dos copias en carpetas distintas conservan referencias separadas a su ubicación.
Al repetir la ingesta se saltean las referencias sin cambios. No se eliminan
automáticamente del índice las referencias cuyos archivos hayan sido borrados.

Formatos de imagen: JPG/JPEG, PNG, WebP, BMP, TIFF/TIF, GIF e ICO.
Videos: MP4, MOV, AVI, MKV, WebM, M4V, WMV, MPEG y MPG.
No se siguen enlaces simbólicos ni rutas con `..` dentro del ZIP.

## Extras opcionales, apagados por defecto

Para OCR sobre fotos locales (no dentro del ZIP):

```powershell
& "data/kb-offline-env/Scripts/python.exe" -m pip install Pillow pytesseract
# También hace falta Tesseract instalado con el idioma spa y accesible en PATH.
& "data/kb-offline-env/Scripts/python.exe" -m kb.ingest --folder "C:\ruta\manuales" --ocr-images
```

OCR tiene un máximo de 16 millones de píxeles y 120 segundos por imagen.
Para transcribir videos locales:

```powershell
& "data/kb-offline-env/Scripts/python.exe" -m pip install faster-whisper
# Prepará previamente el modelo tiny en el caché local de faster-whisper.
& "data/kb-offline-env/Scripts/python.exe" -m kb.ingest --folder "C:\ruta\manuales" --transcribe
```

La ingesta exige el modelo ya local (`local_files_only=True`): no descarga pesos.
Usa CPU, int8 y tiny, con idioma español. La transcripción puede tardar horas;
los segmentos se indexan con segundos de inicio y fin, sin acumular el video en
memoria. No ejecuta comandos de shell ni realiza subidas.

Ambos flags requieren `--folder` y archivos reales previamente extraídos. El flag
`--ocr` de fase 2 sigue correspondiendo solo a páginas PDF.

## Reanudación y errores

Cada medio se confirma en su propia transacción. Si se interrumpe, se conservan
los archivos terminados y se revierte el archivo actual. Los extras se retoman
por archivo, no desde un segundo intermedio del video.

Si falta una dependencia, el modelo o falla el motor, se guarda la referencia
básica y el estado `parcial` con `extra_pendiente` en `ingestion_issues`.
Otra pasada con el mismo flag reintenta sin duplicar fragmentos. Los segmentos
parciales de una transcripción fallida se descartan mediante un savepoint.
Los perfiles de OCR y transcripción son independientes del perfil de PDF/Word.
Volver a ejecutar sin flags deja solo metadatos de los medios procesados.

Los archivos de proyecto `.wfp`, miniaturas de proyecto `.fsthumb`, PPTX y otros
formatos no implementados no se abren ni se ejecutan.

## Privacidad, pruebas y límites

Los índices, documentos extraídos y entorno offline permanecen en `backend/data/`,
excluido de Git. Los medios originales siguen en su ubicación local.
OCR y transcripción se etiquetan como automáticos no validados, son texto no
confiable y mantienen la redacción heurística de contactos. No se garantiza
anonimización completa: el índice sigue siendo confidencial.

Los motores reales de OCR y Whisper no se instalaron ni ejecutaron en esta fase.
Se verificaron sus contratos con simulaciones y se probó una imagen PNG sintética.
La ingesta básica real no analiza qué aparece en las fotos ni qué dicen los videos.
La comprobación de cambios por metadatos no detecta un reemplazo que preserve
exactamente tamaño y fecha; con extras habilitados se usa SHA-256 en bloques.

```powershell
& "data/kb-offline-env/Scripts/python.exe" -m unittest tests_kb_media tests_kb_folder tests_kb tests_sheets tests_xlsx_prefix tests_spreadsheet_chat tests_spreadsheet_bulk tests_sheet_reader
```

Los tests cubren referencias sin abrir binarios, lectura del ZIP sin extracción,
reanudación, actualización, referencias por carpeta, privacidad, flags explícitos,
dependencias ausentes, rollback de segmentos y modelo sin descargas.
No se modificaron auth, chat, voz, Tu espacio, edición de planillas ni despliegues.
