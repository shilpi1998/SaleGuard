from datetime import date, datetime

from pydantic import BaseModel, Field


# --- Retailer ---

class RetailerCreate(BaseModel):
    name: str
    code: str
    active: bool = True


class RetailerUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    active: bool | None = None


class RetailerOut(BaseModel):
    id: int
    name: str
    code: str
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Agent ---

class AgentCreate(BaseModel):
    name: str
    employee_id: str
    site: str | None = None
    team_leader_name: str | None = None


class AgentOut(BaseModel):
    id: int
    name: str
    employee_id: str
    site: str | None
    team_leader_name: str | None
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Lead ---

class LeadCreate(BaseModel):
    external_id: str
    retailer_id: int
    agent_id: int | None = None
    campaign: str | None = None
    customer_name: str | None = None
    plan_name: str | None = None
    plan_rate: str | None = None
    sale_date: date
    crm_data: dict | None = None


class LeadUpdate(BaseModel):
    external_id: str | None = None
    retailer_id: int | None = None
    agent_id: int | None = None
    campaign: str | None = None
    customer_name: str | None = None
    plan_name: str | None = None
    plan_rate: str | None = None
    sale_date: date | None = None
    crm_data: dict | None = None
    status: str | None = None


class LeadOut(BaseModel):
    id: int
    external_id: str
    retailer_id: int
    agent_id: int | None
    campaign: str | None
    customer_name: str | None
    plan_name: str | None
    plan_rate: str | None
    sale_date: date
    crm_data: dict | None
    status: str
    gate_decision: str | None
    created_at: datetime
    updated_at: datetime
    retailer: RetailerOut | None = None
    agent: AgentOut | None = None

    model_config = {"from_attributes": True}


class LeadListOut(BaseModel):
    id: int
    external_id: str
    customer_name: str | None
    retailer_name: str | None = None
    agent_name: str | None = None
    sale_date: date
    status: str
    gate_decision: str | None
    weighted_score: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Recording ---

class RecordingOut(BaseModel):
    id: int
    lead_id: int
    file_path: str
    duration_seconds: float | None
    mime_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Transcript ---

class Utterance(BaseModel):
    index: int
    speaker: int
    speaker_label: str
    text: str
    start: float
    end: float
    words: list[dict] = []


class TranscriptOut(BaseModel):
    id: int
    lead_id: int
    utterances: list[Utterance]
    speaker_count: int | None
    word_count: int | None
    avg_confidence: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Check Library ---

class CheckCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    check_type: str
    category: str | None = None
    is_critical: bool = False
    weight: float = 1.0
    evaluation_config: dict
    sort_order: int = 0
    effective_from: date
    effective_to: date | None = None
    version: int = 1


class CheckOut(BaseModel):
    id: int
    retailer_id: int
    code: str
    name: str
    description: str | None
    check_type: str
    category: str | None
    is_critical: bool
    weight: float
    evaluation_config: dict
    sort_order: int
    effective_from: date
    effective_to: date | None
    version: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CheckImport(BaseModel):
    checks: list[CheckCreate]


class AdminCheckCreate(CheckCreate):
    retailer_id: int


class AdminCheckUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    check_type: str | None = None
    category: str | None = None
    is_critical: bool | None = None
    weight: float | None = None
    evaluation_config: dict | None = None
    sort_order: int | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    version: int | None = None


# --- Override ---

class OverrideCreate(BaseModel):
    new_result: str = Field(..., pattern="^(PASS|FAIL|NOTE)$")
    overridden_by: str
    reason: str = Field(..., min_length=1)


class OverrideOut(BaseModel):
    id: int
    score_result_id: int
    lead_id: int
    original_result: str
    new_result: str
    overridden_by: str
    reason: str
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Score Result ---

class ScoreResultOut(BaseModel):
    id: int
    lead_id: int
    check_id: int
    check_version: int
    result: str
    confidence: float
    evidence_text: str
    transcript_utterance_index: int
    audio_timestamp_start: float
    audio_timestamp_end: float
    reasoning: str
    model_used: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    latency_ms: int | None
    created_at: datetime
    check: CheckOut | None = None
    overrides: list[OverrideOut] = []

    model_config = {"from_attributes": True}


# --- Scorecard ---

class ScorecardOut(BaseModel):
    id: int
    lead_id: int
    retailer_id: int
    total_checks: int
    passed: int
    failed: int
    noted: int
    critical_total: int
    critical_passed: int
    weighted_score: float
    weighted_score_excl_fatal: float
    gate_decision: str
    is_random_sample: bool
    scoring_duration_ms: int | None
    created_at: datetime
    results: list[ScoreResultOut] = []

    model_config = {"from_attributes": True}


# --- Dashboard ---

class DashboardSummary(BaseModel):
    total_scored: int
    total_passed: int
    total_failed: int
    pass_rate: float
    critical_fail_rate: float
    first_pass_yield: float
    avg_weighted_score: float
    avg_weighted_score_excl_fatal: float
    avg_confidence: float


class CriticalFailBreakdown(BaseModel):
    check_code: str
    check_name: str
    check_type: str
    retailer_name: str
    fail_count: int
    total_scored: int
    fail_rate: float


class RepeatOffender(BaseModel):
    agent_id: int
    agent_name: str
    employee_id: str
    critical_fail_count: int
    leads_scored: int
    fail_rate: float


class GateDistribution(BaseModel):
    gate_decision: str
    count: int


class AgentPerformance(BaseModel):
    agent_id: int
    agent_name: str
    employee_id: str
    site: str | None
    team_leader_name: str | None
    leads_scored: int
    passed: int
    failed: int
    pass_rate: float
    critical_fail_count: int
    critical_fail_rate: float
    avg_weighted_score: float
    avg_weighted_score_excl_fatal: float


class DimensionBreakdown(BaseModel):
    group_name: str
    leads_scored: int
    passed: int
    failed: int
    pass_rate: float
    critical_fail_rate: float
    avg_weighted_score: float


class AuditorAgreement(BaseModel):
    total_overrides: int
    fail_to_pass_count: int
    fail_to_note_count: int
    agreement_rate: float


# --- Process Pipeline ---

class ProcessRequest(BaseModel):
    skip_transcription: bool = False


class ProcessResponse(BaseModel):
    lead_id: int
    gate_decision: str
    scorecard: ScorecardOut
    message: str
