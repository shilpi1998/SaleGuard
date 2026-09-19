from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import models
from app.schemas import schemas

router = APIRouter(prefix="/scores", tags=["overrides"])


@router.post(
    "/{score_result_id}/override",
    response_model=schemas.OverrideOut,
    status_code=status.HTTP_201_CREATED,
)
def create_override(
    score_result_id: int, payload: schemas.OverrideCreate, db: Session = Depends(get_db)
):
    score_result = db.get(models.ScoreResult, score_result_id)
    if not score_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Score result not found"
        )

    override = models.Override(
        score_result_id=score_result.id,
        lead_id=score_result.lead_id,
        original_result=score_result.result,
        new_result=payload.new_result,
        overridden_by=payload.overridden_by,
        reason=payload.reason,
    )
    db.add(override)

    score_result.result = payload.new_result

    db.commit()
    db.refresh(override)
    return override


@router.get("/{score_result_id}/overrides", response_model=list[schemas.OverrideOut])
def get_override_history(score_result_id: int, db: Session = Depends(get_db)):
    score_result = db.get(models.ScoreResult, score_result_id)
    if not score_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Score result not found"
        )

    overrides = (
        db.query(models.Override)
        .filter(models.Override.score_result_id == score_result_id)
        .order_by(models.Override.created_at)
        .all()
    )
    return overrides
