---
title: Voice Helper
emoji: 🚀
colorFrom: blue
colorTo: pink
sdk: docker
pinned: false
app_port: 7860
---

## 🚢 Docker & Hugging Face Spaces (🔧)

This repository is set up to build a production Docker image suitable for deployment on **Hugging Face Spaces** (select the **Docker** SDK when creating a Space). The server listens on port `7860` (Spaces default).

### Build & run locally

```bash
# Build image
docker build -t grandpas-voice-helper:latest .

# Run (set your Gemini/API key via API_KEY env var)
docker run -it --rm -p 7860:7860 -e API_KEY="$API_KEY" grandpas-voice-helper:latest
```

Visit http://localhost:7860 to view the app.

### Deploy to Hugging Face Spaces

1. Create a new Space and choose **Docker** as the SDK.
2. Push this repository to the Space (or link your repo).
3. In the Space settings, add a secret named `API_KEY` with your Gemini API key (Settings → Secrets).
4. The Space will build the Docker image and run the container exposing port `7860`.

### Notes

- The Docker image uses a multi-stage build: dev dependencies are used to build, and only production dependencies are installed in the final image.
- The app requires the `API_KEY` environment variable (Gemini API key) to call the GenAI APIs; set it in the Space secrets or provide it at runtime.
