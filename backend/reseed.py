"""Quick reseed helper - run from backend dir with venv activated."""
from app.database import Base, engine, SessionLocal
from app.models.models import *  # noqa: F403

Base.metadata.create_all(bind=engine)

from app.seed.seed_data import seed_all

db = SessionLocal()
seed_all(db)
db.close()
print("Seeded successfully")
