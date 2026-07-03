# Deploying I-EPOS to Google Cloud Run

## Prerequisites

- Google account with billing enabled
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed

---

## Step 1 — Create and configure your GCP project

```bash
# Install gcloud if needed, then:
gcloud auth login

# Create a new project (pick a unique ID)
gcloud projects create epos-app-YOURNAME --name="EPOS App"
gcloud config set project epos-app-YOURNAME

# Enable billing via the Cloud Console:
# https://console.cloud.google.com/billing

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com
```

---

## Step 2 — Create an Artifact Registry repository

```bash
gcloud artifacts repositories create epos-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="I-EPOS container images"

# Auth Docker to push
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

## Step 3 — Build and push the backend image

Run from the **root** of the EPOS-Source-Code directory (so the Dockerfile can reach both `src/` and `backend/`).

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION=us-central1
REPO=us-central1-docker.pkg.dev/$PROJECT_ID/epos-repo

# Build and push backend (takes ~5 min on first build)
docker build \
  -f backend/Dockerfile \
  -t $REPO/epos-backend:latest \
  .

docker push $REPO/epos-backend:latest
```

---

## Step 4 — Deploy the backend to Cloud Run

```bash
gcloud run deploy epos-backend \
  --image=$REPO/epos-backend:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --concurrency=4

# Note the Service URL printed at the end, e.g.:
# https://epos-backend-xxxx-uc.a.run.app
BACKEND_URL=$(gcloud run services describe epos-backend \
  --region=$REGION --format="value(status.url)")
echo "Backend: $BACKEND_URL"
```

---

## Step 5 — Build and push the frontend image

The frontend must know the backend URL at **build time** (baked into the JS bundle).

```bash
cd frontend

docker build \
  --build-arg VITE_API_URL=$BACKEND_URL/api \
  -t $REPO/epos-frontend:latest \
  .

docker push $REPO/epos-frontend:latest
cd ..
```

---

## Step 6 — Deploy the frontend to Cloud Run

```bash
gcloud run deploy epos-frontend \
  --image=$REPO/epos-frontend:latest \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --memory=256Mi \
  --cpu=1

FRONTEND_URL=$(gcloud run services describe epos-frontend \
  --region=$REGION --format="value(status.url)")
echo "App available at: $FRONTEND_URL"
```

Open `$FRONTEND_URL` in your browser.

---

## Step 7 — Redeploying after code changes

```bash
# Backend change:
docker build -f backend/Dockerfile -t $REPO/epos-backend:latest . && \
docker push $REPO/epos-backend:latest && \
gcloud run deploy epos-backend --image=$REPO/epos-backend:latest --region=$REGION

# Frontend change:
cd frontend && \
docker build --build-arg VITE_API_URL=$BACKEND_URL/api -t $REPO/epos-frontend:latest . && \
docker push $REPO/epos-frontend:latest && \
gcloud run deploy epos-frontend --image=$REPO/epos-frontend:latest --region=$REGION
```

---

## Running locally (no Docker needed)

### Backend

```bash
# 1. Build the EPOS fat jar from the root
mvn package -DskipTests

# 2. Build and run the Spring Boot API
cd backend
mvn spring-boot:run &
cd ..

# The EPOS jar will be found automatically at ./target/tutorial-0.0.1.jar
# if you run the Spring Boot app from the project root, or set:
# export EPOS_JAR=/absolute/path/to/tutorial-0.0.1.jar
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
# API calls are proxied to http://localhost:8080 via vite.config.js
```

---

## Architecture summary

```
Browser
  │  HTTP
  ▼
Cloud Run: epos-frontend  (nginx, port 8080)
  │  /api/* proxy (or direct VITE_API_URL)
  ▼
Cloud Run: epos-backend   (Spring Boot, port 8080)
  │  subprocess
  ▼
epos.jar  (EPOS fat jar bundled in the image)
  │  writes to /tmp/epos-<jobId>/
  ▼
Output CSVs read and returned as JSON
```

## Cost estimate (Cloud Run, pay-per-use)

| Usage | ~Monthly cost |
|---|---|
| 10 runs/day, ~30 s each | < $1 |
| 100 runs/day, ~30 s each | ~$3–5 |
| Idle (scaled to 0) | $0 |

Cloud Run scales to zero when not in use — you only pay while the algorithm is running.
