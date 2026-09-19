# SaleGuard — Architecture Overview

## What SaleGuard Does

SaleGuard automates QA for sales calls. A sales agent records a phone call → the system transcribes it → an AI scoring engine evaluates every compliance check → the lead is either auto-submitted or held for human review. No hardcoded rules — everything is driven by config rows in the database.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                             │
│                            localhost:3001                                    │
│                                                                             │
│  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Dashboard  │  │  Leads   │  │ Scorecard │  │  Check   │  │   Admin   │  │
│  │   page.tsx │  │ page.tsx │  │  [id]/    │  │ Library  │  │  page.tsx │  │
│  │     /      │  │  /leads  │  │  page.tsx │  │  /checks │  │  /admin   │  │
│  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  │
│        │              │              │              │              │        │
│        └──────────────┴──────────────┴──────────────┴──────────────┘        │
│                                      │                                      │
│                              lib/api.ts                                     │
│                         (all API calls go here)                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP (REST)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI + Python)                         │
│                            localhost:8000                                    │
│                                                                             │
│  ┌─────────────────────────────── Routers ────────────────────────────────┐ │
│  │  leads.py  │ dashboard.py │ admin.py │ checks.py │ recordings.py │ ...│ │
│  └─────┬──────┴──────┬───────┴────┬─────┴─────┬─────┴───────┬───────┘   │ │
│        │             │            │           │             │             │
│  ┌─────┴─────────────┴────────────┴───────────┴─────────────┘             │ │
│  │                         Services Layer                                 │ │
│  │                                                                        │ │
│  │  ┌──────────────────┐    ┌────────────────────────────────────────┐    │ │
│  │  │  transcription.py│    │         Scoring Engine                 │    │ │
│  │  │                  │    │                                        │    │ │
│  │  │  Audio file      │    │  orchestrator.py  ← entry point       │    │ │
│  │  │       │          │    │       │                                │    │ │
│  │  │       ▼          │    │       ├──→ factory.py (pick evaluator) │    │ │
│  │  │   Deepgram API   │    │       │        │                      │    │ │
│  │  │   (Nova-2 STT)   │    │       │        ├──→ verbatim.py       │    │ │
│  │  │       │          │    │       │        ├──→ factual.py        │    │ │
│  │  │       ▼          │    │       │        └──→ behaviour.py      │    │ │
│  │  │   Utterances     │    │       │                  │            │    │ │
│  │  │   (JSONB)        │    │       │            LLM (GPT-4o /      │    │ │
│  │  └──────────────────┘    │       │             Claude Sonnet)     │    │ │
│  │                          │       │                  │            │    │ │
│  │  ┌──────────────────┐    │       ▼                  ▼            │    │ │
│  │  │     pii.py       │    │  gate.py ← auto_submit / hold        │    │ │
│  │  │  (PII redaction) │    │                                        │    │ │
│  │  └──────────────────┘    └────────────────────────────────────────┘    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                      │
│                              models/models.py                               │
│                              schemas/schemas.py                             │
│                              database.py                                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ SQLAlchemy ORM
                                       ▼
                          ┌──────────────────────────┐
                          │   PostgreSQL (Docker)     │
                          │   cimet-postgres:5432     │
                          │   DB: cimet_qa            │
                          │                           │
                          │   9 tables:               │
                          │   retailers, agents,      │
                          │   leads, recordings,      │
                          │   transcripts,            │
                          │   check_library,          │
                          │   scorecards,             │
                          │   score_results,          │
                          │   overrides               │
                          └──────────────────────────┘
```

---

## The Scoring Pipeline (end-to-end flow)

```
  ┌──────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────────┐
  │  Upload   │────▶│  Transcribe │────▶│   Score     │────▶│   Gate   │────▶│  Dashboard / │
  │  Audio    │     │  (Deepgram) │     │  (LLM per   │     │  Logic   │     │  Human Review│
  │           │     │             │     │   check)    │     │          │     │              │
  └──────────┘     └─────────────┘     └─────────────┘     └──────────┘     └──────────────┘
                                                                │
                                              ┌─────────────────┼──────────────────┐
                                              │                 │                  │
                                        All critical      Any confidence     Random 5%
                                        checks PASS?       < 70%?            sample?
                                              │                 │                  │
                                              ▼                 ▼                  ▼
                                         auto_submit    held_low_confidence  held_random_sample
                                                                │
                                                     held_critical_fail
```

**One-click process** (`POST /api/v1/leads/{id}/process`):
1. Finds the audio recording for the lead
2. Sends it to Deepgram → gets back speaker-diarized utterances
3. Loads the retailer's active checks from `check_library`
4. For each check, dispatches to the correct evaluator via the factory
5. Each evaluator builds a prompt from `evaluation_config` JSONB and calls the LLM
6. LLM returns structured output: PASS/FAIL, confidence, evidence, reasoning
7. Gate logic decides: auto-submit or hold for human review
8. Everything is persisted: scorecard, individual results, gate decision

---

## Three Check Types — How Config Drives Scoring

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        check_library table                                  │
│                                                                             │
│  Each row = one compliance check for one retailer                           │
│  evaluation_config (JSONB) = the instructions the LLM receives              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Type A — VERBATIM  (VerbatimEvaluator)                             │    │
│  │                                                                     │    │
│  │ "Did the agent say this exact script?"                              │    │
│  │                                                                     │    │
│  │ evaluation_config:                                                  │    │
│  │   approved_script: "This call is recorded for quality..."           │    │
│  │   key_phrases: ["recorded", "quality", "training"]                  │    │
│  │   match_threshold: 0.80                                             │    │
│  │   speaker: "agent"                                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Type B — FACTUAL  (FactualEvaluator)                               │    │
│  │                                                                     │    │
│  │ "Did the agent quote the correct rate / plan / details?"            │    │
│  │ Compares transcript against CRM data attached to the lead.          │    │
│  │                                                                     │    │
│  │ evaluation_config:                                                  │    │
│  │   crm_fields: ["plan_rate", "email"]                                │    │
│  │   rate_card_reference: { rate_kwh: 0.264 }                          │    │
│  │   comparison_rules: "Exact match. 1 cent rounding OK."              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Type C — BEHAVIOUR  (BehaviourEvaluator)                           │    │
│  │                                                                     │    │
│  │ "Did the agent exhibit bad behaviour?"                              │    │
│  │ Dead air, pressure tactics, rapport, PII exposure, etc.             │    │
│  │                                                                     │    │
│  │ evaluation_config:                                                  │    │
│  │   behaviour_type: "dead_air" | "pressure" | "pii_detection" | ...   │    │
│  │   threshold_seconds: 8                                              │    │
│  │   instructions: "Flag silences > 8s between speakers."              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  New retailer = new rows in this table. No code changes needed.             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema (9 tables)

```
  ┌────────────┐          ┌────────────┐
  │  retailers │──────┐   │   agents   │──────┐
  │            │      │   │            │      │
  │ id, name,  │      │   │ id, name,  │      │
  │ code       │      │   │ employee_id│      │
  └────────────┘      │   └────────────┘      │
                      │                       │
                      ▼                       ▼
                ┌──────────────────────────────────┐
                │             leads                 │
                │                                   │
                │  id, external_id, retailer_id,    │
                │  agent_id, customer_name,          │
                │  plan_name, plan_rate, sale_date,  │
                │  crm_data (JSONB), status,         │
                │  gate_decision, status_comment     │
                └──────────┬───────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  recordings  │ │ transcripts  │ │  scorecards  │
     │              │ │              │ │              │
     │ file_path,   │ │ utterances   │ │ passed,      │
     │ mime_type    │ │ (JSONB),     │ │ failed,      │
     └──────────────┘ │ speaker_count│ │ weighted_    │
                      └──────────────┘ │ score,       │
                                       │ gate_decision│
  ┌──────────────┐                     └──────┬───────┘
  │ check_library│                            │
  │              │◄───────────────┐            │
  │ code, name,  │               │            ▼
  │ check_type,  │         ┌──────────────────────┐
  │ is_critical, │         │    score_results      │
  │ weight,      │         │                       │
  │ evaluation_  │         │ check_id, result,     │
  │ config (JSONB)│        │ confidence, evidence, │
  └──────────────┘         │ reasoning, timestamps │
                           └──────────┬────────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │  overrides   │
                              │              │
                              │ original →   │
                              │ new_result,  │
                              │ overridden_by│
                              │ reason       │
                              └──────────────┘
```

---

## File-by-File Reference

### Backend — `backend/app/`

#### Core Setup
| File | Purpose |
|------|---------|
| `main.py` | FastAPI app entry point. Mounts all routers under `/api/v1`, configures CORS, runs DB table creation on startup. |
| `config.py` | Settings via pydantic-settings. Reads `.env` for DB URL, API keys (Deepgram, LLM Gateway, Anthropic), LLM provider selection, confidence threshold, random sample rate. |
| `database.py` | SQLAlchemy engine + session factory. Provides `get_db()` dependency for all endpoints. |

#### Models & Schemas
| File | Purpose |
|------|---------|
| `models/models.py` | SQLAlchemy ORM models for all 9 tables. Defines enums (`CheckType`, `ResultEnum`, `GateDecision`). The `evaluation_config` JSONB column on `CheckLibrary` is what makes the system config-driven. |
| `schemas/schemas.py` | Pydantic models for request/response validation. Every API endpoint uses these for input parsing and output serialization. |

#### Routers (API Endpoints)
| File | Endpoints | What it does |
|------|-----------|-------------|
| `routers/leads.py` | `POST/GET /leads`, `GET /leads/{id}`, upload recording, upload/get transcript, `POST /leads/{id}/transcribe`, `POST /leads/{id}/score`, `POST /leads/{id}/process`, `GET /leads/{id}/scorecard` | The main workhorse. Handles lead CRUD, audio upload, transcription trigger, scoring trigger, and the one-click process pipeline. |
| `routers/dashboard.py` | `GET /dashboard/summary`, `/critical-fails`, `/repeat-offenders`, `/gate-distribution`, `/agent-performance`, `/dimension-breakdown`, `/auditor-agreement` | Aggregation queries for the analytics dashboard. All support retailer/date filters. |
| `routers/admin.py` | `POST/PUT /admin/leads`, `GET/PUT /admin/retailers`, `POST /admin/checks` | Admin-only CRUD for retailers, leads, and checks. Used by the Admin panel. |
| `routers/checks.py` | `GET /retailers/{id}/checks`, `POST /retailers/{id}/checks/import` | Check library read + bulk import. Used by the Check Library page. |
| `routers/overrides.py` | `POST /scores/{id}/override` | Create a human override on a score result (FAIL→PASS). Logs who, when, why. |
| `routers/recordings.py` | `GET /recordings/{id}/audio` | Streams audio with HTTP Range headers for seeking in the browser player. |

#### Services — Transcription
| File | Purpose |
|------|---------|
| `services/transcription.py` | Sends audio to **Deepgram Nova-2** API. Returns speaker-diarized utterances with timestamps. Uses `diarize=True`, `utterances=True`, `smart_format=True`, `language=en-AU`. |

#### Services — Scoring Engine (the brain)
| File | Purpose |
|------|---------|
| `services/scoring/orchestrator.py` | **Entry point for all scoring.** Loads the lead, transcript, and active checks. Dispatches each check to an evaluator. Collects results, calculates weighted scores, calls gate logic, persists scorecard + results. Also contains `_DEMO_RESULTS` for hardcoded demo scoring (lead 13). |
| `services/scoring/factory.py` | Maps `check_type` enum → evaluator class. `A_VERBATIM` → VerbatimEvaluator, `B_FACTUAL` → FactualEvaluator, `C_BEHAVIOUR` → BehaviourEvaluator. Only file that ties types to code. |
| `services/scoring/evaluators/base.py` | Abstract base class. Defines `build_system_prompt()`, `build_user_prompt()`, `evaluate()`. Calls the LLM (via Gateway or Anthropic) with forced tool_use for structured output. Formats transcript as `[index] [start-end] Speaker: text`. |
| `services/scoring/evaluators/verbatim.py` | Type A evaluator. Builds prompt with the approved script + key phrases from `evaluation_config`. Asks LLM: "Did the agent say this?" |
| `services/scoring/evaluators/factual.py` | Type B evaluator. Builds prompt with CRM field values + rate card from `evaluation_config`. Asks LLM: "Did the agent quote the correct information?" |
| `services/scoring/evaluators/behaviour.py` | Type C evaluator. Builds prompt with behaviour type + thresholds + instructions from `evaluation_config`. Handles dead air, pressure, rapport, PII detection, etc. |
| `services/scoring/gate.py` | Gate logic. Decides: any critical FAIL → `held_critical_fail`, any confidence < 0.70 → `held_low_confidence`, random 5% → `held_random_sample`, else → `auto_submit`. |

#### Services — PII
| File | Purpose |
|------|---------|
| `services/pii.py` | Regex-based PII redaction for transcript display. Masks credit card numbers, phone numbers, emails. |

#### Seed Data
| File | Purpose |
|------|---------|
| `seed/seed_data.py` | Populates DB with demo retailers (AGL, Origin, Superloop, etc.), agents, leads, check library configs. Run on first startup. |
| `seed/real_transcript.py` | Contains sample transcript utterance data for seeded leads. |

---

### Frontend — `frontend/src/`

#### Pages
| File | Route | What it shows |
|------|-------|--------------|
| `app/(main)/page.tsx` | `/` | **Dashboard.** Summary cards (pass rate, critical fail rate, avg score), pie chart (gate distribution), critical fails breakdown with drill-down (category → retailer → specific checks with config links), repeat offenders table, agent performance. |
| `app/(main)/leads/page.tsx` | `/leads` | **Lead list.** Table of all leads with status badges, scores, gate decisions. Click to open scorecard. |
| `app/(main)/leads/[id]/page.tsx` | `/leads/{id}` | **Scorecard page (the demo page).** Lead header, gate decision banner, human review banner with auditor comments, score summary cards, check results table (PASS/FAIL/NOTE with confidence bars and evidence), transcript viewer with speaker labels, audio player with seek-to-evidence, override modal. |
| `app/(main)/leads/new/page.tsx` | `/leads/new` | Create new lead form. |
| `app/(main)/checks/page.tsx` | `/checks` | **Check Library.** Browse all checks per retailer. Shows evaluation_config visually (approved scripts, CRM fields, behaviour rules). Auto-highlights when linked from dashboard. |
| `app/admin/page.tsx` | `/admin` | **Admin panel.** Four tabs: Review Queue (held leads, status updates with in-app comment dialog, override flow), Retailers CRUD, Check Library CRUD, Leads/CRM CRUD. |

#### Shared Code
| File | Purpose |
|------|---------|
| `lib/api.ts` | All backend API calls. Every fetch goes through `fetchApi()` which handles errors, base URL, headers. Single source of truth for API integration. |
| `lib/types.ts` | TypeScript interfaces matching backend schemas. `Lead`, `Scorecard`, `ScoreResult`, `Check`, `CriticalFailBreakdown`, etc. |
| `lib/utils.ts` | Tailwind `cn()` utility for conditional class merging. |
| `app/(main)/layout.tsx` | Sidebar navigation layout with links to Dashboard, Leads, Check Library. |
| `app/admin/layout.tsx` | Admin layout wrapper. |
| `app/layout.tsx` | Root layout. PWA manifest, service worker registration, theme config. |

#### UI Components (`components/ui/`)
Shadcn/ui component library: `badge`, `button`, `card`, `dialog`, `input`, `select`, `separator`, `table`, `tabs`, `textarea`. Plus a custom `theme-toggle.tsx`.

---

## How Everything Connects

```
User clicks "Score" on a lead
        │
        ▼
Frontend (leads/[id]/page.tsx)
        │
        │  calls scoreLead() or processLead()
        ▼
lib/api.ts → POST /api/v1/leads/{id}/score  (or /process)
        │
        ▼
routers/leads.py  →  score_lead() endpoint
        │
        │  imports ScoringOrchestrator
        ▼
services/scoring/orchestrator.py
        │
        ├──  loads lead from DB (models/models.py)
        ├──  loads transcript from DB
        ├──  loads active checks from check_library
        │
        │    For each check:
        ├──────→  factory.py  →  picks evaluator by check_type
        │              │
        │              ▼
        │         evaluators/verbatim.py  OR  factual.py  OR  behaviour.py
        │              │
        │              │  reads evaluation_config JSONB
        │              │  builds system + user prompt
        │              │  calls LLM (config.py → LLM_PROVIDER)
        │              │
        │              ▼
        │         LLM returns: { result, confidence, evidence, reasoning }
        │
        ├──  gate.py  →  decides auto_submit / held_*
        │
        ├──  persists scorecard + score_results to DB
        │
        ▼
Response → Frontend refetches scorecard via GET /scorecard
        │
        ▼
Scorecard page renders results with evidence + confidence bars
```

---

## External Services

| Service | Used For | Called From |
|---------|----------|-------------|
| **Deepgram** (Nova-2) | Speech-to-text with speaker diarization | `services/transcription.py` |
| **LLM Gateway** (GPT-4o) | AI scoring — primary provider (free) | `services/scoring/evaluators/base.py` |
| **Anthropic** (Claude Sonnet) | AI scoring — alternate provider (paid) | `services/scoring/evaluators/base.py` |

---

## Key Design Decisions

1. **Config-driven, not code-driven** — Adding a new retailer = inserting `check_library` rows. Zero code changes.
2. **Dual LLM provider** — Switch between free Gateway (GPT-4o) and paid Anthropic (Claude) via `LLM_PROVIDER` env var.
3. **Structured LLM output** — Evaluators use tool_use / function calling to guarantee the response schema (result, confidence, evidence, etc.).
4. **Gate logic is deterministic** — No AI involved in the hold/submit decision. Pure rules: critical fails, confidence threshold, random sampling.
5. **Full audit trail** — Every override logs who, when, original result, new result, and reason. Status changes can include auditor comments.
6. **Evidence links to transcript** — Each score result includes `transcript_utterance_index` and audio timestamps, so the UI can highlight and seek to the exact moment.
