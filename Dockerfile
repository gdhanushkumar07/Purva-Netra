# purva-netra-api / purva-netra-worker (same image; the worker overrides the command)
FROM python:3.12-slim
ARG PN_BUILD=dev
ENV PN_BUILD=$PN_BUILD
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY src/ src/
RUN pip install --no-cache-dir -e . ecmwf-opendata cfgrib eccodes apscheduler bcrypt pyjwt "uvicorn[standard]"
COPY api/ api/
COPY configs/ configs/
COPY scripts/ scripts/
ENV PN_MODE=replay PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
