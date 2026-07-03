# I-EPOS Web Interface

A full-stack web application for running and visualising the **I-EPOS** (Iterative Economic Planning and Optimised Selection) algorithm and a **Brute Force** exhaustive search, with interactive result visualisations.

---

## Project Structure

```
EPOS-Source-Code/
├── src/                           # Java source for the EPOS algorithm (Maven)
├── backend/                       # Spring Boot REST API
│   ├── src/
│   └── pom.xml
├── frontend/                      # React + Vite web UI
│   ├── src/
│   │   ├── components/            # UI components (ResultsPanel, PlanViewer, …)
│   │   └── visualizer/            # EPOS interactive visualiser (D3)
│   └── vite.config.js
├── mathematical_way/              # Brute-force Python simulation
│   ├── code.py                    # Core brute-force + EPOS simulation
│   ├── run_experiment.py          # Orchestrator called by the backend
│   ├── brute_force_visualizer.py  # Generates concentric-circle PNGs
│   └── epos_utils.py
├── scripts/
│   └── generate_viz_data.py       # Converts EPOS output → experiments.json
├── Privacy_6agents/               # Built-in privacy dataset (.plans files)
├── backend/Dockerfile             # Multi-stage Docker build (backend)
└── frontend/Dockerfile            # Multi-stage Docker build (frontend)
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Java JDK | 17 | Build & run EPOS + Spring Boot |
| Maven | 3.9+ | Build Java projects |
| Node.js | 18+ | Build & run the frontend |
| Python | 3.9+ | Brute-force simulation & visualisation |

Install Python dependencies:
```bash
pip install numpy pandas matplotlib
```

---

## Running Locally

### 1 — Build the EPOS JAR (root project)

```bash
# From the repo root
mvn package -DskipTests
# Produces: target/tutorial-0.0.1.jar
```

### 2 — Build & start the backend

```bash
cd backend
mvn package -DskipTests
# Produces: target/epos-api-1.0.0.jar

# Set the path to the EPOS fat JAR, then start
# macOS / Linux:
export EPOS_JAR=../target/tutorial-0.0.1.jar
# Windows PowerShell:
# $env:EPOS_JAR = "..\target\tutorial-0.0.1.jar"

java -jar target/epos-api-1.0.0.jar
# Backend runs on http://localhost:8080
```

### 3 — Start the frontend

```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

Vite proxies `/api` → `http://localhost:8080` automatically (configured in `vite.config.js`), so no extra configuration is needed for local development.

Open **http://localhost:5173** in your browser.

---

## Environment Variables

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `EPOS_JAR` | *(required)* | Absolute path to `tutorial-0.0.1.jar` |
| `SERVER_PORT` | `8080` | HTTP port |

### Frontend (build-time only)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | Backend API base URL. Only set this when the frontend is served separately (e.g. Docker / Cloud Run). For local dev the Vite proxy handles routing automatically. |

---

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/run` | Submit a job (multipart: `.plans` files + config params) |
| `GET` | `/api/status/{jobId}` | Poll job status: `RUNNING` / `COMPLETED` / `FAILED` |
| `GET` | `/api/results/{jobId}` | Fetch result CSVs and summary JSON |
| `GET` | `/api/results/{jobId}/viz-data` | `experiments.json` for the I-EPOS visualiser |
| `GET` | `/api/results/{jobId}/bf-images` | List brute-force PNG filenames |
| `GET` | `/api/results/{jobId}/bf-images/{file}` | Serve a brute-force visualisation PNG |
| `GET` | `/api/dataset/privacy` | Built-in Privacy dataset as parsed JSON |

---

## Features

- **I-EPOS algorithm** — upload `.plans` files, configure iterations / alpha / beta / cost functions, view convergence charts and an interactive radial tree visualiser.
- **Brute Force** — exhaustive search over all plan combinations; generates concentric-circle iteration PNGs viewable in-browser.
- **Privacy dataset** — built-in 6-agent dataset, no upload needed. Individual agents can be removed before running.
- **Plan Editor** — inspect and edit agent plans in a scrollable table before submitting.

---

## Making UI / Aesthetic Changes

All visual code lives in the frontend:

```
frontend/src/
├── App.jsx               # Top-level layout and state
├── App.css               # Global styles and CSS variables (colours, spacing, radius)
└── components/
    ├── ResultsPanel.jsx  # Results display (summary cards, downloads, visualiser button)
        └── PlanViewer.jsx    # Plan editor table with agent tabs
        ```

        **CSS variables** are defined at the top of `App.css` — colours, border radius, and spacing can all be changed there without touching component code. The frontend hot-reloads automatically during `npm run dev`.

        ---

        ## Deploying to Google Cloud Run

        See [`DEPLOY.md`](DEPLOY.md) for full deployment instructions.

        Quick summary (requires Docker + `gcloud` CLI authenticated to project `epos-2026`):

        ```bash
        PROJECT="epos-2026"
        REGION="us-central1"
        REPO="us-central1-docker.pkg.dev/$PROJECT/epos-repo"
        BACKEND_URL="https://epos-backend-382548405389.us-central1.run.app"

        # --- Backend ---
        docker build -f backend/Dockerfile -t $REPO/epos-backend:latest .
        docker push $REPO/epos-backend:latest
        gcloud run deploy epos-backend --image=$REPO/epos-backend:latest --region=$REGION

        # --- Frontend ---
        cd frontend
        docker build -t $REPO/epos-frontend:latest \
          --build-arg VITE_API_URL=$BACKEND_URL/api .
          docker push $REPO/epos-frontend:latest
          gcloud run deploy epos-frontend --image=$REPO/epos-frontend:latest --region=$REGION
          ```
          