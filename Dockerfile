# purva-netra-api: FastAPI over the precomputed replay store (no network needed at runtime)
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" duckdb pandas pyarrow numpy pyyaml
COPY api/ api/
COPY configs/ configs/
ENV PN_MODE=replay PN_PROCESSED=/app/data/processed PN_FEEDBACK=/app/data/feedback
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
