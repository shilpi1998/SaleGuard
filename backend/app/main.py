import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.routers import admin, checks, dashboard, leads, overrides, recordings, scoring


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(get_settings().UPLOAD_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="SaleGuard",
    description="AI-powered sales call QA scoring pipeline",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(leads.router, prefix="/api/v1")
app.include_router(recordings.router, prefix="/api/v1")
app.include_router(scoring.router, prefix="/api/v1")
app.include_router(checks.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(overrides.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"status": "ok", "service": "SaleGuard"}


@app.post("/api/v1/seed")
def seed_database():
    from app.seed.seed_data import seed_all

    db = SessionLocal()
    try:
        seed_all(db)
        return {"status": "ok", "message": "Database seeded"}
    finally:
        db.close()
