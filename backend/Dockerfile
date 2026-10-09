# ScamGuard Multimodal backend
# CPU-only image (hackathon demo). Swap base for nvidia/cuda for GPU inference.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# ffmpeg for audio decoding, libgl/libglib for mediapipe/opencv
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu \
 && find /usr/local/lib/python3.11/site-packages/torch -type d -name "test" -prune -exec rm -rf {} + \
 && grep -v -E "^(torch|torchaudio)==" requirements.txt > /tmp/req.txt \
 && pip install -r /tmp/req.txt \
 && rm -rf /usr/local/lib/python3.11/site-packages/sklearn/datasets/images/*

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
