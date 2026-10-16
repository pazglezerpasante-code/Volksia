# WOLSKIA: GitHub, Render y Supabase

## Cambios de esta versión
- La interfaz principal entra directamente, sin pantalla de login.
- `Tu espacio` tiene un resumen más visual para tareas, notas y agenda, con estados vacíos guiados.
- Cada navegador crea y conserva un identificador local (`wolskia-profile-id`). El backend guarda tareas, notas y eventos en `backend/data/espacio.json`, en un bloque por identificador.
- `.gitignore` excluye secretos, configuración local, datos de usuario y artefactos de compilación.

## Seguridad importante antes de publicar
La modalidad sin login **no identifica de forma segura a una persona**. El identificador del navegador permite separar perfiles por navegador, pero no sustituye autenticación/autorización del servidor. No publicar la aplicación con notas privadas o datos sensibles hasta implementar autorización real en cada endpoint. Cualquier persona que pueda invocar la API no debe poder elegir libremente el identificador de otro perfil.

Las notas se guardan actualmente en un archivo JSON del backend (`backend/data/espacio.json`), no en Supabase. Ese archivo está excluido de Git y los sistemas de hosting pueden borrar archivos locales al reiniciar o desplegar. Para persistencia de producción, migrar el almacenamiento a PostgreSQL/Supabase y definir una política de acceso apropiada antes de habilitar uso público.

## GitHub
1. Crear un repositorio privado y vacío.
2. Descomprimir el ZIP y abrir CMD/PowerShell en `WOLSKIA_Integrado`.
3. Revisar `git status --short` y comprobar que no haya `.env`, claves ni `backend/data/espacio.json`.
4. Ejecutar:

```bash
git init
git branch -M main
git add .
git status --short
git commit -m "Preparar WOLSKIA"
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

Si el repositorio ya tiene Git configurado, no repetir `git init` ni `git remote add`.

## Variables privadas en Render
Cargar las claves en la sección Environment del servicio backend, nunca en el frontend ni en GitHub. Usar las variables que lee el backend, por ejemplo `GEMINI_API_KEY`, `GROQ_API_KEY` y `XAI_API_KEY` según los proveedores usados. No compartir capturas donde se vean sus valores.

## Supabase
El proyecto aún usa el archivo JSON para `Tu espacio`; crear un proyecto Supabase por sí solo no migra esos datos. Antes de declarar la integración terminada hay que implementar el repositorio PostgreSQL, esquema/migraciones, conexión con `DATABASE_URL` o variables Supabase adecuadas y autorización por usuario.

## Validación local
- Frontend: `cd frontend`, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- Backend: `cd backend`, `pip install -r requirements.txt`, `python tests_agent.py`, `python tests_api.py`, `python tests_ai.py`.
