import json
import os
import shutil

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.database import get_db
from app.models import models
from app.schemas import schemas

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("/", response_model=schemas.LeadOut, status_code=status.HTTP_201_CREATED)
def create_lead(payload: schemas.LeadCreate, db: Session = Depends(get_db)):
    retailer = db.get(models.Retailer, payload.retailer_id)
    if not retailer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Retailer not found")

    if payload.agent_id is not None:
        agent = db.get(models.Agent, payload.agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    lead = models.Lead(**payload.model_dump())
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/", response_model=list[schemas.LeadListOut])
def list_leads(
    retailer_id: int | None = None,
    status: str | None = None,
    gate_decision: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            models.Lead,
            models.Retailer.name.label("retailer_name"),
            models.Agent.name.label("agent_name"),
            models.Scorecard.weighted_score.label("weighted_score"),
        )
        .outerjoin(models.Retailer, models.Lead.retailer_id == models.Retailer.id)
        .outerjoin(models.Agent, models.Lead.agent_id == models.Agent.id)
        .outerjoin(models.Scorecard, models.Scorecard.lead_id == models.Lead.id)
    )

    if retailer_id is not None:
        query = query.filter(models.Lead.retailer_id == retailer_id)
    if status is not None:
        query = query.filter(models.Lead.status == status)
    if gate_decision is not None:
        # Supports comma-separated list of gate decisions, e.g.
        # "held_critical_fail,held_low_confidence,held_random_sample"
        values = [v.strip() for v in gate_decision.split(",") if v.strip()]
        if len(values) == 1:
            query = query.filter(models.Lead.gate_decision == values[0])
        elif len(values) > 1:
            query = query.filter(models.Lead.gate_decision.in_(values))

    rows = (
        query.order_by(models.Lead.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    results: list[schemas.LeadListOut] = []
    for lead, retailer_name, agent_name, weighted_score in rows:
        results.append(
            schemas.LeadListOut(
                id=lead.id,
                external_id=lead.external_id,
                customer_name=lead.customer_name,
                retailer_name=retailer_name,
                agent_name=agent_name,
                sale_date=lead.sale_date,
                status=lead.status,
                gate_decision=lead.gate_decision,
                weighted_score=weighted_score,
                created_at=lead.created_at,
            )
        )
    return results


@router.get("/{lead_id}", response_model=schemas.LeadOut)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = (
        db.query(models.Lead)
        .options(joinedload(models.Lead.retailer), joinedload(models.Lead.agent))
        .filter(models.Lead.id == lead_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


@router.post(
    "/{lead_id}/recording",
    response_model=schemas.RecordingOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_recording(
    lead_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    settings = get_settings()
    lead_dir = os.path.join(settings.UPLOAD_DIR, str(lead_id))
    os.makedirs(lead_dir, exist_ok=True)

    filename = file.filename or "recording.wav"
    file_path = os.path.join(lead_dir, filename)

    with open(file_path, "wb") as out_file:
        shutil.copyfileobj(file.file, out_file)

    mime_type = file.content_type or "audio/wav"

    recording = (
        db.query(models.Recording).filter(models.Recording.lead_id == lead_id).first()
    )
    if recording:
        recording.file_path = file_path
        recording.mime_type = mime_type
    else:
        recording = models.Recording(
            lead_id=lead_id, file_path=file_path, mime_type=mime_type
        )
        db.add(recording)

    db.commit()
    db.refresh(recording)
    return recording


@router.delete("/{lead_id}/recording", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(lead_id: int, db: Session = Depends(get_db)):
    recording = (
        db.query(models.Recording).filter(models.Recording.lead_id == lead_id).first()
    )
    if not recording:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    if recording.file_path and os.path.exists(recording.file_path):
        os.remove(recording.file_path)

    db.delete(recording)
    db.commit()


@router.get("/{lead_id}/recording", response_model=schemas.RecordingOut)
def get_recording(lead_id: int, db: Session = Depends(get_db)):
    recording = (
        db.query(models.Recording).filter(models.Recording.lead_id == lead_id).first()
    )
    if not recording:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return recording


@router.get("/{lead_id}/transcript", response_model=schemas.TranscriptOut)
def get_transcript(lead_id: int, db: Session = Depends(get_db)):
    transcript = (
        db.query(models.Transcript).filter(models.Transcript.lead_id == lead_id).first()
    )
    if not transcript:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found")
    return transcript


@router.post(
    "/{lead_id}/transcript",
    response_model=schemas.TranscriptOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_transcript(
    lead_id: int,
    file: UploadFile | None = File(None),
    utterances: list[dict] | None = Body(None),
    db: Session = Depends(get_db),
):
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    if file is not None:
        content = await file.read()
        data = json.loads(content)
        utts = data if isinstance(data, list) else data.get("utterances", data)
    elif utterances is not None:
        utts = utterances
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either a JSON file upload or utterances in body",
        )

    word_count = sum(len(u.get("text", "").split()) for u in utts)
    speakers = set(u.get("speaker", 0) for u in utts)

    transcript = (
        db.query(models.Transcript).filter(models.Transcript.lead_id == lead_id).first()
    )
    if transcript:
        transcript.utterances = utts
        transcript.speaker_count = len(speakers)
        transcript.word_count = word_count
        transcript.avg_confidence = 0.95
    else:
        transcript = models.Transcript(
            lead_id=lead_id,
            recording_id=None,
            utterances=utts,
            speaker_count=len(speakers),
            word_count=word_count,
            avg_confidence=0.95,
        )
        db.add(transcript)

    db.commit()
    db.refresh(transcript)
    return transcript


@router.post("/{lead_id}/transcribe", response_model=schemas.TranscriptOut)
def transcribe_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    recording = (
        db.query(models.Recording).filter(models.Recording.lead_id == lead_id).first()
    )
    if not recording:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recording not found for this lead",
        )

    from app.services.transcription import transcribe

    file_path = recording.file_path
    if not os.path.isabs(file_path):
        from app.config import _BACKEND_DIR
        file_path = os.path.join(_BACKEND_DIR, file_path.lstrip("./"))

    result = transcribe(file_path, lead_id)

    transcript = (
        db.query(models.Transcript).filter(models.Transcript.lead_id == lead_id).first()
    )
    if transcript:
        transcript.utterances = result["utterances"]
        transcript.speaker_count = result.get("speaker_count")
        transcript.word_count = result.get("word_count")
        transcript.avg_confidence = result.get("avg_confidence")
    else:
        transcript = models.Transcript(
            lead_id=lead_id,
            recording_id=recording.id,
            utterances=result["utterances"],
            speaker_count=result.get("speaker_count"),
            word_count=result.get("word_count"),
            avg_confidence=result.get("avg_confidence"),
        )
        db.add(transcript)

    db.commit()
    db.refresh(transcript)
    return transcript


@router.post("/{lead_id}/score", response_model=schemas.ScorecardOut)
def score_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    transcript = (
        db.query(models.Transcript).filter(models.Transcript.lead_id == lead_id).first()
    )
    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lead has no transcript to score",
        )

    from app.services.scoring.orchestrator import ScoringOrchestrator

    orchestrator = ScoringOrchestrator()
    scorecard = orchestrator.score_lead(lead_id, db)
    return scorecard


@router.post("/{lead_id}/process", response_model=schemas.ProcessResponse)
def process_lead(
    lead_id: int,
    payload: schemas.ProcessRequest | None = None,
    db: Session = Depends(get_db),
):
    lead = db.get(models.Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    payload = payload or schemas.ProcessRequest()

    transcript = (
        db.query(models.Transcript).filter(models.Transcript.lead_id == lead_id).first()
    )

    if not transcript and not payload.skip_transcription:
        recording = (
            db.query(models.Recording).filter(models.Recording.lead_id == lead_id).first()
        )
        if not recording:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recording not found for this lead; cannot transcribe",
            )

        from app.services.transcription import transcribe
        from app.config import _BACKEND_DIR

        proc_file_path = recording.file_path
        if not os.path.isabs(proc_file_path):
            proc_file_path = os.path.join(_BACKEND_DIR, proc_file_path.lstrip("./"))

        result = transcribe(proc_file_path, lead_id)
        transcript = models.Transcript(
            lead_id=lead_id,
            recording_id=recording.id,
            utterances=result["utterances"],
            speaker_count=result.get("speaker_count"),
            word_count=result.get("word_count"),
            avg_confidence=result.get("avg_confidence"),
        )
        db.add(transcript)
        db.commit()
        db.refresh(transcript)

    if not transcript:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No transcript available for scoring",
        )

    from app.services.scoring.orchestrator import ScoringOrchestrator

    orchestrator = ScoringOrchestrator()
    scorecard = orchestrator.score_lead(lead_id, db)

    return schemas.ProcessResponse(
        lead_id=lead_id,
        gate_decision=scorecard.gate_decision,
        scorecard=scorecard,
        message="Lead processed successfully",
    )


@router.get("/{lead_id}/scorecard", response_model=schemas.ScorecardOut)
def get_scorecard(lead_id: int, db: Session = Depends(get_db)):
    scorecard = (
        db.query(models.Scorecard).filter(models.Scorecard.lead_id == lead_id).first()
    )
    if not scorecard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scorecard not found")

    results = (
        db.query(models.ScoreResult)
        .options(
            joinedload(models.ScoreResult.check),
            joinedload(models.ScoreResult.overrides),
        )
        .filter(models.ScoreResult.lead_id == lead_id)
        .order_by(models.ScoreResult.id)
        .all()
    )

    scorecard_out = schemas.ScorecardOut.model_validate(scorecard)
    scorecard_out.results = [schemas.ScoreResultOut.model_validate(r) for r in results]
    return scorecard_out
