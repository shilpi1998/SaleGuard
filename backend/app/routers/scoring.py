from fastapi import APIRouter

router = APIRouter(prefix="/scoring", tags=["scoring"])


@router.get("/status")
def scoring_status():
    """Lightweight health check for the scoring subsystem.

    The actual scoring endpoints (score / process / scorecard) live on the
    leads router since scoring always operates in the context of a lead.
    """
    return {"status": "ready"}
