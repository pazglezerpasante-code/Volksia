@echo off
cd /d "%~dp0"
title WOLSKIA
where py >nul 2>nul
if errorlevel 1 (
 echo Python no esta instalado. Instala Python 3.11 o 3.12 y marca "Add Python to PATH".
 pause
 exit /b 1
)
if not exist .venv (
 py -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
 echo No se pudieron instalar las dependencias. Revisa la conexion a internet.
 pause
 exit /b 1
)
if not exist .env copy .env.example .env
start "" http://127.0.0.1:5050
python app.py
pause
