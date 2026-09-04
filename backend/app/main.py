from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap import bootstrap_auth
from app.config import settings
from app.routers import admin, appointments, auth, capture, interests, leads, public, seed


@asynccontextmanager
async def lifespan(_app: FastAPI):
    bootstrap_auth()
    yield


app = FastAPI(
    title="FUNNEL by Conninter API",
    description="Booth lead-capture API for FUNNEL by Conninter",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(capture.router)
app.include_router(public.router)
app.include_router(seed.router)
app.include_router(leads.router)
app.include_router(appointments.router)
app.include_router(interests.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
