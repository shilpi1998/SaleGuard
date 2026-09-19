export interface Retailer {
  id: number;
  name: string;
  code: string;
  active: boolean;
  created_at?: string;
}

export interface Agent {
  id: number;
  name: string;
  employee_id: string;
  site: string | null;
  team_leader_name: string | null;
  active?: boolean;
  created_at?: string;
}

export interface Lead {
  id: number;
  external_id: string;
  retailer_id: number;
  agent_id: number | null;
  campaign: string | null;
  customer_name: string | null;
  plan_name: string | null;
  plan_rate: string | null;
  sale_date: string;
  crm_data: Record<string, any> | null;
  status: string;
  gate_decision: string | null;
  created_at: string;
  updated_at: string;
  retailer?: Retailer;
  agent?: Agent;
}

export interface LeadListItem {
  id: number;
  external_id: string;
  customer_name: string | null;
  retailer_name: string | null;
  agent_name: string | null;
  sale_date: string;
  status: string;
  gate_decision: string | null;
  weighted_score: number | null;
  created_at: string;
}

export interface Recording {
  id: number;
  lead_id: number;
  file_path: string;
  duration_seconds: number | null;
  mime_type: string;
  created_at: string;
}

export interface Utterance {
  index: number;
  speaker: number;
  speaker_label: string;
  text: string;
  start: number;
  end: number;
  words: any[];
}

export interface Transcript {
  id: number;
  lead_id: number;
  utterances: Utterance[];
  speaker_count: number | null;
  word_count: number | null;
  avg_confidence: number | null;
}

export interface Check {
  id: number;
  retailer_id: number;
  code: string;
  name: string;
  description: string | null;
  check_type: string;
  category: string | null;
  is_critical: boolean;
  weight: number;
  evaluation_config: Record<string, any>;
  sort_order: number;
  effective_from: string;
  effective_to: string | null;
  version: number;
}

export interface ScoreResult {
  id: number;
  lead_id: number;
  check_id: number;
  check_version: number;
  result: "PASS" | "FAIL" | "NOTE";
  confidence: number;
  evidence_text: string;
  transcript_utterance_index: number;
  audio_timestamp_start: number;
  audio_timestamp_end: number;
  reasoning: string;
  model_used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
  check?: Check;
  overrides?: Override[];
}

export interface Scorecard {
  id: number;
  lead_id: number;
  retailer_id: number;
  total_checks: number;
  passed: number;
  failed: number;
  noted: number;
  critical_total: number;
  critical_passed: number;
  weighted_score: number;
  weighted_score_excl_fatal: number;
  gate_decision: string;
  is_random_sample: boolean;
  scoring_duration_ms: number | null;
  created_at: string;
  results: ScoreResult[];
}

export interface DashboardSummary {
  total_scored: number;
  total_passed: number;
  total_failed: number;
  pass_rate: number;
  critical_fail_rate: number;
  first_pass_yield: number;
  avg_weighted_score: number;
  avg_weighted_score_excl_fatal: number;
  avg_confidence: number;
}

export interface CriticalFailBreakdown {
  check_code: string;
  check_name: string;
  check_type: string;
  retailer_name: string;
  fail_count: number;
  total_scored: number;
  fail_rate: number;
}

export interface RepeatOffender {
  agent_id: number;
  agent_name: string;
  employee_id: string;
  critical_fail_count: number;
  leads_scored: number;
  fail_rate: number;
}

export interface GateDistribution {
  gate_decision: string;
  count: number;
}

export interface Override {
  id: number;
  score_result_id: number;
  lead_id: number;
  original_result: string;
  new_result: string;
  overridden_by: string;
  reason: string;
  created_at: string;
}

export interface AgentPerformance {
  agent_id: number;
  agent_name: string;
  employee_id: string;
  site: string | null;
  team_leader_name: string | null;
  leads_scored: number;
  passed: number;
  failed: number;
  pass_rate: number;
  critical_fail_count: number;
  critical_fail_rate: number;
  avg_weighted_score: number;
  avg_weighted_score_excl_fatal: number;
}

export interface DimensionBreakdown {
  group_name: string;
  leads_scored: number;
  passed: number;
  failed: number;
  pass_rate: number;
  critical_fail_rate: number;
  avg_weighted_score: number;
}

export interface AuditorAgreement {
  total_overrides: number;
  fail_to_pass_count: number;
  fail_to_note_count: number;
  agreement_rate: number;
}
