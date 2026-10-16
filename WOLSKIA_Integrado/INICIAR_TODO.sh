#!/bin/sh
# Mac / Linux: backend Flask (5050) + frontend Studio (8080)
cd "$(dirname "$0")"
[ -d backend/.venv ] || python3 -m venv backend/.venv
backend/.venv/bin/pip install -q -r backend/requirements.txt
[ -d frontend/node_modules/vite ] || (cd frontend && npm install)
(cd backend && .venv/bin/python app.py) &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT INT TERM
sleep 2
echo "Abra http://127.0.0.1:8080  (admin / admin123)"
cd frontend && npm run dev
