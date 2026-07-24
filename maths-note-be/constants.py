import os

from dotenv import load_dotenv

load_dotenv()

SERVER_URL = os.getenv("SERVER_URL", "0.0.0.0")
PORT = os.getenv("PORT", "8900")
ENV = os.getenv("ENV", "dev")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "https://solveiq-two.vercel.app,http://localhost:5173")
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

APP_SECRET = os.getenv("APP_SECRET", "super-secret-default-key-12345")
