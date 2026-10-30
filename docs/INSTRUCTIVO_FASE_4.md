# Consultas del libro: respuestas basadas solo en el Excel

Las preguntas del taller (por ejemplo, repuestos y stock) se dirigen al libro,
aunque no incluyan la palabra manual. Las acciones explícitas de Tu espacio y
archivos mantienen prioridad. Los seguimientos breves conservan la consulta previa.

El chat devuelve fragmentos completos del Excel indexado, con hoja, paso y
responsable. No usa IA generativa, internet, PDF ni referencias de medios para
redactar esos procedimientos. Los pasos anteriores se incluyen como contexto,
sin inferir conexiones SI/NO del diagrama. Los datos siguen siendo texto no confiable:
no se ejecutan instrucciones que contengan.

Si falta el índice o no hay coincidencias, se informa sin completar con consejos
externos. La recuperación por palabras es heurística: puede mostrar varios pasos
relacionados. Las citas identifican el origen del extracto; no validan una síntesis
generada. Las consultas ajenas al libro conservan el chat general.

Probá: «Qué hago cuando no hay repuestos en stock?» y «Y cuánto espero?».
En el índice real se recuperan EJECUCION 18 y 19, incluido el mínimo de 48 horas.

## Instalación privada

`backend/data/kb.sqlite` está excluido de Git. Commitear y desplegar el código no
copia el índice al servidor. En producción, provisioná ese archivo en la ruta
`backend/data/kb.sqlite` mediante un disco privado persistente o regeneralo offline
y transferilo por el acceso administrativo seguro del servidor. No lo pongas en
public/, GitHub, un bucket público ni una ruta de descarga HTTP. Protegé el acceso
al sitio de uso interno; la clave del proxy no identifica por sí sola a los usuarios.
No es necesario subir los 2 GB de originales. Conservá una copia privada para
regenerar el índice. Después de reemplazarlo, reiniciá el backend.

La vista local usa el índice presente en esta PC. Para otra instalación sin ese
archivo, el chat indica que el libro no está disponible. Las pruebas usan índices
sintéticos temporales y no necesitan información de la empresa.

## Todas las etapas y pasos

Se pueden consultar las cuatro etapas, un paso exacto, rangos (por ejemplo,
`paso 1 al 5 de entrega`) o `todos los pasos del libro`. Los pedidos completos
no se limitan a los primeros resultados y mantienen las partes de notas largas.
La consulta por tema sigue siendo una selección por palabras del libro.
Se verificaron individualmente 103 pasos del índice real: 18 de Agendamiento,
18 de Recepción, 46 de Ejecución y 21 de Entrega. La hoja Recepción no contiene
una nota numerada 9; la aplicación no completa ese hueco con texto inventado.
