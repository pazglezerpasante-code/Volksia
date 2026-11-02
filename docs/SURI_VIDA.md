# Emociones integradas en SURI

La SURI original del chat es la única interfaz del personaje. No hay botón «SURI · Con vos», otro avatar, panel de emociones, juegos, pruebas ni ajustes para el usuario.

## Comportamiento automático

- El motor invisible mantiene 25 emociones, humor base, energía y memoria local. Buenos Aires es la ubicación predeterminada, sin pedir ubicación ni permisos.
- La cara original usa sus imágenes existentes y sus ojos animados. Se agregaron rubor, lágrimas, sudor, corazones, destellos y bufanda mediante SVG superpuesto a la misma imagen. Sus expresiones se relacionan con las emociones: alegría, ternura, tristeza, sorpresa, curiosidad, picardía, seriedad y cansancio.
- Al recibir un mensaje, reacciona al tono y conserva esa emoción mientras atiende. Los estados de trabajo tienen prioridad para la pose. Dormir no bloquea tareas ni ralentiza respuestas.
- El clima actual modifica sus reacciones y accesorios automáticamente. Datos: Open-Meteo, https://open-meteo.com/en/docs. Solo se envían coordenadas de Buenos Aires, nunca conversaciones. Si no hay clima disponible, no se inventa.
- Hay respiración, parpadeo, mirada, estiramiento y bostezo. Se respetan movimiento reducido y pestañas ocultas. No se solicitan permisos de giroscopio.
- Las frases espontáneas tienen separación de 20 minutos y un máximo de cinco por día. El personaje no castiga ausencias ni presiona al usuario para quedarse.
- La memoria guarda reacciones predeterminadas y estado, sin copiar los mensajes. Es local al navegador, no una sincronización entre personas o equipos.

## Archivos

`frontend/src/lib/suri-life.ts`: emociones, decaimiento y constantes internas.
`frontend/src/components/suri-life.tsx`: controlador invisible y clima.
`frontend/src/components/suri-face.tsx`: imagen original, expresiones y comportamiento.
`frontend/src/components/suri-life.css`: expresiones y accesorios sobre el avatar original.

Las pruebas y los valores editables son de desarrollo; no hay controles de configuración en la aplicación. La integración no cambia prompts, resultados del libro, archivos Excel ni endpoints de trabajo. Tampoco agrega voz automática.

## Ciclo de inactividad restaurado

Sin interacciones: mira alrededor a los 6 s, se estira a los 14 s, bosteza a los 24 s, juega unos segundos con una pelotita a los 38 s y duerme a los 60 s, con ojos cerrados, respiración, zzz y la ovejita que ya tenía. Enfocar el cuadro de mensaje no bloquea el ciclo. Escribir, tocar o desplazarse la despierta; mover el cursor solo mueve la mirada. Una tarea en proceso mantiene a SURI despierta. Todos los tiempos están juntos en IDLE_TIMINGS, sin ajustes visibles para el usuario.
