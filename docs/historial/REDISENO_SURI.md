# Rediseño SURI — 27 de octubre de 2026

Implementado en Volksia-archivos, a partir de la maqueta aprobada.

- PC: Chat, Herramientas, Tareas y Notas. Panel de tareas y notas junto al chat.
- Celular: Chat, Tareas y Notas; herramientas ocultas y formularios compactos.
- Robot: se reutilizan las cinco expresiones transparentes existentes. Escucha al enfocar el mensaje, piensa al procesar, responde y celebra al terminar.
- Tareas: crear, editar, completar y quitar. Notas: crear, editar y quitar.
- Persistencia en localStorage, clave suri-device-space-v1, por navegador y origen. No hay cuentas ni sincronización entre dispositivos. Borrar los datos del navegador elimina estos datos.
- Se importa una vez el antiguo espacio del navegador sin borrar su copia del servidor. La IA recibe una copia transitoria y devuelve los cambios para guardarlos localmente; el modo de dispositivo no escribe en JSON/Supabase.
- El chat y la integración existente con Excel siguen activos.

## Verificación

- Build y typecheck: aprobados.
- Backend: 96 pruebas aprobadas, incluidas 5 sobre aislamiento y almacenamiento transitorio.
- Frontend: 3 pruebas del guardado y combinación de cambios aprobadas.
- Pruebas reales: nota creada por SURI, edición manual, persistencia tras recarga; tarea editada/completada con persistencia; Excel con Papa, Pepe, Pipi y Popo generado desde el chat con vista previa y enlace de descarga; carga de Herramientas en PC.
- Interfaz revisada en desarrollo y en build, PC y celular de 390 px; sin errores de consola en las comprobaciones finales ni desbordamiento horizontal en celular.
- Datos de prueba de tareas/notas retirados.
- Capturas finales en screenshots/suri-pc-final.png y screenshots/suri-celular-final.png.

La interfaz anterior se conserva en el historial de Git.
