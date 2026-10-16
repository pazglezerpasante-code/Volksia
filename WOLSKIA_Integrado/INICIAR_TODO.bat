@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js 22: https://nodejs.org  ^(marque "Add to PATH"^)
  pause
  exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
  echo Falta Python 3.10 o superior: https://www.python.org/downloads/  ^(marque "Add to PATH"^)
  pause
  exit /b 1
)

echo [1/3] Backend: preparando entorno Python...
if not exist backend\.venv\Scripts\python.exe (
  python -m venv backend\.venv
  if errorlevel 1 (
    echo No se pudo crear el entorno virtual.
    pause
    exit /b 1
  )
)
backend\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt
if errorlevel 1 (
  echo No se pudieron instalar las dependencias de Python.
  pause
  exit /b 1
)

echo [2/3] Frontend: verificando dependencias...
if not exist frontend\node_modules\vite\bin\vite.js (
  echo Instalando dependencias de Node. Puede tardar varios minutos...
  pushd frontend
  if exist node_modules rmdir /s /q node_modules
  call npm install
  if errorlevel 1 (
    popd
    echo No se pudieron instalar las dependencias de Node.
    pause
    exit /b 1
  )
  popd
)

echo [3/3] Iniciando servidores...
start "WOLSKIA Backend (Flask :5050)" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe app.py"
timeout /t 3 >nul

echo.
echo Abra http://127.0.0.1:8080
echo Acceso directo: no requiere login
echo Luego pegue sus claves en el panel "Modelos de IA".
echo.
start "" http://127.0.0.1:8080
cd frontend
call npm run dev
pause
