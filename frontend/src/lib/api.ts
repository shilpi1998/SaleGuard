const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API request failed");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

// Leads
export const getLeads = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchApi<import("./types").LeadListItem[]>(`/leads${qs}`);
};

// Held leads awaiting review (comma-separated gate_decision filter)
export const HELD_GATE_DECISIONS = [
  "held_critical_fail",
  "held_low_confidence",
  "held_random_sample",
] as const;

export const getReviewQueue = () =>
  getLeads({ gate_decision: HELD_GATE_DECISIONS.join(",") });
export const getLead = (id: number) => fetchApi<import("./types").Lead>(`/leads/${id}`);
export const createLead = (data: any) => fetchApi<import("./types").Lead>("/leads/", { method: "POST", body: JSON.stringify(data) });

// Recordings
export const uploadRecording = async (leadId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/leads/${leadId}/recording`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
};
export const getRecording = (leadId: number) => fetchApi<import("./types").Recording>(`/leads/${leadId}/recording`);
export const deleteRecording = (leadId: number) => fetchApi<void>(`/leads/${leadId}/recording`, { method: "DELETE" });
export const getAudioUrl = (recordingId: number) => `${API_BASE}/recordings/${recordingId}/audio`;

// Transcript upload (JSON file or raw utterances)
export const uploadTranscript = async (leadId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/leads/${leadId}/transcript`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Transcript upload failed");
  return res.json();
};

// Transcription & Scoring
export const transcribeLead = (id: number) => fetchApi<import("./types").Transcript>(`/leads/${id}/transcribe`, { method: "POST" });
export const scoreLead = (id: number) => fetchApi<import("./types").Scorecard>(`/leads/${id}/score`, { method: "POST" });
export const processLead = (id: number) => fetchApi<any>(`/leads/${id}/process`, { method: "POST", body: JSON.stringify({}) });
export const getTranscript = (id: number) => fetchApi<import("./types").Transcript>(`/leads/${id}/transcript`);
export const getScorecard = (id: number) => fetchApi<import("./types").Scorecard>(`/leads/${id}/scorecard`);

// Checks
export const getChecks = (retailerId: number) => fetchApi<import("./types").Check[]>(`/retailers/${retailerId}/checks`);
export const importChecks = (retailerId: number, checks: any[]) => fetchApi<import("./types").Check[]>(`/retailers/${retailerId}/checks/import`, { method: "POST", body: JSON.stringify({ checks }) });

// Dashboard
export const getDashboardSummary = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchApi<import("./types").DashboardSummary>(`/dashboard/summary${qs}`);
};
export const getCriticalFails = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchApi<import("./types").CriticalFailBreakdown[]>(`/dashboard/critical-fails${qs}`);
};
export const getRepeatOffenders = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchApi<import("./types").RepeatOffender[]>(`/dashboard/repeat-offenders${qs}`);
};
export const getGateDistribution = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchApi<import("./types").GateDistribution[]>(`/dashboard/gate-distribution${qs}`);
};
export const getRetailers = () => fetchApi<import("./types").Retailer[]>("/dashboard/retailers");
export const getAgentPerformance = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchApi<import("./types").AgentPerformance[]>(`/dashboard/agent-performance${qs}`);
};
export const getBreakdown = (groupBy: "campaign" | "site" | "team_leader", params?: Record<string, string>) => {
  const qs = new URLSearchParams({ ...params, group_by: groupBy }).toString();
  return fetchApi<import("./types").DimensionBreakdown[]>(`/dashboard/breakdown?${qs}`);
};
export const getAuditorAgreement = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return fetchApi<import("./types").AuditorAgreement>(`/dashboard/auditor-agreement${qs}`);
};

// Overrides
export const createOverride = (scoreResultId: number, data: { new_result: string; overridden_by: string; reason: string }) =>
  fetchApi<import("./types").Override>(`/scores/${scoreResultId}/override`, { method: "POST", body: JSON.stringify(data) });

// Admin: Retailers
export const getAdminRetailers = () => fetchApi<import("./types").Retailer[]>("/admin/retailers");
export const createRetailer = (data: { name: string; code: string; active: boolean }) =>
  fetchApi<import("./types").Retailer>("/admin/retailers", { method: "POST", body: JSON.stringify(data) });
export const updateRetailer = (id: number, data: Partial<{ name: string; code: string; active: boolean }>) =>
  fetchApi<import("./types").Retailer>(`/admin/retailers/${id}`, { method: "PUT", body: JSON.stringify(data) });

// Admin: Agents
export const getAdminAgents = () => fetchApi<import("./types").Agent[]>("/admin/agents");

// Admin: Checks
export const createCheck = (data: any) =>
  fetchApi<import("./types").Check>("/admin/checks", { method: "POST", body: JSON.stringify(data) });
export const updateCheck = (id: number, data: any) =>
  fetchApi<import("./types").Check>(`/admin/checks/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteCheck = (id: number) =>
  fetchApi<void>(`/admin/checks/${id}`, { method: "DELETE" });

// Admin: Leads
export const createAdminLead = (data: any) =>
  fetchApi<import("./types").Lead>("/admin/leads", { method: "POST", body: JSON.stringify(data) });
export const updateLead = (id: number, data: any) =>
  fetchApi<import("./types").Lead>(`/admin/leads/${id}`, { method: "PUT", body: JSON.stringify(data) });
