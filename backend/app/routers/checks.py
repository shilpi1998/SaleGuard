from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import models
from app.schemas import schemas

router = APIRouter(prefix="/retailers", tags=["checks"])


@router.get("/{retailer_id}/checks", response_model=list[schemas.CheckOut])
def get_active_checks(
    retailer_id: int,
    effective_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    retailer = db.get(models.Retailer, retailer_id)
    if not retailer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retailer not found")

    eff_date = effective_date or date.today()

    checks = (
        db.query(models.CheckLibrary)
        .filter(models.CheckLibrary.retailer_id == retailer_id)
        .filter(models.CheckLibrary.effective_from <= eff_date)
        .filter(
            or_(
                models.CheckLibrary.effective_to.is_(None),
                models.CheckLibrary.effective_to >= eff_date,
            )
        )
        .order_by(models.CheckLibrary.sort_order)
        .all()
    )
    return checks


@router.post(
    "/{retailer_id}/checks/import",
    response_model=list[schemas.CheckOut],
    status_code=status.HTTP_201_CREATED,
)
def import_checks(
    retailer_id: int, payload: schemas.CheckImport, db: Session = Depends(get_db)
):
    retailer = db.get(models.Retailer, retailer_id)
    if not retailer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retailer not found")

    created: list[models.CheckLibrary] = []
    for check_data in payload.checks:
        check = models.CheckLibrary(retailer_id=retailer_id, **check_data.model_dump())
        db.add(check)
        created.append(check)

    db.commit()
    for check in created:
        db.refresh(check)

    return created
