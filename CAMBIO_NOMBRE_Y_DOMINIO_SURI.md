# Nombre de instalación y dominio de SURI

Se fijó el nombre de la aplicación web progresiva en **SURI** para cualquier host. El manifest web y la página de instalación iOS ya no derivan el nombre de grok.me ni usan «Grok App». Se agregó también `application-name` y `apple-mobile-web-app-title` al head. Los iconos existentes conservan la identidad del robot.

## Publicar

1. Subir y desplegar este proyecto en Vercel, manteniendo el proyecto existente y todas sus variables de entorno.
2. Abrir Vercel → proyecto → Settings → General. Cambiar el nombre del proyecto si así se desea (por ejemplo `suri-asistente`), teniendo presente que renombrar el proyecto no garantiza modificar un dominio anterior ya asignado.
3. Ir a Settings → Domains, agregar el alias `.vercel.app` disponible que se prefiera, por ejemplo `suri-asistente.vercel.app`. **No está garantizado que `suri.vercel.app` esté libre**. Mantener el dominio actual hasta confirmar que el nuevo funciona. Luego configurar redirección si se desea.
4. Si existen variables de entorno, CORS, OAuth, Supabase Auth redirects o webhooks que autorizan el dominio antiguo, agregar primero el nuevo antes de retirar el viejo.
5. En Android/Chrome, desinstalar la PWA antigua y volver a instalar desde el nuevo sitio. En iOS, eliminar el antiguo ícono de pantalla de inicio y volver a añadir el sitio desde Safari.

## Costos

Un dominio disponible bajo `vercel.app` no requiere comprar un dominio. Un dominio propio `.com` u otro TLD habitualmente es de pago. El plan gratuito Hobby de Vercel está sujeto a sus condiciones, especialmente en proyectos comerciales o empresariales.

## Alcance

Se cambió el nombre visible de instalación, no los nombres internos de rutas `__grok` que el código existente usa como rutas técnicas, ni las URLs de integraciones de producción. No se modificó el dominio en la cuenta de Vercel desde este ZIP.
