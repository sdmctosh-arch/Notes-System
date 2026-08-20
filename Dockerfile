# Builds the React frontend, then serves it and the API from one FastAPI
# process (PROJECT.md 10.2: "one Docker container", "FastAPI serves the
# files"). Two stages so the final image doesn't carry Node or node_modules.

FROM node:22.22.2-slim AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12.7-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend-build /app/dist ./static

EXPOSE 8100
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
