@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Prueba de claves WOLSKIA
echo.
echo Preparando...
if not exist .venv\Scripts\python.exe (
  echo Creando entorno virtual...
  python -m venv .venv
  if errorlevel 1 (
    echo ERROR: no se pudo crear el entorno. ¿Tenés Python instalado?
    pause
    exit /b 1
  )
  .venv\Scripts\pip install -q -r requirements.txt
)
echo.
.venv\Scripts\python probar_claves.py
if errorlevel 1 pause
