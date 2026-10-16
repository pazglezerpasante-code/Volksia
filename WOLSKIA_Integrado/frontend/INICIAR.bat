@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 22 desde https://nodejs.org y vuelva a ejecutar este archivo.
  pause
  exit /b 1
)

if not exist node_modules\vite\bin\vite.js (
  echo Instalando dependencias. Puede tardar varios minutos...
  if exist node_modules rmdir /s /q node_modules
  call npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

if not exist node_modules\vite\bin\vite.js (
  echo ERROR: Vite no quedo instalado. Ejecute: npm install
  pause
  exit /b 1
)

echo.
echo WOLSKIA se esta iniciando...
echo Cuando vea "ready", abra: http://127.0.0.1:8080
echo Acceso directo: no requiere login
echo.
timeout /t 2 >nul
start "" http://127.0.0.1:8080
call npm run dev
pause
