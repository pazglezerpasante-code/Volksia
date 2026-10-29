# Límites reales y costos

**Máximo de archivo actualmente implementado: 8 MiB**, tanto en el selector del chat como en el servicio de hojas. El libro XLSX además tiene un límite de 40 MiB descomprimidos, 1 millón de celdas y 1024 columnas, según el lector actual. El XLS antiguo se convierte en memoria con límites análogos. Se mantienen por seguridad.

**500 MB: NO IMPLEMENTADO, NO PROBADO.** No es suficiente aumentar una constante: el proxy Nitro/Vercel usa `arrayBuffer()` para reenviar el cuerpo entero, el backend lee el binario en memoria y devuelve XLSX Base64 en JSON. La transformación usa openpyxl en memoria. Es inadecuado para 500 MB y los límites externos de los planes varían.

Una evolución viable requiere cargas directas autenticadas a almacenamiento privado con URLs firmadas y expiración, multipart/reanudables, validación de tamaño/contenido e integridad, cola de procesamiento con capacidad suficiente, descarga autorizada de resultados, limpieza y consultas del estado de cada trabajo. Además hay que diseñar lecturas por streaming/lotes y mantener procesadores existentes sin perder reglas de negocio.

**Costo $0 no garantizado**: Vercel, Render y almacenamiento pueden tener límites de memoria, ancho de banda, tiempo, número de invocaciones y suspensión del servicio. No se contrató ningún servicio nuevo ni se verificaron cuotas en vivo durante esta edición. Validar precios/cuotas con cada proveedor antes de habilitar archivos grandes.
