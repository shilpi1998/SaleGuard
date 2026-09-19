from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import models
from app.schemas import schemas

router = APIRouter(prefix="/admin", tags=["admin"])


# --- Retailers ---

@router.get("/retailers", response_model=list[schemas.RetailerOut])
def list_retailers(db: Session = Depends(get_db)):
    return db.query(models.Retailer).order_by(models.Retailer.name).all()


@router.post(
    "/retailers", response_model=schemas.RetailerOut, status_code=status.HTTP_201_CREATED
)
def create_retailer(payload: schemas.RetailerCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.Retailer).filter(models.Retailer.code == payload.code).first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A retailer with this code already exists",
        )

    retailer = models.Retailer(**payload.model_dump())
    db.add(retailer)
    db.commit()
    db.refresh(retailer)
    return retailer


@router.put("/retailers/{retailer_id}", response_model=schemas.RetailerOut)
def update_retailer(
    retailer_id: int, payload: schemas.RetailerUpdate, db: Session = Depends(get_db)
):
    retailer = db.get(models.Retailer, retailer_id)
    if not retailer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retailer not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "code" in update_data and update_data["code"] != retailer.code:
        existing = (
            db.query(models.Retailer)
            .filter(models.Retailer.code == update_data["code"])
            .filter(models.Retailer.id != retailer_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A retailer with this code already exists",
            )

    for field, value in update_data.items():
        setattr(retailer, field, value)

    db.commit()
    db.refresh(retailer)
    return retailer


# --- Agents ---

@router.get("/agents", response_model=list[schemas.AgentOut])
def list_agents(db: Session = Depends(get_db)):
    return db.query(models.Agent).order_by(models.Agent.name).all()


# --- Checks ---

@router.post(
    "/checks", response_model=schemas.CheckOut, status_code=status.HTTP_201_CREATED
)
def create_check(payload: schemas.AdminCheckCreate, db: Session = Depends(get_db)):
    retailer = db.get(models.Retailer, payload.retailer_id)
    if not retailer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retailer not found")

    check = models.CheckLibrary(**payload.model_dump())
    db.add(check)
    db.commit()
    db.refresh(check)
    return check


@router.put("/checks/{check_id}", response_model=schemas.CheckOut)
def update_check(
    check_id: int, payload: schemas.AdminCheckUpdate, db: Session = Depends(get_db)
):
    check = db.get(models.CheckLibrary, check_id)
    if not check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(check, field, value)

    db.commit()
    db.refresh(check)
    return check


@router.delete("/checks/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_check(check_id: int, db: Session = Depends(get_db)):
    check = db.get(models.CheckLibrary, check_id)
    if not check:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check not found")

    db.delete(check)
    db.commit()
    return None


# --- Leads ---

@router.post(
    "/leads", response_model=schemas.LeadOut, status_code=status.HTTP_201_CREATED
)
def create_lead(payload: schemas.LeadCreate, db: Session = Depends(get_db)):
    retailer = db.get(models.Retailer, payload.retailer_id)
    if not retailer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retailer not found")

    if payload.agent_id is not None:
        agent = db.get(models.Agent, payload.agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    existing = (
        db.query(models.Lead)
        .filter(models.Lead.external_id == payload.external_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A lead with this external_id already exists",
        )

    lead = models.Lead(**payload.model_dump())
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.put("/leads/{lead_id}", response_model=schemas.LeadOut)
def update_lead(lead_id: int, payload: schemas.LeadUpdate, db: Session = Depends(get_db)):
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "retailer_id" in update_data:
        retailer = db.get(models.Retailer, update_data["retailer_id"])
        if not retailer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retailer not found")

    if update_data.get("agent_id") is not None:
        agent = db.get(models.Agent, update_data["agent_id"])
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if "external_id" in update_data and update_data["external_id"] != lead.external_id:
        existing = (
            db.query(models.Lead)
            .filter(models.Lead.external_id == update_data["external_id"])
            .filter(models.Lead.id != lead_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A lead with this external_id already exists",
            )

    for field, value in update_data.items():
        setattr(lead, field, value)

    db.commit()
    db.refresh(lead)
    return lead
