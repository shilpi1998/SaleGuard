import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CheckType(str, enum.Enum):
    A_VERBATIM = "A_VERBATIM"
    B_FACTUAL = "B_FACTUAL"
    C_BEHAVIOUR = "C_BEHAVIOUR"


class ResultEnum(str, enum.Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOTE = "NOTE"


class GateDecision(str, enum.Enum):
    AUTO_SUBMIT = "auto_submit"
    HELD_CRITICAL_FAIL = "held_critical_fail"
    HELD_LOW_CONFIDENCE = "held_low_confidence"
    HELD_RANDOM_SAMPLE = "held_random_sample"
    PENDING = "pending"


class Retailer(Base):
    __tablename__ = "retailers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    leads: Mapped[list["Lead"]] = relationship(back_populates="retailer")
    checks: Mapped[list["CheckLibrary"]] = relationship(back_populates="retailer")


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    employee_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    site: Mapped[str | None] = mapped_column(String(100))
    team_leader_name: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    leads: Mapped[list["Lead"]] = relationship(back_populates="agent")


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    external_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"), nullable=False)
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"))
    campaign: Mapped[str | None] = mapped_column(String(200))
    customer_name: Mapped[str | None] = mapped_column(String(200))
    plan_name: Mapped[str | None] = mapped_column(String(200))
    plan_rate: Mapped[str | None] = mapped_column(String(100))
    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    crm_data: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(50), default="new")
    gate_decision: Mapped[str | None] = mapped_column(
        Enum(GateDecision, name="gate_decision_enum", create_constraint=False),
        default=GateDecision.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    retailer: Mapped["Retailer"] = relationship(back_populates="leads")
    agent: Mapped["Agent | None"] = relationship(back_populates="leads")
    recording: Mapped["Recording | None"] = relationship(back_populates="lead", uselist=False)
    transcript: Mapped["Transcript | None"] = relationship(back_populates="lead", uselist=False)
    scorecard: Mapped["Scorecard | None"] = relationship(back_populates="lead", uselist=False)
    score_results: Mapped[list["ScoreResult"]] = relationship(back_populates="lead")


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), unique=True, nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    mime_type: Mapped[str] = mapped_column(String(50), default="audio/wav")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="recording")
    transcript: Mapped["Transcript | None"] = relationship(back_populates="recording", uselist=False)


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), unique=True, nullable=False)
    recording_id: Mapped[int | None] = mapped_column(ForeignKey("recordings.id"), unique=True, nullable=True)
    utterances: Mapped[list] = mapped_column(JSONB, nullable=False)
    speaker_count: Mapped[int | None] = mapped_column(Integer)
    word_count: Mapped[int | None] = mapped_column(Integer)
    avg_confidence: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="transcript")
    recording: Mapped["Recording | None"] = relationship(back_populates="transcript")


class CheckLibrary(Base):
    __tablename__ = "check_library"
    __table_args__ = (
        UniqueConstraint("retailer_id", "code", "version", name="uq_check_retailer_code_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    check_type: Mapped[CheckType] = mapped_column(
        Enum(CheckType, name="check_type_enum"), nullable=False
    )
    category: Mapped[str | None] = mapped_column(String(100))
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    evaluation_config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    retailer: Mapped["Retailer"] = relationship(back_populates="checks")
    score_results: Mapped[list["ScoreResult"]] = relationship(back_populates="check")


class ScoreResult(Base):
    __tablename__ = "score_results"
    __table_args__ = (
        UniqueConstraint("lead_id", "check_id", name="uq_score_lead_check"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False)
    check_id: Mapped[int] = mapped_column(ForeignKey("check_library.id"), nullable=False)
    check_version: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[ResultEnum] = mapped_column(
        Enum(ResultEnum, name="result_enum"), nullable=False
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_text: Mapped[str] = mapped_column(Text, nullable=False)
    transcript_utterance_index: Mapped[int] = mapped_column(Integer, nullable=False)
    audio_timestamp_start: Mapped[float] = mapped_column(Float, nullable=False)
    audio_timestamp_end: Mapped[float] = mapped_column(Float, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)
    raw_llm_response: Mapped[dict | None] = mapped_column(JSONB)
    model_used: Mapped[str | None] = mapped_column(String(100))
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="score_results")
    check: Mapped["CheckLibrary"] = relationship(back_populates="score_results")
    overrides: Mapped[list["Override"]] = relationship(back_populates="score_result")


class Scorecard(Base):
    __tablename__ = "scorecards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), unique=True, nullable=False)
    retailer_id: Mapped[int] = mapped_column(ForeignKey("retailers.id"), nullable=False)
    total_checks: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    noted: Mapped[int] = mapped_column(Integer, default=0)
    critical_total: Mapped[int] = mapped_column(Integer, default=0)
    critical_passed: Mapped[int] = mapped_column(Integer, default=0)
    weighted_score: Mapped[float] = mapped_column(Float, default=0.0)
    weighted_score_excl_fatal: Mapped[float] = mapped_column(Float, default=0.0)
    gate_decision: Mapped[str] = mapped_column(
        Enum(GateDecision, name="gate_decision_enum", create_constraint=False),
        nullable=False,
    )
    is_random_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    scoring_duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="scorecard")


class Override(Base):
    __tablename__ = "overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    score_result_id: Mapped[int] = mapped_column(ForeignKey("score_results.id"), nullable=False)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), nullable=False)
    original_result: Mapped[ResultEnum] = mapped_column(
        Enum(ResultEnum, name="result_enum", create_constraint=False), nullable=False
    )
    new_result: Mapped[ResultEnum] = mapped_column(
        Enum(ResultEnum, name="result_enum", create_constraint=False), nullable=False
    )
    overridden_by: Mapped[str] = mapped_column(String(200), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    score_result: Mapped["ScoreResult"] = relationship(back_populates="overrides")
