# Instructivo: fase 4 — consultas de manual en SURI

El chat existente consulta el índice privado de `backend/data/kb.sqlite` en
preguntas detectadas como consultas de procedimiento. Las intenciones actuales
de Tu espacio y archivos se clasifican primero. Consultas ajenas al manual
mantienen la ruta de chat previa.

La búsqueda usa hasta 6 fragmentos FTS5. El contenido recuperado se adjunta al
system prompt marcado como DATO NO CONFIABLE; la respuesta debe ceñirse a las
fuentes, usar pasos numerados, nombrar responsables y citar archivo, etapa/paso
o página. El usuario ve la cita al final de la respuesta del chat, que ya renderiza
Markdown. Si no hay coincidencias, el backend indica que no encontró la respuesta
en el instructivo sin llamar al proveedor ni inventarla.

## Probar en Windows

Arrancá backend y frontend como siempre, con el índice local ya creado en las
fases anteriores. Para ver qué recupera la búsqueda antes de consultar al modelo:

```powershell
Invoke-RestMethod "http://127.0.0.1:5050/api/kb/search?q=asesor recepcion turno"
```

En el chat preguntá, por ejemplo:

- `Según el manual, ¿qué hace el asesor cuando el cliente llega con turno?`
- `¿Quién es responsable de la recepción?`
- `Explicame paso a paso el proceso de entrega y citá las fuentes.`

Para el resultado redactado hace falta un proveedor de IA configurado. Las
consultas que no encuentran fragmentos contestan localmente sin clave. El índice
no se sirve como archivo ni se incluye en el repositorio. En modo público, el
endpoint mantiene `local_only` y la protección de clave del proxy existentes.
Las consultas generan el rate limit ya usado por el chat; la búsqueda interna no
lo cuenta una segunda vez.

Las pruebas mock verifican intención y precedencia, contexto no confiable,
instrucción de citar, mensaje sin coincidencias y continuidad de chat general.
La calidad de la recuperación depende de la búsqueda por términos; no es una
búsqueda semántica ni garantiza reconstruir diagramas ambiguos. Los motores OCR y
transcripción siguen siendo opcionales y sus textos deben tratarse como referencia
no validada.
