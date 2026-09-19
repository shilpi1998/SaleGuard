"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ListChecks,
  MessageSquareQuote,
  ClipboardCheck,
  Users2,
  Quote,
  Tag,
  Layers,
} from "lucide-react";
import { getRetailers, getChecks } from "@/lib/api";
import type { Check, Retailer } from "@/lib/types";

// Visual language for each check type — this is the whole point of the demo:
// the SAME evaluator code runs for every retailer, only these config rows differ.
const TYPE_META: Record<
  string,
  {
    label: string;
    icon: typeof MessageSquareQuote;
    pill: string;
    border: string;
    chip: string;
    headerBg: string;
  }
> = {
  A_VERBATIM: {
    label: "Verbatim",
    icon: MessageSquareQuote,
    pill: "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30",
    border: "border-l-4 border-l-blue-500",
    chip: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20",
    headerBg: "bg-blue-50/50 dark:bg-blue-500/5",
  },
  B_FACTUAL: {
    label: "Factual",
    icon: ClipboardCheck,
    pill: "bg-green-100 text-green-800 border border-green-300 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30",
    border: "border-l-4 border-l-green-500",
    chip: "bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/20",
    headerBg: "bg-green-50/50 dark:bg-green-500/5",
  },
  C_BEHAVIOUR: {
    label: "Behavioural",
    icon: Users2,
    pill: "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
    border: "border-l-4 border-l-amber-500",
    chip: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    headerBg: "bg-amber-50/50 dark:bg-amber-500/5",
  },
};

const DEFAULT_META = {
  label: "Unknown",
  icon: Layers,
  pill: "bg-muted text-muted-foreground border border-border",
  border: "border-l-4 border-l-muted-foreground/30",
  chip: "bg-muted text-muted-foreground border border-border",
  headerBg: "",
};

function typeMeta(checkType: string) {
  return TYPE_META[checkType] || DEFAULT_META;
}

function Tags({ items, chipClass }: { items: string[]; chipClass: string }) {
  if (!items || items.length === 0) {
    return <span className="text-sm text-muted-foreground">(none specified)</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${chipClass}`}
        >
          <Tag className="h-3 w-3" />
          {item}
        </span>
      ))}
    </div>
  );
}

function EvaluationConfigDetails({ check }: { check: Check }) {
  const config = check.evaluation_config || {};
  const meta = typeMeta(check.check_type);

  if (check.check_type === "A_VERBATIM") {
    const approvedScript = config.approved_script as string | undefined;
    const keyPhrases = (config.key_phrases as string[]) || [];
    const matchThreshold = config.match_threshold as number | undefined;
    const speaker = (config.speaker as string) || "agent";

    return (
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Approved Script <span className="font-normal">(spoken by {speaker})</span>
          </div>
          <blockquote className={`flex items-start gap-2 rounded-md border-l-4 border-l-blue-400 bg-blue-50/60 px-3 py-2 text-sm italic text-foreground dark:bg-blue-500/5`}>
            <Quote className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <span>{approvedScript || "(no approved script configured)"}</span>
          </blockquote>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Key Phrases
          </div>
          <Tags items={keyPhrases} chipClass={meta.chip} />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Match Threshold
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>
            {matchThreshold != null ? `${Math.round(matchThreshold * 100)}%` : "n/a"}
          </span>
        </div>
      </div>
    );
  }

  if (check.check_type === "B_FACTUAL") {
    const crmFields = (config.crm_fields as string[]) || [];
    const comparisonRules = config.comparison_rules as string | undefined;
    const rateCardReference = (config.rate_card_reference as Record<string, unknown>) || {};
    const speaker = (config.speaker as string) || "agent";
    const rateCardEntries = Object.entries(rateCardReference);

    return (
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            CRM Fields <span className="font-normal">(ground truth, checked against {speaker})</span>
          </div>
          <Tags items={crmFields} chipClass={meta.chip} />
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Comparison Rules
          </div>
          <p className="text-sm text-foreground/90">
            {comparisonRules || "(no specific rules — general accuracy judgement)"}
          </p>
        </div>
        {rateCardEntries.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rate Card Reference
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rateCardEntries.map(([k, v]) => (
                <span
                  key={k}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.chip}`}
                >
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (check.check_type === "C_BEHAVIOUR") {
    const behaviourType = config.behaviour_type as string | undefined;
    const instructions = config.instructions as string | undefined;
    const thresholdSeconds = config.threshold_seconds as number | undefined;
    const maxOccurrences = config.max_occurrences as number | undefined;

    return (
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Behaviour Type
          </div>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>
            {behaviourType || "(unspecified)"}
          </span>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Instructions
          </div>
          <p className="text-sm text-foreground/90">
            {instructions || "(no specific instructions — general judgement)"}
          </p>
        </div>
        {(thresholdSeconds != null || maxOccurrences != null) && (
          <div className="flex flex-wrap gap-4 text-sm">
            {thresholdSeconds != null && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Threshold:{" "}
                </span>
                <span className="font-medium">{thresholdSeconds}s</span>
              </div>
            )}
            {maxOccurrences != null && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Max Occurrences:{" "}
                </span>
                <span className="font-medium">{maxOccurrences}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Unknown check type — dump raw config so nothing is hidden from judges.
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
      {JSON.stringify(config, null, 2)}
    </pre>
  );
}

function CheckCard({ check, expanded, onToggle, highlight }: { check: Check; expanded: boolean; onToggle: () => void; highlight?: boolean }) {
  const meta = typeMeta(check.check_type);
  const Icon = meta.icon;

  return (
    <Card id={`check-${check.id}`} className={`overflow-hidden ${meta.border} ${highlight ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-left ${meta.headerBg}`}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 py-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {expanded ? (
              <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{check.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {check.code}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pill}`}>
                  {meta.label}
                </span>
                {check.is_critical && (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    CRITICAL
                  </Badge>
                )}
              </div>
              {check.description && (
                <p className="mt-1 text-sm text-muted-foreground">{check.description}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Weight: {check.weight}</span>
            {check.category && <span>{check.category}</span>}
          </div>
        </CardHeader>
      </button>
      {expanded && (
        <CardContent className="border-t pt-4">
          <EvaluationConfigDetails check={check} />
          <div className="mt-4 flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
            <span>Effective from: {new Date(check.effective_from).toLocaleDateString()}</span>
            {check.effective_to && (
              <span>Effective to: {new Date(check.effective_to).toLocaleDateString()}</span>
            )}
            <span>Version: {check.version}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function ChecksPage() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight") ? Number(searchParams.get("highlight")) : null;
  const highlightHandled = useRef(false);

  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [selectedRetailerId, setSelectedRetailerId] = useState<number | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [retailersLoading, setRetailersLoading] = useState(true);
  const [checksLoading, setChecksLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    getRetailers()
      .then((data) => {
        setRetailers(data);
        if (data.length > 0) setSelectedRetailerId(data[0].id);
      })
      .catch(console.error)
      .finally(() => setRetailersLoading(false));
  }, []);

  const loadChecks = useCallback((retailerId: number) => {
    setChecksLoading(true);
    setExpandedIds(new Set());
    getChecks(retailerId)
      .then((loaded) => {
        setChecks(loaded);
        if (highlightId && !highlightHandled.current) {
          const found = loaded.find((c) => c.id === highlightId);
          if (found) {
            highlightHandled.current = true;
            setExpandedIds(new Set([found.id]));
            setTimeout(() => {
              document.getElementById(`check-${found.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
          }
        }
      })
      .catch(console.error)
      .finally(() => setChecksLoading(false));
  }, [highlightId]);

  useEffect(() => {
    if (selectedRetailerId != null) loadChecks(selectedRetailerId);
  }, [selectedRetailerId, loadChecks]);

  useEffect(() => {
    if (highlightId && retailers.length > 0 && !highlightHandled.current) {
      for (const r of retailers) {
        getChecks(r.id).then((rChecks) => {
          if (rChecks.some((c) => c.id === highlightId)) {
            setSelectedRetailerId(r.id);
          }
        }).catch(() => {});
      }
    }
  }, [highlightId, retailers]);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalChecks = checks.length;
  const criticalCount = checks.filter((c) => c.is_critical).length;
  const verbatimCount = checks.filter((c) => c.check_type === "A_VERBATIM").length;
  const factualCount = checks.filter((c) => c.check_type === "B_FACTUAL").length;
  const behaviourCount = checks.filter((c) => c.check_type === "C_BEHAVIOUR").length;

  const selectedRetailer = retailers.find((r) => r.id === selectedRetailerId);

  if (retailersLoading) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Loading retailers...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Check Library</h1>
        <p className="mt-1 text-muted-foreground">
          Every check below is a config row, not code. Pick a retailer — new retailer,
          new rows, zero code changes.
        </p>
      </div>

      {/* Retailer selector tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-4">
        {retailers.map((r) => {
          const active = r.id === selectedRetailerId;
          return (
            <button
              key={r.id}
              onClick={() => setSelectedRetailerId(r.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              {r.name}
              {!r.active && <span className="ml-1.5 text-xs opacity-70">(inactive)</span>}
            </button>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" /> Total Checks
            </div>
            <div className="mt-1 text-2xl font-bold">{totalChecks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MessageSquareQuote className="h-3.5 w-3.5" /> Verbatim
            </div>
            <div className="mt-1 text-2xl font-bold text-blue-600 dark:text-blue-400">
              {verbatimCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <ClipboardCheck className="h-3.5 w-3.5" /> Factual
            </div>
            <div className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
              {factualCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Users2 className="h-3.5 w-3.5" /> Behavioural
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
              {behaviourCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Check cards */}
      {checksLoading ? (
        <div className="text-center py-16 text-muted-foreground">
          Loading checks for {selectedRetailer?.name || "retailer"}...
        </div>
      ) : checks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No checks configured for {selectedRetailer?.name || "this retailer"} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {checks.map((check) => (
            <CheckCard
              key={check.id}
              check={check}
              expanded={expandedIds.has(check.id)}
              onToggle={() => toggleExpanded(check.id)}
              highlight={check.id === highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
