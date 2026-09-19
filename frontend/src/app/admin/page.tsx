"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2,
  ListChecks,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Undo2,
} from "lucide-react";
import {
  getAdminRetailers,
  createRetailer,
  updateRetailer,
  getAdminAgents,
  getChecks,
  createCheck,
  updateCheck,
  deleteCheck,
  getLeads,
  getLead,
  createAdminLead,
  updateLead,
  getReviewQueue,
  getScorecard,
  createOverride,
} from "@/lib/api";
import type {
  Retailer,
  Agent,
  Check,
  LeadListItem,
  Lead,
  Scorecard,
  ScoreResult,
  Override,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Banner({
  type,
  message,
  onDismiss,
}: {
  type: "error" | "success";
  message: string;
  onDismiss: () => void;
}) {
  const cls =
    type === "error"
      ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
      : "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400";
  return (
    <div className={`flex items-center justify-between border rounded px-4 py-2 text-sm ${cls}`}>
      <span>{message}</span>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-sm font-medium text-muted-foreground">{children}</label>
  );
}

// ---------------------------------------------------------------------------
// Review Queue tab
// ---------------------------------------------------------------------------

const GATE_DECISION_BADGE: Record<string, string> = {
  held_critical_fail:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  held_low_confidence:
    "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  held_random_sample:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
};

const GATE_DECISION_LABEL: Record<string, string> = {
  held_critical_fail: "Critical Fail",
  held_low_confidence: "Low Confidence",
  held_random_sample: "Random Sample",
};

function GateDecisionBadge({ decision }: { decision: string }) {
  const cls =
    GATE_DECISION_BADGE[decision] ||
    "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {GATE_DECISION_LABEL[decision] || decision}
    </span>
  );
}

// Human review workflow status for a held lead. Distinct from the check-level
// PASS/FAIL "Override" — this tracks where the admin/auditor is at with the lead
// as a whole.
const STATUS_OPTIONS = [
  { value: "acknowledged", label: "Acknowledged" },
  { value: "discussing_with_customer", label: "Discussing with Customer" },
  { value: "checking_crm", label: "Checking CRM" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;

const STATUS_LABEL: Record<string, string> = STATUS_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
  },
  {} as Record<string, string>
);

const STATUS_BADGE_STYLES: Record<string, string> = {
  acknowledged:
    "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700",
  discussing_with_customer:
    "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  checking_crm:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  approved:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  rejected:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    STATUS_BADGE_STYLES[status] || "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

const CHECK_TYPE_LABEL: Record<string, string> = {
  A_VERBATIM: "Verbatim",
  B_FACTUAL: "Factual",
  C_BEHAVIOUR: "Behavioural",
};

function CheckTypeBadge({ type }: { type: string }) {
  return <Badge variant="outline">{CHECK_TYPE_LABEL[type] || type}</Badge>;
}

function ResultBadge({
  result,
  overridden,
}: {
  result: string;
  overridden?: boolean;
}) {
  const cls =
    result === "PASS"
      ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
      : result === "FAIL"
        ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
        : "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {result}
      {overridden && (
        <span className="flex items-center gap-0.5 text-[10px] font-normal opacity-80">
          <Undo2 className="h-3 w-3" />
          overridden
        </span>
      )}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const barColor =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

interface OverrideFormState {
  new_result: "PASS" | "NOTE";
  overridden_by: string;
  reason: string;
}

const emptyOverrideForm = (): OverrideFormState => ({
  new_result: "PASS",
  overridden_by: "",
  reason: "",
});

function OverrideAuditEntry({ override }: { override: Override }) {
  return (
    <div className="flex items-start gap-2 rounded border border-dashed border-muted-foreground/30 bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
      <Undo2 className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Overridden to <span className="font-semibold text-foreground">{override.new_result}</span> by{" "}
        <span className="font-medium text-foreground">{override.overridden_by}</span> —{" "}
        {override.reason} —{" "}
        {new Date(override.created_at).toLocaleString()}
      </span>
    </div>
  );
}

function CheckResultRow({
  result,
  onOverridden,
}: {
  result: ScoreResult;
  onOverridden: (resultId: number, override: Override) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<OverrideFormState>(emptyOverrideForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overrides = result.overrides || [];
  const hasOverride = overrides.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.overridden_by.trim() || !form.reason.trim()) {
      setError("Overridden By and Reason are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const override = await createOverride(result.id, {
        new_result: form.new_result,
        overridden_by: form.overridden_by.trim(),
        reason: form.reason.trim(),
      });
      onOverridden(result.id, override);
      setFormOpen(false);
      setForm(emptyOverrideForm());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save override");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{result.check?.name || `Check #${result.check_id}`}</span>
            {result.check && <CheckTypeBadge type={result.check.check_type} />}
            {result.check?.is_critical && <Badge variant="destructive">CRITICAL</Badge>}
            <ResultBadge result={result.result} overridden={hasOverride} />
          </div>
          <ConfidenceBar confidence={result.confidence} />
          {result.evidence_text && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Evidence: </span>
              {result.evidence_text.length > 220
                ? `${result.evidence_text.slice(0, 220)}…`
                : result.evidence_text}
            </p>
          )}
          {result.reasoning && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Reasoning: </span>
              {result.reasoning}
            </p>
          )}
        </div>
        {result.result === "FAIL" && !formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Override
          </Button>
        )}
      </div>

      {overrides.map((ov) => (
        <OverrideAuditEntry key={ov.id} override={ov} />
      ))}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Overriding a failed check is logged permanently in the audit trail.
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <FieldLabel>New Result *</FieldLabel>
              <select
                value={form.new_result}
                onChange={(e) =>
                  setForm((f) => ({ ...f, new_result: e.target.value as "PASS" | "NOTE" }))
                }
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="PASS">PASS</option>
                <option value="NOTE">NOTE</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <FieldLabel>Overridden By *</FieldLabel>
              <Input
                value={form.overridden_by}
                onChange={(e) => setForm((f) => ({ ...f, overridden_by: e.target.value }))}
                placeholder="Your name"
              />
            </div>
          </div>
          <div className="space-y-1">
            <FieldLabel>Reason *</FieldLabel>
            <Textarea
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Explain why this check result is being overridden..."
              className="min-h-20"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFormOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Submitting..." : "Submit Override"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReviewQueueDetail({ leadId }: { leadId: number }) {
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getScorecard(leadId)
      .then(setScorecard)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load scorecard"))
      .finally(() => setLoading(false));
  }, [leadId]);

  const handleOverridden = (resultId: number, override: Override) => {
    setScorecard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        results: prev.results.map((r) =>
          r.id === resultId
            ? {
                ...r,
                result: override.new_result as ScoreResult["result"],
                overrides: [...(r.overrides || []), override],
              }
            : r
        ),
      };
    });
  };

  if (loading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading check results...</p>;
  }
  if (error) {
    return <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!scorecard || scorecard.results.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No check results found for this lead.</p>;
  }

  return (
    <div className="space-y-1 p-4">
      {scorecard.results.map((result) => (
        <CheckResultRow key={result.id} result={result} onOverridden={handleOverridden} />
      ))}
    </div>
  );
}

function ReviewQueueTab() {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<number | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [commentDialog, setCommentDialog] = useState<{ leadId: number; newStatus: string } | null>(null);
  const [commentText, setCommentText] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    getReviewQueue()
      .then(setLeads)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load review queue"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpanded = (id: number) => {
    setExpandedLeadId((prev) => (prev === id ? null : id));
  };

  const handleStatusChange = (leadId: number, newStatus: string) => {
    setCommentText("");
    setCommentDialog({ leadId, newStatus });
  };

  const submitStatusChange = async () => {
    if (!commentDialog) return;
    const { leadId, newStatus } = commentDialog;
    const comment = commentText.trim();

    setCommentDialog(null);

    const previous = leads.find((l) => l.id === leadId);
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus, status_comment: comment || l.status_comment } : l))
    );
    setStatusUpdatingId(leadId);
    setError(null);
    try {
      const payload: Record<string, string> = { status: newStatus };
      if (comment) payload.status_comment = comment;
      await updateLead(leadId, payload);
    } catch (err) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId ? { ...l, status: previous?.status ?? l.status, status_comment: previous?.status_comment ?? l.status_comment } : l
        )
      );
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Banner type="error" message={error} onDismiss={() => setError(null)} />}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Leads that were held by the scoring gate (critical fail, low confidence, or random
          sample). Review the individual check results and override where appropriate — every
          override is permanently logged.
        </p>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]" />
                <TableHead>Lead ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Retailer</TableHead>
                <TableHead>Gate Decision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[220px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <Fragment key={lead.id}>
                  <TableRow>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(lead.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Toggle review detail"
                      >
                        {expandedLeadId === lead.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">{lead.external_id}</TableCell>
                    <TableCell>{lead.customer_name || "—"}</TableCell>
                    <TableCell>{lead.retailer_name || "—"}</TableCell>
                    <TableCell>
                      {lead.gate_decision ? (
                        <GateDecisionBadge decision={lead.gate_decision} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {STATUS_LABEL[lead.status] ? (
                        <StatusBadge status={lead.status} />
                      ) : (
                        <Badge variant="outline">{lead.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.weighted_score != null
                        ? `${Math.round(lead.weighted_score * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>{new Date(lead.sale_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => toggleExpanded(lead.id)}>
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Review
                        </Button>
                        <select
                          value={STATUS_LABEL[lead.status] ? lead.status : ""}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                          disabled={statusUpdatingId === lead.id}
                          aria-label="Update lead status"
                          className="h-8 rounded-lg border border-input bg-background px-2 text-xs disabled:opacity-50"
                        >
                          <option value="" disabled>
                            Update status…
                          </option>
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedLeadId === lead.id && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/30 p-0">
                        <ReviewQueueDetail leadId={lead.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {!loading && leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No leads are currently held for review. All clear!
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Loading review queue...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!commentDialog} onOpenChange={(open) => { if (!open) setCommentDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Update Status to {commentDialog ? STATUS_LABEL[commentDialog.newStatus] || commentDialog.newStatus : ""}
            </DialogTitle>
            <DialogDescription>
              Add an optional comment explaining why you are setting this status.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add your comment here..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCommentDialog(null)}>
              Cancel
            </Button>
            <Button onClick={submitStatusChange}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retailers tab
// ---------------------------------------------------------------------------

interface RetailerFormState {
  name: string;
  code: string;
  active: boolean;
}

const emptyRetailerForm: RetailerFormState = { name: "", code: "", active: true };

function RetailersTab({ onChange }: { onChange: () => void }) {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RetailerFormState>(emptyRetailerForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getAdminRetailers()
      .then(setRetailers)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load retailers"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyRetailerForm);
    setFormOpen(true);
  };

  const openEditForm = (retailer: Retailer) => {
    setEditingId(retailer.id);
    setForm({ name: retailer.name, code: retailer.code, active: retailer.active });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyRetailerForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      setError("Name and code are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId != null) {
        await updateRetailer(editingId, form);
        setSuccess(`Retailer "${form.name}" updated.`);
      } else {
        await createRetailer(form);
        setSuccess(`Retailer "${form.name}" created.`);
      }
      closeForm();
      load();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save retailer");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (retailer: Retailer) => {
    setError(null);
    try {
      await updateRetailer(retailer.id, { active: !retailer.active });
      setRetailers((prev) =>
        prev.map((r) => (r.id === retailer.id ? { ...r, active: !r.active } : r))
      );
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update retailer");
    }
  };

  return (
    <div className="space-y-4">
      {error && <Banner type="error" message={error} onDismiss={() => setError(null)} />}
      {success && (
        <Banner type="success" message={success} onDismiss={() => setSuccess(null)} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Retailers are the top-level tenants of SaleGuard. Each retailer owns its own
          check library and leads.
        </p>
        <Button onClick={openAddForm}>
          <Plus className="h-4 w-4" />
          Add Retailer
        </Button>
      </div>

      {formOpen && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId != null ? "Edit Retailer" : "New Retailer"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <FieldLabel>Name *</FieldLabel>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="AGL Energy"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Code *</FieldLabel>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="AGL"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FieldLabel>Active</FieldLabel>
                <Toggle
                  checked={form.active}
                  onChange={(v) => setForm((f) => ({ ...f, active: v }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingId != null ? "Save Changes" : "Create Retailer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {retailers.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {r.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Toggle checked={r.active} onChange={() => handleToggleActive(r)} />
                      <Badge variant={r.active ? "default" : "secondary"}>
                        {r.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && retailers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No retailers yet. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Loading retailers...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Check Library tab
// ---------------------------------------------------------------------------

const CHECK_TYPES = ["A_VERBATIM", "B_FACTUAL", "C_BEHAVIOUR"] as const;

interface CheckFormState {
  code: string;
  name: string;
  description: string;
  check_type: string;
  category: string;
  is_critical: boolean;
  weight: string;
  evaluation_config: string;
  sort_order: string;
  effective_from: string;
  effective_to: string;
  version: string;
}

const todayIso = () => new Date().toISOString().split("T")[0];

const emptyCheckForm = (): CheckFormState => ({
  code: "",
  name: "",
  description: "",
  check_type: "A_VERBATIM",
  category: "",
  is_critical: false,
  weight: "1",
  evaluation_config: "{}",
  sort_order: "0",
  effective_from: todayIso(),
  effective_to: "",
  version: "1",
});

function ChecksTab({ retailers }: { retailers: Retailer[] }) {
  const [selectedRetailerId, setSelectedRetailerId] = useState<number | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CheckFormState>(emptyCheckForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (retailers.length > 0 && selectedRetailerId == null) {
      setSelectedRetailerId(retailers[0].id);
    }
  }, [retailers, selectedRetailerId]);

  const loadChecks = useCallback((retailerId: number) => {
    setLoading(true);
    getChecks(retailerId)
      .then(setChecks)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load checks"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedRetailerId != null) loadChecks(selectedRetailerId);
  }, [selectedRetailerId, loadChecks]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyCheckForm());
    setJsonError(null);
    setFormOpen(true);
  };

  const openEditForm = (check: Check) => {
    setEditingId(check.id);
    setForm({
      code: check.code,
      name: check.name,
      description: check.description || "",
      check_type: check.check_type,
      category: check.category || "",
      is_critical: check.is_critical,
      weight: String(check.weight),
      evaluation_config: JSON.stringify(check.evaluation_config ?? {}, null, 2),
      sort_order: String(check.sort_order),
      effective_from: check.effective_from,
      effective_to: check.effective_to || "",
      version: String(check.version),
    });
    setJsonError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyCheckForm());
    setJsonError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRetailerId == null) return;
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and name are required.");
      return;
    }

    let evaluationConfig: Record<string, unknown>;
    try {
      evaluationConfig = form.evaluation_config.trim() ? JSON.parse(form.evaluation_config) : {};
    } catch {
      setJsonError("evaluation_config must be valid JSON.");
      return;
    }
    setJsonError(null);

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      check_type: form.check_type,
      category: form.category.trim() || null,
      is_critical: form.is_critical,
      weight: Number(form.weight) || 0,
      evaluation_config: evaluationConfig,
      sort_order: Number(form.sort_order) || 0,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      version: Number(form.version) || 1,
    };

    setSaving(true);
    setError(null);
    try {
      if (editingId != null) {
        await updateCheck(editingId, payload);
        setSuccess(`Check "${payload.name}" updated.`);
      } else {
        await createCheck({ ...payload, retailer_id: selectedRetailerId });
        setSuccess(`Check "${payload.name}" created.`);
      }
      closeForm();
      loadChecks(selectedRetailerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save check");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (check: Check) => {
    if (deletingId !== check.id) {
      setDeletingId(check.id);
      return;
    }
    setError(null);
    try {
      await deleteCheck(check.id);
      setSuccess(`Check "${check.name}" deleted.`);
      if (selectedRetailerId != null) loadChecks(selectedRetailerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete check");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Banner type="error" message={error} onDismiss={() => setError(null)} />}
      {success && (
        <Banner type="success" message={success} onDismiss={() => setSuccess(null)} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FieldLabel>Retailer</FieldLabel>
          <select
            value={selectedRetailerId ?? ""}
            onChange={(e) => setSelectedRetailerId(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            {retailers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {!r.active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={openAddForm} disabled={selectedRetailerId == null}>
          <Plus className="h-4 w-4" />
          Add Check
        </Button>
      </div>

      {formOpen && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId != null ? "Edit Check" : "New Check"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <FieldLabel>Code *</FieldLabel>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="EIC_DISCLOSURE"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Name *</FieldLabel>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="EIC Disclosure Read Verbatim"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What this check verifies..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <FieldLabel>Check Type *</FieldLabel>
                  <select
                    value={form.check_type}
                    onChange={(e) => setForm((f) => ({ ...f, check_type: e.target.value }))}
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                  >
                    {CHECK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <FieldLabel>Category</FieldLabel>
                  <Input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="compliance"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Weight</FieldLabel>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.weight}
                    onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <FieldLabel>Critical</FieldLabel>
                <Toggle
                  checked={form.is_critical}
                  onChange={(v) => setForm((f) => ({ ...f, is_critical: v }))}
                />
                {form.is_critical && <Badge variant="destructive">CRITICAL</Badge>}
              </div>

              <div className="space-y-1">
                <FieldLabel>Evaluation Config (JSON) *</FieldLabel>
                <Textarea
                  value={form.evaluation_config}
                  onChange={(e) => setForm((f) => ({ ...f, evaluation_config: e.target.value }))}
                  className="min-h-32 font-mono text-xs"
                  placeholder='{"approved_script": "...", "key_phrases": []}'
                />
                {jsonError && <p className="text-xs text-red-600 dark:text-red-400">{jsonError}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-1">
                  <FieldLabel>Sort Order</FieldLabel>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Effective From *</FieldLabel>
                  <Input
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Effective To</FieldLabel>
                  <Input
                    type="date"
                    value={form.effective_to}
                    onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Version</FieldLabel>
                  <Input
                    type="number"
                    value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : editingId != null ? "Save Changes" : "Create Check"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Critical</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead className="w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {c.code}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.check_type}</Badge>
                  </TableCell>
                  <TableCell>{c.category || "—"}</TableCell>
                  <TableCell>
                    {c.is_critical ? (
                      <Badge variant="destructive">CRITICAL</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{c.weight}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditForm(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant={deletingId === c.id ? "destructive" : "ghost"}
                        size="sm"
                        onClick={() => handleDelete(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingId === c.id ? "Confirm?" : ""}
                      </Button>
                      {deletingId === c.id && (
                        <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && checks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No checks configured for this retailer yet.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading checks...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leads / CRM tab
// ---------------------------------------------------------------------------

interface LeadFormState {
  external_id: string;
  retailer_id: string;
  agent_id: string;
  campaign: string;
  customer_name: string;
  plan_name: string;
  plan_rate: string;
  sale_date: string;
  crm_data: string;
}

const emptyLeadForm = (): LeadFormState => ({
  external_id: "",
  retailer_id: "",
  agent_id: "",
  campaign: "",
  customer_name: "",
  plan_name: "",
  plan_rate: "",
  sale_date: todayIso(),
  crm_data: "{}",
});

function LeadsTab({ retailers }: { retailers: Retailer[] }) {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm());
  const [saving, setSaving] = useState(false);
  const [loadingLead, setLoadingLead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const loadLeads = useCallback(() => {
    setLoading(true);
    getLeads()
      .then(setLeads)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load leads"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLeads();
    getAdminAgents()
      .then(setAgents)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load agents"));
  }, [loadLeads]);

  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...emptyLeadForm(), retailer_id: retailers[0] ? String(retailers[0].id) : "" });
    setJsonError(null);
    setFormOpen(true);
  };

  const openEditForm = async (leadListItem: LeadListItem) => {
    setLoadingLead(true);
    setError(null);
    try {
      const lead: Lead = await getLead(leadListItem.id);
      setEditingId(lead.id);
      setForm({
        external_id: lead.external_id,
        retailer_id: String(lead.retailer_id),
        agent_id: lead.agent_id != null ? String(lead.agent_id) : "",
        campaign: lead.campaign || "",
        customer_name: lead.customer_name || "",
        plan_name: lead.plan_name || "",
        plan_rate: lead.plan_rate || "",
        sale_date: lead.sale_date,
        crm_data: JSON.stringify(lead.crm_data ?? {}, null, 2),
      });
      setJsonError(null);
      setFormOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead");
    } finally {
      setLoadingLead(false);
    }
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyLeadForm());
    setJsonError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.external_id.trim() || !form.retailer_id) {
      setError("External ID and retailer are required.");
      return;
    }

    let crmData: Record<string, unknown> | null;
    try {
      crmData = form.crm_data.trim() ? JSON.parse(form.crm_data) : null;
    } catch {
      setJsonError("crm_data must be valid JSON.");
      return;
    }
    setJsonError(null);

    const payload = {
      external_id: form.external_id.trim(),
      retailer_id: Number(form.retailer_id),
      agent_id: form.agent_id ? Number(form.agent_id) : null,
      campaign: form.campaign.trim() || null,
      customer_name: form.customer_name.trim() || null,
      plan_name: form.plan_name.trim() || null,
      plan_rate: form.plan_rate.trim() || null,
      sale_date: form.sale_date,
      crm_data: crmData,
    };

    setSaving(true);
    setError(null);
    try {
      if (editingId != null) {
        await updateLead(editingId, payload);
        setSuccess(`Lead "${payload.external_id}" updated.`);
      } else {
        await createAdminLead(payload);
        setSuccess(`Lead "${payload.external_id}" created.`);
      }
      closeForm();
      loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Banner type="error" message={error} onDismiss={() => setError(null)} />}
      {success && (
        <Banner type="success" message={success} onDismiss={() => setSuccess(null)} />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Leads represent individual sales calls flowing through the QA pipeline.
        </p>
        <Button onClick={openAddForm}>
          <Plus className="h-4 w-4" />
          Add Lead
        </Button>
      </div>

      {formOpen && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              {editingId != null ? "Edit Lead" : "New Lead"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingLead ? (
              <p className="text-sm text-muted-foreground">Loading lead...</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <FieldLabel>External ID *</FieldLabel>
                    <Input
                      value={form.external_id}
                      onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))}
                      placeholder="LEAD-2024-001"
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel>Retailer *</FieldLabel>
                    <select
                      value={form.retailer_id}
                      onChange={(e) => setForm((f) => ({ ...f, retailer_id: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                    >
                      <option value="">Select retailer</option>
                      {retailers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <FieldLabel>Agent</FieldLabel>
                    <select
                      value={form.agent_id}
                      onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.employee_id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <FieldLabel>Campaign</FieldLabel>
                    <Input
                      value={form.campaign}
                      onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))}
                      placeholder="Energy Switch Q1"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <FieldLabel>Customer Name</FieldLabel>
                    <Input
                      value={form.customer_name}
                      onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                      placeholder="John Smith"
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel>Sale Date</FieldLabel>
                    <Input
                      type="date"
                      value={form.sale_date}
                      onChange={(e) => setForm((f) => ({ ...f, sale_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <FieldLabel>Plan Name</FieldLabel>
                    <Input
                      value={form.plan_name}
                      onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))}
                      placeholder="AGL Value Saver"
                    />
                  </div>
                  <div className="space-y-1">
                    <FieldLabel>Plan Rate</FieldLabel>
                    <Input
                      value={form.plan_rate}
                      onChange={(e) => setForm((f) => ({ ...f, plan_rate: e.target.value }))}
                      placeholder="26.4c/kWh"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <FieldLabel>CRM Data (JSON)</FieldLabel>
                  <Textarea
                    value={form.crm_data}
                    onChange={(e) => setForm((f) => ({ ...f, crm_data: e.target.value }))}
                    className="min-h-32 font-mono text-xs"
                    placeholder='{"email": "...", "state": "..."}'
                  />
                  {jsonError && <p className="text-xs text-red-600 dark:text-red-400">{jsonError}</p>}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : editingId != null ? "Save Changes" : "Create Lead"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>External ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Retailer</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Gate Decision</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.external_id}</TableCell>
                  <TableCell>{lead.customer_name || "—"}</TableCell>
                  <TableCell>{lead.retailer_name || "—"}</TableCell>
                  <TableCell>{lead.agent_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{lead.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {lead.gate_decision ? (
                      <Badge variant="secondary">{lead.gate_decision}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(lead)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && leads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No leads yet. Add one to get started.
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading leads...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [retailersLoaded, setRetailersLoaded] = useState(false);

  const refreshRetailers = useCallback(() => {
    getAdminRetailers()
      .then(setRetailers)
      .catch(console.error)
      .finally(() => setRetailersLoaded(true));
  }, []);

  useEffect(() => {
    refreshRetailers();
  }, [refreshRetailers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-1 text-muted-foreground">
          Manage retailers, the check library, and leads/CRM records.
        </p>
      </div>

      <Tabs defaultValue="review-queue">
        <TabsList>
          <TabsTrigger value="review-queue">
            <ShieldAlert className="h-4 w-4" />
            Review Queue
          </TabsTrigger>
          <TabsTrigger value="retailers">
            <Building2 className="h-4 w-4" />
            Retailers
          </TabsTrigger>
          <TabsTrigger value="checks">
            <ListChecks className="h-4 w-4" />
            Check Library
          </TabsTrigger>
          <TabsTrigger value="leads">
            <Users className="h-4 w-4" />
            Leads / CRM
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review-queue" className="pt-4">
          <ReviewQueueTab />
        </TabsContent>
        <TabsContent value="retailers" className="pt-4">
          <RetailersTab onChange={refreshRetailers} />
        </TabsContent>
        <TabsContent value="checks" className="pt-4">
          {retailersLoaded && <ChecksTab retailers={retailers} />}
        </TabsContent>
        <TabsContent value="leads" className="pt-4">
          {retailersLoaded && <LeadsTab retailers={retailers} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
