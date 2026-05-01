FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# EXPOSE 8900 is optional as most platforms ignore it and use $PORT
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8900}
