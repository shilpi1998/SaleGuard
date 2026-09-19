# CIMET QA Automation System — Architecture & Build Plan

## Context

CIMET runs a comparison platform for Australian energy/broadband. Sales agents make phone calls to sell plans. Today, human auditors manually listen to 30-min recordings, fill Excel checklists, and decide pass/fail. This doesn't scale (thousands of sales/month, ~30 retailers). The hackathon ask: automate this entirely — recording in, AI-scored scorecard out, sale auto-submits or is held with exact evidence.

**Judges will test with their own data** — no hardcoded checks or fake pass/fail.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | **Python + FastAPI** | Claude SDK is Python-native, Deepgram SDK is Python, async support |
| Frontend | **Next.js + TypeScript + shadcn/ui + Recharts** | Rapid UI, beautiful dashboards, good DX |
| Database | **PostgreSQL** (Docker) | JSONB, window functions for dashboards, GROUP BY aggregations |
| Transcription | **Deepgram Nova-2** | Speaker diarization, word-level timestamps, PII redaction, $200 free tier |
| LLM | **Claude Sonnet** (Anthropic API) | Fast (2-4s/check), accurate for structured QA, tool_use for guaranteed schema |
| Audio storage | Local filesystem | Served by FastAPI with Range header support |

---

## Data Model (8 tables)

### Core tables
- **retailers** — id, name, code, active
- **agents** — id, name, employee_id, site, team_leader_name (denormalized), active
- **leads** — id, external_id, retailer_id (FK), agent_id (FK), campaign, customer_name, plan_name, plan_rate, sale_date, `crm_data` (JSONB — flexible CRM fields per retailer), status, gate_decision
- **recordings** — id, lead_id (FK, UNIQUE), file_path, duration_seconds, mime_type
- **transcripts** — id, lead_id (FK, UNIQUE), recording_id (FK), `utterances` (JSONB — array of {index, speaker, speaker_label, text, start, end, words[]}), speaker_count, word_count, avg_confidence

### Scoring tables
- **check_library** — id, retailer_id (FK), code, name, description, check_type (A_VERBATIM / B_FACTUAL / C_BEHAVIOUR), category, is_critical, weight, `evaluation_config` (JSONB — type-specific config drives prompts dynamically), sort_order, effective_from, effective_to, version. UNIQUE(retailer_id, code, version)
- **score_results** — id, lead_id (FK), check_id (FK), check_version, result (PASS/FAIL/NOTE), confidence (0-1), evidence_text, transcript_utterance_index, audio_timestamp_start, audio_timestamp_end, reasoning, raw_llm_response (JSONB), model_used, prompt_tokens, completion_tokens, latency_ms. UNIQUE(lead_id, check_id)
- **scorecards** — id, lead_id (FK, UNIQUE), retailer_id, total_checks, passed, failed, noted, critical_total, critical_passed, weighted_score, weighted_score_excl_fatal, gate_decision, is_random_sample, scoring_duration_ms
- **overrides** — id, score_result_id (FK), lead_id (FK), original_result, new_result, overridden_by, reason (required), created_at

### Key design: `evaluation_config` JSONB by check type

**Type A (Verbatim):**
```json
{"approved_script": "This call is recorded for...", "key_phrases": ["recorded", "quality"], "match_threshold": 0.80, "speaker": "agent"}
```

**Type B (Factual):**
```json
{"crm_fields": ["plan_rate", "email"], "rate_card_reference": {"rate_kwh": 0.264}, "comparison_rules": "Exact match. 1 cent rounding OK.", "speaker": "agent"}
```

**Type C (Behaviour):**
```json
{"behaviour_type": "dead_air", "threshold_seconds": 8, "max_occurrences": 2, "instructions": "Flag silences > 8s between speakers."}
```

New retailer = new rows in check_library. **No code changes.** This is the "not hardcoded" property.

---

## Scoring Engine Architecture (The Brain)

### Three layers:

**1. ScoringOrchestrator** (`services/scoring/orchestrator.py`)
- Loads lead + transcript + active checks for sale_date (versioning guardrail)
- Dispatches each check to the correct evaluator via EvaluatorFactory
- Runs checks sequentially (simple and reliable for hackathon)
- Calculates aggregate scorecard (weighted scores with/without fatals)
- Applies gate logic
- Persists all results
- Supports idempotent re-scoring (clears old results before inserting new ones)

**2. EvaluatorFactory** — Maps check_type to evaluator class:
- `A_VERBATIM` -> VerbatimEvaluator
- `B_FACTUAL` -> FactualEvaluator
- `C_BEHAVIOUR` -> BehaviourEvaluator

**3. Evaluators** (all inherit BaseEvaluator):

**BaseEvaluator** pattern:
- `build_system_prompt(check, lead)` — abstract, type-specific
- `build_user_prompt(check, lead, transcript)` — abstract, builds from evaluation_config dynamically
- `evaluate()` — calls Claude with `tool_choice: {"type": "tool"}` forcing structured output via `record_check_result` tool
- Tool schema guarantees: result, confidence, evidence_text, transcript_utterance_index, audio_timestamp_start/end, reasoning
- `format_transcript()` — shared: formats utterances as `[index] [start-end] Speaker: text`

**VerbatimEvaluator**: Prompts Claude with approved_script + key_phrases + full transcript. Claude finds where agent said it, evaluates semantic match, returns evidence.

**FactualEvaluator**: Prompts Claude with CRM field values + rate_card_reference + comparison_rules + transcript. Claude does three-way comparison, returns field-by-field match results.

**BehaviourEvaluator**: Prompts Claude with behaviour criteria + thresholds + transcript. Claude analyzes patterns (dead air, interruptions, rapport).

### Gate Logic (`services/scoring/gate.py`)
1. Any critical FAIL -> `held_critical_fail`
2. Any check confidence < 0.70 -> `held_low_confidence`
3. Random 5% of clean calls -> `held_random_sample`
4. All clear -> `auto_submit`

---

## API Endpoints

### Ingestion
- `POST /api/v1/leads` — create lead with CRM data
- `POST /api/v1/leads/{id}/recording` — upload audio (multipart)
- `POST /api/v1/leads/{id}/transcribe` — trigger Deepgram (sync for hackathon)
- `GET /api/v1/leads/{id}/transcript` — return structured transcript

### Scoring
- `POST /api/v1/leads/{id}/score` — run scoring engine
- `GET /api/v1/leads/{id}/scorecard` — full scorecard with all check results
- `POST /api/v1/leads/{id}/process` — **one-click pipeline**: transcribe + score (demo endpoint)

### Check Library
- `GET /api/v1/retailers/{id}/checks?effective_date=...` — active checks for date
- `POST /api/v1/retailers/{id}/checks/import` — bulk import from JSON

### Override
- `POST /api/v1/scores/{id}/override` — override with reason (logged)

### Dashboard
- `GET /api/v1/dashboard/summary?retailer_id=&period=&from=&to=`
- `GET /api/v1/dashboard/critical-fails?...`
- `GET /api/v1/dashboard/repeat-offenders?window_days=7&min_occurrences=3`

### Audio
- `GET /api/v1/recordings/{id}/audio` — serve with Range headers for seeking

---

## Frontend Pages

### 1. Dashboard (`/`)
Summary cards (total scored, pass rate, critical fail rate, first-pass yield) + charts (critical fails by check, score distribution, trends) + repeat offenders table + filters (retailer, period, date range)

### 2. Lead List (`/leads`)
DataTable with status badges, scores, gate decisions, click-to-view

### 3. Scorecard (`/leads/[id]`) — **THE DEMO PAGE**
- Lead header + gate decision banner
- Check results table (PASS/FAIL/NOTE badges, confidence bars, evidence, override button)
- Transcript viewer (speaker labels, PII redaction, highlighted evidence)
- Audio player (seekTo from evidence clicks, playback speed)
- Override modal (new result, name, reason — all logged)
- CRM data display

### 4. Check Library (`/checks`)
View/import checks per retailer

---

## Guardrails Built Into Architecture

| Guardrail | How it's implemented |
|-----------|---------------------|
| Consent is a check | Recording disclaimer is a Type A check in check_library, not assumed |
| PII redaction | Regex masks card numbers (`\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`) in transcript display |
| Version scoring | `_get_active_checks()` filters by `effective_from <= sale_date AND (effective_to IS NULL OR effective_to >= sale_date)` |
| No auto-correction | System only reports PASS/FAIL with evidence — never modifies lead data |
| Override logging | `overrides` table records who, when, original, new, reason — never silently dropped |
| 5% sampling | Gate logic randomly samples clean calls for human calibration |

---

## Project Structure

```
CIMET/
├── docker-compose.yml
├── PLAN.md
├── backend/
│   ├── .env
│   ├── .env.example
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── models/
│       │   └── models.py          # All 8 SQLAlchemy models
│       ├── schemas/
│       │   └── schemas.py          # All Pydantic request/response schemas
│       ├── routers/
│       │   ├── leads.py            # Lead CRUD + upload + transcribe + score + process
│       │   ├── recordings.py       # Audio streaming with Range headers
│       │   ├── scoring.py          # Health check
│       │   ├── checks.py           # Check library CRUD + import
│       │   ├── dashboard.py        # Summary, critical fails, repeat offenders
│       │   └── overrides.py        # Override with audit trail
│       ├── services/
│       │   ├── transcription.py    # Deepgram Nova-2 integration
│       │   ├── pii.py              # Credit card / phone / email redaction
│       │   └── scoring/
│       │       ├── orchestrator.py # End-to-end scoring pipeline
│       │       ├── factory.py      # CheckType -> Evaluator mapping
│       │       ├── gate.py         # Gate logic (auto-submit vs held)
│       │       └── evaluators/
│       │           ├── base.py     # BaseEvaluator with Claude tool_use
│       │           ├── verbatim.py # Type A: script compliance
│       │           ├── factual.py  # Type B: CRM/rate card accuracy
│       │           └── behaviour.py# Type C: call quality patterns
│       └── seed/
│           └── seed_data.py        # 4 retailers, 4 agents, 15 checks, 3 leads
└── frontend/
    ├── .env.local
    └── src/
        ├── lib/
        │   ├── types.ts            # All TypeScript interfaces
        │   └── api.ts              # Typed API client
        └── app/
            ├── layout.tsx          # Nav: Dashboard / Leads / Check Library
            ├── page.tsx            # Dashboard with summary cards
            ├── leads/
            │   ├── page.tsx        # Lead list table
            │   └── [id]/
            │       └── page.tsx    # Scorecard (THE demo page)
            └── checks/
                └── page.tsx        # Check library viewer
```

---

## 12-Hour Build Timeline

### Pre-hackathon (night before) — DONE
- Backend: FastAPI project, all models, schemas, router implementations, requirements, Docker
- Frontend: Next.js + shadcn/ui + Recharts, layout, types, API client, all page shells
- Seed data: retailers, sample checks, synthetic leads
- Integration stubs: Deepgram/Anthropic client wrappers

### Hackathon day

| Hour | What to build | Milestone |
|------|--------------|-----------|
| 0-1 | Boot: docker up, pip install, seed, verify both services run | Services running |
| 1-2 | Test lead creation + audio upload with real recording | Can create lead + upload audio |
| 2-3 | Test Deepgram transcription with real audio | Audio -> transcript with speakers + timestamps |
| **3-6** | **Test & refine SCORING ENGINE**: verify VerbatimEvaluator (hr 3-4), FactualEvaluator + BehaviourEvaluator (hr 4-5), Gate logic + full /process pipeline (hr 5-6) | **Full pipeline works: recording in -> scored scorecard out** |
| 6-7 | Polish scorecard page with real data | Scorecard renders real scored data |
| 7-8 | Transcript viewer + audio player + evidence click-to-seek | Click evidence -> hear it |
| 8-9 | Lead list page + override flow | Full workflow end-to-end |
| 9-10:30 | Dashboard: summary cards + critical fails chart + filters | Real aggregate data |
| 10:30-11 | Check library import endpoint + UI | Judges can load their own checklist |
| 11-12 | Bug fixes, demo prep, README | Demo-ready |

### If behind schedule
- Hour 6 and scoring not done: Drop Next.js, build Streamlit single-page app
- Hour 8 and no UI: Focus only on scorecard page, skip everything else
- Hour 10 and no dashboard: Show raw numbers, skip charts
- **Never cut**: scoring engine quality, evidence with timestamps, at least one live-scored lead

---

## Startup Commands

```bash
# 1. Start database
docker compose up -d

# 2. Start backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload    # Tables auto-created on startup

# 3. Seed data
curl -X POST http://localhost:8000/api/v1/seed

# 4. Start frontend
cd frontend
npm run dev                       # http://localhost:3000

# 5. Add API keys to backend/.env
# ANTHROPIC_API_KEY=sk-ant-...
# DEEPGRAM_API_KEY=...
```

---

## Verification Checklist

1. **End-to-end pipeline**: Create lead -> upload audio -> POST /process -> verify scorecard has PASS/FAIL results with real transcript evidence and audio timestamps
2. **New retailer test**: Import a different checklist via /checks/import -> score a lead -> verify it uses the new checks (not hardcoded)
3. **Gate logic**: Score a lead that should fail (wrong rate in CRM) -> verify it's held. Score a clean lead -> verify auto-submit
4. **Override**: Override a FAIL to PASS -> verify override is logged, scorecard updates
5. **Dashboard**: Score 5+ leads -> verify dashboard shows correct aggregates
6. **Timestamp accuracy**: Click evidence "View Evidence" button -> verify audio seeks to the correct moment in the recording
