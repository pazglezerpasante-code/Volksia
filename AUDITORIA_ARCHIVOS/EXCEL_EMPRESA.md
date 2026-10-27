# Archivos de empresa: límites y lector local

Corrección en la copia `Volksia-archivos`, 26 de octubre de 2026. La carpeta original y la publicación no se modificaron.

## Errores separados

- «100.000 celdas o 200 columnas»: límite propio del procesador. Se aumentó a 1.000.000 de celdas y 1.024 columnas, manteniendo protecciones de 8 MB por archivo, 40 MB descomprimidos y límites de concurrencia. No constituye garantía de capacidad ilimitada ni de que el hosting acepte cualquier carga de 8 MB.
- «50 acciones»: el modelo y ejecutor antiguos exigían acciones individuales. La copia admite 200 acciones declaradas, operaciones agrupadas sobre todas las hojas y 256 hojas. Los prefijos telefónicos se reemplazan con una sola operación determinista sobre el libro.
- «No se pudo cargar el lector»: los módulos cargaban SheetJS desde CDNs. Ahora SheetJS CE 0.20.3 y JSZip 3.10.1 están en `frontend/public/vendor/`, con versiones, fuentes, licencias originales y hashes documentados. Las tres herramientas usan rutas locales del mismo hosting. El script de build verifica presencia, sintaxis y referencias locales.

## Resultados con los archivos proporcionados

| Archivo | Tamaño aproximado | Hojas | Resultado |
| --- | --- | --- | --- |
| CAMPAÑAS A ENVIAR 2026 | 246 KiB | 55 | Importación y edición de prefijos correctas; 646 valores 54915 a 54911; las partes ajenas del paquete permanecen idénticas. |
| ENVIO ENCUESTAS | 10 KiB | 1 | Lectura correcta. No hay coincidencias 54915 para reemplazar. |
| ENCUESTA INTERNA | 820 KiB | 6 | Lectura correcta; su área de trabajo declarada ronda 251.000 celdas por formatos y dimensiones. No hay coincidencias 54915. Exportación probada adicionalmente con otro prefijo presente, solo en memoria, sin sobrescribir el original. |

Los tres archivos se leyeron también con la copia local de SheetJS, sin obtener la biblioteca de internet durante la prueba. Esto valida el lector y no todas las reglas empresariales de cada herramienta especializada.

El XLSX grande contiene validaciones extendidas que openpyxl no conserva al volver a guardar. Por eso se agregó `services/xlsx_prefix.py`: para el pedido explícito de prefijos se modifica el XML de las celdas y, cuando corresponde, se añaden textos compartidos al ZIP original. Las fórmulas, hojas, temas, estilos y demás partes no intervenidas no se reconstruyen. Se preservaron los dos bloques de extensiones especiales en la prueba del archivo grande. Los originales de Downloads permanecieron intactos; no se subieron a proveedores de IA para estas pruebas.

Las demás operaciones continúan usando el ejecutor habitual y sus limitaciones de objetos avanzados. No se declara preservación universal de cualquier característica de Excel.

## Pruebas

- 91 pruebas del backend correctas.
- Pruebas de sustitución numérica, texto, fórmulas excluidas, rich text en sharedStrings y conservación byte por byte de partes ajenas del ZIP.
- Importación de los tres ejemplos con backend y lector JavaScript local.
- Generación y reapertura de resultados XLSX; comparación de valores y partes preservadas.
- `scripts/check-suri-bridges.mjs`: tres puentes correctos; lector local presente en cada módulo.
- Informe agregado: `prueba-tres-excels.json`. No contiene teléfonos ni nombres de personas.

No se verificó mediante navegador una subida o descarga completa de esta copia durante esta corrección. La prueba del lector local se ejecutó en Node y la del procesador en Python. El estado de instalación/build del frontend se registra por separado; no se presenta una prueba de biblioteca como si fuera un despliegue comprobado.

## Tamaños realmente mayores y cuotas

Estos tres archivos no requieren más cuota del proveedor: todos pesan menos de 1 MB. Cambiar prefijos tampoco requiere una llamada a un modelo. Para otros pedidos, el modelo genera un plan compacto y el servidor recorre los datos; no se envía una solicitud por celda.

La ruta publicada sigue pasando por Vercel, cuyo cuerpo de solicitud/respuesta tiene límite de 4,5 MB. Un archivo permitido localmente por el procesador puede no caber en ese transporte, y una respuesta Base64 pesa aproximadamente un tercio más. Para cargas que excedan ese tamaño o procesos largos se necesita otra fase: subida directa autorizada a un almacén temporal, trabajos con estado y descargas privadas con vencimiento. No se agregó un servicio externo ni una API paga, ni se alteró producción sin autorización. Los límites del proveedor de IA no se pueden aumentar desde el código de esta aplicación.

Fuente del límite de hosting: https://vercel.com/docs/functions/limitations

Para que dejen de aparecer los errores en la página usada por la empresa, debe probarse y desplegarse esta copia; el backend original que siga ejecutándose desde `Volksia-main` conserva los límites anteriores. No se reinició ni modificó ese backend.

Comprobación final del frontend: instalación independiente con npm ci completada; typecheck y build correctos. Puentes y dependencias locales verificados por el script del build. No se reutilizó ni modificó node_modules del proyecto original.


## Activación local posterior

La página del usuario seguía sirviéndose desde el original. Se activó la copia corregida en 127.0.0.1:8080 y 8081, con proxy al backend nuevo en 127.0.0.1:5052. Se verificaron versión `excel-empresa-20261026`, IA configurada, límites ampliados y referencias al lector local desde ambas direcciones. La interfaz carga y la revisión de consola no mostró errores.

Los archivos del original no se editaron. Su backend anterior en 5050 se conserva como respaldo. La configuración del proceso anterior se reutilizó únicamente en memoria del backend nuevo; no se imprimieron ni escribieron claves en archivos nuevos. Se preservó una copia de los datos locales anteriores antes de sincronizar los datos actuales a la carpeta nueva. La publicación de Vercel no se modificó. Esta activación corresponde a los procesos locales en ejecución; no se alteraron servicios de inicio de Windows.
