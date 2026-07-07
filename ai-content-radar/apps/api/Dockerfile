FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /srv

# 先装引擎包（缓存友好）
COPY packages/engine /srv/packages/engine
COPY apps/api/requirements.txt /srv/apps/api/requirements.txt
RUN pip install --no-cache-dir -r /srv/apps/api/requirements.txt

COPY apps/api /srv/apps/api
WORKDIR /srv/apps/api

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
