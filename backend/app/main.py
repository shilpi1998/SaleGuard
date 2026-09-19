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


@app.get("/api/v1/debug/transcribe/{lead_id}")
def debug_transcribe(lead_id: int):
    import traceback
    try:
        db = SessionLocal()
        from app.models import models
        rec = db.query(models.Recording).filter(models.Recording.lead_id == lead_id).first()
        if not rec:
            return {"error": "no recording"}
        file_path = rec.file_path
        if not os.path.isabs(file_path):
            from app.config import _BACKEND_DIR
            file_path = os.path.join(_BACKEND_DIR, file_path.lstrip("./"))
        exists = os.path.exists(file_path)
        settings = get_settings()
        has_key = bool(settings.DEEPGRAM_API_KEY and settings.DEEPGRAM_API_KEY != "your-key-here")
        if not exists:
            return {"error": "file not found", "path": file_path, "has_key": has_key}
        from app.services.transcription import transcribe
        result = transcribe(file_path, lead_id)
        db.close()
        return {"ok": True, "utterances": len(result["utterances"]), "path": file_path, "has_key": has_key}
    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}


@app.post("/api/v1/seed")
def seed_database():
    from app.seed.seed_data import seed_all

    db = SessionLocal()
    try:
        seed_all(db)
        return {"status": "ok", "message": "Database seeded"}
    finally:
        db.close()
