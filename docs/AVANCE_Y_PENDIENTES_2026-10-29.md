# SURI — avance incremental, 29/10/2026

## Implementado sobre el ZIP anterior
- Se añadió lectura de archivos `.xls` OLE2 en el endpoint determinista `/api/ai/sheets`, usando xlrd, con control de dimensión y conversión a libro abierto en openpyxl. El formato visual heredado de XLS no se garantiza al convertir.
- El robot conserva su estilo original y amplía sus estados con lectura, procesamiento, consulta de herramientas, reconexión, desconexión y celebración. El chat dispara lectura/procesamiento/consulta en las rutas relevantes.
- Se conserva el resto de funcionalidades y las correcciones del ZIP anterior.

## Verificación local efectuada
- `python -m compileall` del backend: OK.
- `npm run build`: NO EJECUTADO CON ÉXITO (falta Vite en node_modules).
- `python -m unittest tests_sheets tests_xlsx_prefix`: NO EJECUTADO CON ÉXITO (falta Flask en el intérprete).
- No se ha probado despliegue en Vercel/Render, integración de 500 MB ni la conversión XLS con archivos reales.

## Pendiente para cumplir el objetivo integral
- Subida directa o por partes a almacenamiento privado con autenticación y permisos por usuario, trabajos asíncronos, cuotas, reintentos y caducidad de archivos; el proxy serverless actual carga el cuerpo entero y NO es apto para 500 MB.
- Desplegar y probar la infraestructura de carga segura, límites reales de costos gratis, regresiones de turnero/asistencia/encuestas y carga en navegadores Android.
- Integrar estados adicionales de conectividad directamente con el ciclo de vida de todas las peticiones, y pruebas E2E del sistema expresivo.
- Ejecutar instalación de dependencias y pruebas en entorno adecuado antes de publicar.

**No presentar este ZIP como despliegue validado ni como compatible con archivos de 500 MB.**
