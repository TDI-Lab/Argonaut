#!/usr/bin/env bash
#
# quickstart.sh
# Place this file in the ROOT of the epos-web repo (next to pom.xml) and run it:
#   chmod +x quickstart.sh
#   ./quickstart.sh
#
# It builds the main jar, builds the backend, sets EPOS_JAR, starts the
# backend in the background, then installs and starts the frontend in
# the foreground (so you see its logs / can Ctrl+C to stop it).
#
# Assumes dependencies (Java 17, Maven, Node, Python libs, Docker) are
# already installed on the system.

set -euo pipefail

ROOT_DIR="$(pwd)"

if [ ! -f "pom.xml" ]; then
  echo "Error: run this script from the root of the epos-web repo (pom.xml not found here)."
  exit 1
fi

echo "==> [1/5] Building main EPOS jar..."
mvn clean package -DskipTests

echo "==> [2/5] Building backend jar..."
cd backend
mvn clean package -DskipTests
cd "$ROOT_DIR"

export EPOS_JAR="$ROOT_DIR/target/tutorial-0.0.1.jar"
echo "==> EPOS_JAR set to: $EPOS_JAR"

if [ ! -f "$EPOS_JAR" ]; then
  echo "Error: expected jar not found at $EPOS_JAR"
  exit 1
fi

echo "==> [3/5] Starting backend on http://localhost:8080 (background, logs -> backend.log)..."
cd backend
EPOS_JAR="$EPOS_JAR" nohup java -jar target/epos-api-1.0.0.jar > "$ROOT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
cd "$ROOT_DIR"
echo "    Backend PID: $BACKEND_PID (stop it later with: kill $BACKEND_PID)"

sleep 3

echo "==> [4/5] Installing frontend dependencies..."
cd frontend
npm install
chmod +x node_modules/.bin/vite 2>/dev/null || true

echo "==> [5/5] Starting frontend on http://localhost:5173 (Ctrl+C to stop)..."
npm run dev