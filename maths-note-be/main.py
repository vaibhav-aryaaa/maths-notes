from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from apps.calculator.route import router as calculator_router
from apps.copilot.route import router as copilot_router
from constants import SERVER_URL, PORT, ENV, ALLOWED_ORIGINS
from rate_limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get('/')
@app.head('/')
async def root():
    return {"message": "Server is running"}

app.include_router(calculator_router, prefix="/calculate", tags=["calculate"])
app.include_router(copilot_router, prefix="/copilot", tags=["copilot"])


if __name__ == "__main__":
    uvicorn.run("main:app", host=SERVER_URL, port=int(PORT), reload=(ENV == "dev"))