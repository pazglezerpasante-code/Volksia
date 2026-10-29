# Instalación y despliegue

1. Hacer backup de los despliegues y variables de entorno actuales antes de reemplazar nada.
2. En `WOLSKIA_Integrado/frontend`: `npm ci`, `npm run typecheck`, `npm run test` y `npm run build`.
3. En `WOLSKIA_Integrado/backend`: crear un entorno virtual, instalar `pip install -r requirements.txt`, correr los tests existentes y levantar la app con la misma configuración de Render actual.
4. Usar la configuración actual de Vercel/Render descrita en `DEPLOY.md` y `WOLSKIA_Integrado/DEPLOY_ONLINE.md`. No reemplazar URLs ni variables existentes sin verificarlas.
5. Backend: `WOLSKIA_PUBLIC_MODE=1`, `WOLSKIA_PROXY_SECRET` largo y privado, claves de IA solo del servidor y cuotas vigentes. Frontend servidor: `WOLSKIA_API` apuntando al backend y `WOLSKIA_PROXY_SECRET` idéntico. Véase `SURI_ENV.example`.
6. Comprobar rutas `/api/health` y `/api/ai/sheets/chat` por el dominio público (una salud correcta no comprueba Excel). Probar XLS y XLSX pequeños, carga inválida, fallo de backend, reintentos y los procesadores existentes antes de activar producción.

No incluir archivos `.env` reales en GitHub ni en el ZIP. Una sesión local sin login **no constituye autenticación** para documentos laborales privados; agregar control de acceso real antes de usar cargas privadas con múltiples empleados.
