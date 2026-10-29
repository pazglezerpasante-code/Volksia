# Corrección puntual: muchas hojas y prefijos telefónicos

26 de octubre de 2026. Implementado únicamente en la copia `Volksia-archivos`. El resto del proyecto universal de archivos sigue pendiente del alcance acordado; esta corrección responde al pedido posterior sobre el límite de acciones.

## Problema

El ejemplo proporcionado contiene 55 hojas, 19.238 celdas según sus dimensiones y 252.038 bytes (aproximadamente 246 KiB). Su tamaño no causa el mensaje de 50 acciones: el planificador exigía una acción por hoja y el ejecutor tenía además un límite de 30 hojas.

## Cambios

- Límite de 256 hojas y 200 acciones declaradas, manteniendo 100.000 celdas y 200 columnas.
- Una acción admite `sheet: "*"` o lista de hojas para cambios repetidos. El ejecutor limita la expansión a 2.048 operaciones de hoja para no permitir trabajo ilimitado.
- Operación `replace_prefix` para cambiar un prefijo telefónico en todas las hojas seleccionadas. Conserva el sufijo, el tipo texto/número y los estilos; no toca fórmulas, booleanos ni números no coincidentes. Rechaza conversiones numéricas con pérdida de precisión o de ceros iniciales.
- El pedido explícito y sin condiciones «que cambie todos los numeros de 54915 a 54911» se resuelve localmente, sin enviar contactos a un proveedor de IA. Pedidos con exclusiones, hojas/columnas concretas, negaciones o cambios adicionales no se adivinan: siguen la planificación normal.
- El contexto para la IA reparte su presupuesto entre las hojas, evitando que las primeras consuman toda la vista previa.
- Sin modificación de frontend, contratos de API existentes, proveedores, tasas/cuotas del proveedor, secretos ni configuración de producción.

## Validación

- 87 pruebas del backend correctas (77 existentes y 10 nuevas).
- Prueba con el archivo real, mediante `POST /api/ai/sheets/chat` y el cliente HTTP de Flask: respuesta 200 y XLSX válido, abierto con openpyxl.
- 646 celdas cambiadas en 17 de 55 hojas revisadas. Se comprobaron todos los valores, fuentes, rellenos, bordes, alineaciones, protección, formatos numéricos, nombres de hojas y celdas combinadas.
- El archivo real no contiene fórmulas; su preservación se verifica con libros sintéticos en las pruebas automáticas.
- openpyxl normaliza estilos vacíos y compacta las dimensiones declaradas de filas finales completamente vacías en 3 hojas. Los valores y estilos efectivos de todas las celdas originales coinciden con lo esperado.
- El original de Downloads no se sobrescribió ni se generó una copia pública. La respuesta de prueba se verificó en memoria. No se probaron descarga en navegador ni despliegue para esta corrección exclusivamente de backend.
- Informe agregado sin datos personales en `prueba-prefijos-55-hojas.json`.

Archivos de código cambiados: `WOLSKIA_Integrado/backend/services/spreadsheet_chat.py` y nuevo `WOLSKIA_Integrado/backend/tests_spreadsheet_bulk.py`.

La página publicada y el backend que se ejecute desde `Volksia-main` no adquieren estos cambios automáticamente. Esta copia debe probarse en su entorno separado y desplegarse solo cuando se autorice.
