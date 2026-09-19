"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDashboardSummary,
  getCriticalFails,
  getRepeatOffenders,
  getGateDistribution,
  getRetailers,
  getAgentPerformance,
  getAuditorAgreement,
} from "@/lib/api";
import type {
  DashboardSummary,
  CriticalFailBreakdown,
  RepeatOffender,
  GateDistribution,
  Retailer,
  AgentPerformance,
  AuditorAgreement,
} from "@/lib/types";
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Users,
  MessageSquareQuote,
  ClipboardCheck,
  Users2,
  ChevronRight,
  Home,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Gauge,
  Scale,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

const GATE_COLORS: Record<string, string> = {
  auto_submit: "#22c55e",
  held_critical_fail: "#ef4444",
  held_low_confidence: "#eab308",
  held_random_sample: "#3b82f6",
};

const GATE_LABELS: Record<string, string> = {
  auto_submit: "Auto Submit",
  held_critical_fail: "Critical Fail",
  held_low_confidence: "Low Confidence",
  held_random_sample: "Random Sample",
};

type CategoryKey = "A_VERBATIM" | "B_FACTUAL" | "C_BEHAVIOUR";

const CATEGORY_PIE_COLORS: Record<CategoryKey, string> = {
  A_VERBATIM: "#3b82f6",
  B_FACTUAL: "#10b981",
  C_BEHAVIOUR: "#f59e0b",
};

const CATEGORY_CONFIG: Record<
  CategoryKey,
  {
    label: string;
    icon: typeof MessageSquareQuote;
    ring: string;
    text: string;
    bg: string;
    border: string;
    bar: string;
  }
> = {
  A_VERBATIM: {
    label: "Verbatim / Script",
    icon: MessageSquareQuote,
    ring: "ring-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-900",
    bar: "bg-blue-500",
  },
  B_FACTUAL: {
    label: "Factual / CRM",
    icon: ClipboardCheck,
    ring: "ring-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-900",
    bar: "bg-emerald-500",
  },
  C_BEHAVIOUR: {
    label: "Behavioural",
    icon: Users2,
    ring: "ring-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-900",
    bar: "bg-amber-500",
  },
};

type AgentSortKey =
  | "agent_name"
  | "leads_scored"
  | "pass_rate"
  | "critical_fail_rate"
  | "avg_weighted_score"
  | "avg_weighted_score_excl_fatal";

function SortIcon({
  column,
  activeSort,
}: {
  column: AgentSortKey;
  activeSort: { key: AgentSortKey; dir: "asc" | "desc" };
}) {
  if (activeSort.key !== column)
    return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return activeSort.dir === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [criticalFails, setCriticalFails] = useState<CriticalFailBreakdown[]>([]);
  const [repeatOffenders, setRepeatOffenders] = useState<RepeatOffender[]>([]);
  const [gateDistribution, setGateDistribution] = useState<GateDistribution[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [retailerFilter, setRetailerFilter] = useState<string>("");
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [auditorAgreement, setAuditorAgreement] = useState<AuditorAgreement | null>(null);
  const [loading, setLoading] = useState(true);

  // Drill-down state for the critical fails breakdown
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRetailer, setSelectedRetailer] = useState<string | null>(null);

  // Sort state for the agent performance table
  const [agentSort, setAgentSort] = useState<{ key: AgentSortKey; dir: "asc" | "desc" }>({
    key: "leads_scored",
    dir: "desc",
  });

  const loadData = useCallback((retailerId?: string) => {
    const params: Record<string, string> = {};
    if (retailerId) params.retailer_id = retailerId;

    setLoading(true);
    Promise.all([
      getDashboardSummary(params),
      getCriticalFails(params),
      getRepeatOffenders(params),
      getGateDistribution(params),
      getAgentPerformance(params),
      getAuditorAgreement(params),
    ])
      .then(([s, cf, ro, gd, ap, aa]) => {
        setSummary(s);
        setCriticalFails(cf);
        setRepeatOffenders(ro);
        setGateDistribution(gd);
        setAgentPerformance(ap);
        setAuditorAgreement(aa);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getRetailers().then(setRetailers).catch(console.error);
    loadData();
  }, [loadData]);

  const handleRetailerChange = (retailerId: string) => {
    setRetailerFilter(retailerId);
    setSelectedCategory(null);
    setSelectedRetailer(null);
    loadData(retailerId || undefined);
  };

  const handleAgentSort = (key: AgentSortKey) => {
    setAgentSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };

  const sortedAgentPerformance = useMemo(() => {
    const { key, dir } = agentSort;
    const rows = [...agentPerformance];
    rows.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = (av as number) - (bv as number);
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [agentPerformance, agentSort]);

  const pieData = gateDistribution.map((gd) => ({
    name: GATE_LABELS[gd.gate_decision] || gd.gate_decision,
    value: gd.count,
    color: GATE_COLORS[gd.gate_decision] || "#6b7280",
  }));

  // Level 1 — totals per category
  const categoryTotals: Record<CategoryKey, number> = {
    A_VERBATIM: 0,
    B_FACTUAL: 0,
    C_BEHAVIOUR: 0,
  };
  criticalFails.forEach((cf) => {
    if (cf.check_type in categoryTotals && cf.fail_count > 0) {
      categoryTotals[cf.check_type as CategoryKey] += cf.fail_count;
    }
  });

  const categoryPieData = (Object.keys(CATEGORY_CONFIG) as CategoryKey[])
    .map((key) => ({
      name: CATEGORY_CONFIG[key].label,
      value: categoryTotals[key],
      color: CATEGORY_PIE_COLORS[key],
    }))
    .filter((entry) => entry.value > 0);

  // Level 2 — retailers within the selected category
  const retailerBreakdown: Record<string, number> = {};
  if (selectedCategory) {
    criticalFails
      .filter((cf) => cf.check_type === selectedCategory && cf.fail_count > 0)
      .forEach((cf) => {
        retailerBreakdown[cf.retailer_name] =
          (retailerBreakdown[cf.retailer_name] || 0) + cf.fail_count;
      });
  }
  const retailerRows = Object.entries(retailerBreakdown).sort(
    (a, b) => b[1] - a[1]
  );
  const maxRetailerFails = retailerRows.length
    ? Math.max(...retailerRows.map(([, count]) => count))
    : 0;

  // Level 3 — specific checks within the selected category + retailer
  const checkBreakdown =
    selectedCategory && selectedRetailer
      ? criticalFails
          .filter(
            (cf) =>
              cf.check_type === selectedCategory &&
              cf.retailer_name === selectedRetailer &&
              cf.fail_count > 0
          )
          .sort((a, b) => b.fail_count - a.fail_count)
      : [];

  const handleSelectCategory = (category: string) => {
    setSelectedCategory((prev) => (prev === category ? prev : category));
    setSelectedRetailer(null);
  };

  const handleSelectRetailer = (retailerName: string) => {
    setSelectedRetailer(retailerName);
  };

  const goToBreadcrumb = (level: "all" | "category") => {
    if (level === "all") {
      setSelectedCategory(null);
      setSelectedRetailer(null);
    } else if (level === "category") {
      setSelectedRetailer(null);
    }
  };

  if (loading && !summary)
    return (
      <div className="text-center py-20 text-muted-foreground">
        Loading dashboard...
      </div>
    );

  return (
    <div className="space-y-8">
      {/* Header with Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Sales QA scoring overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={retailerFilter}
            onChange={(e) => handleRetailerChange(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Retailers</option>
            {retailers.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Scored
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.total_scored}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.total_passed} passed, {summary.total_failed} held
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pass Rate
              </CardTitle>
              <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {(summary.pass_rate * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg confidence: {(summary.avg_confidence * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
          <Card className="ring-1 ring-blue-200 dark:ring-blue-900">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                First-Pass Yield
              </CardTitle>
              <Gauge className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {(summary.first_pass_yield * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Sales that go green with no rework
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Critical Fail Rate
              </CardTitle>
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                {(summary.critical_fail_rate * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Leads with at least one critical fail
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Weighted Score
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(summary.avg_weighted_score * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all scored leads
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Score (excl. Fatal)
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(summary.avg_weighted_score_excl_fatal * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Score with fatal factors excluded
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gate Decision Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Gate Decision Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={(props: Record<string, any>) =>
                    `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">
              No scored leads yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Agent Performance
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Per-agent scoring stats. Click a column header to sort.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {sortedAgentPerformance.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleAgentSort("agent_name")}
                    >
                      Agent <SortIcon column="agent_name" activeSort={agentSort} />
                    </button>
                  </TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Team Leader</TableHead>
                  <TableHead className="text-right">
                    <button
                      className="flex items-center gap-1 justify-end w-full hover:text-foreground"
                      onClick={() => handleAgentSort("leads_scored")}
                    >
                      Leads Scored <SortIcon column="leads_scored" activeSort={agentSort} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      className="flex items-center gap-1 justify-end w-full hover:text-foreground"
                      onClick={() => handleAgentSort("pass_rate")}
                    >
                      Pass Rate <SortIcon column="pass_rate" activeSort={agentSort} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      className="flex items-center gap-1 justify-end w-full hover:text-foreground"
                      onClick={() => handleAgentSort("critical_fail_rate")}
                    >
                      Critical Fail Rate <SortIcon column="critical_fail_rate" activeSort={agentSort} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      className="flex items-center gap-1 justify-end w-full hover:text-foreground"
                      onClick={() => handleAgentSort("avg_weighted_score")}
                    >
                      Avg Score <SortIcon column="avg_weighted_score" activeSort={agentSort} />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      className="flex items-center gap-1 justify-end w-full hover:text-foreground"
                      onClick={() => handleAgentSort("avg_weighted_score_excl_fatal")}
                    >
                      Avg Score (excl. Fatal) <SortIcon column="avg_weighted_score_excl_fatal" activeSort={agentSort} />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAgentPerformance.map((ap) => (
                  <TableRow key={ap.agent_id}>
                    <TableCell className="font-medium">{ap.agent_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ap.employee_id}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ap.site || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ap.team_leader_name || "—"}
                    </TableCell>
                    <TableCell className="text-right">{ap.leads_scored}</TableCell>
                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                      {(ap.pass_rate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
                      {(ap.critical_fail_rate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {(ap.avg_weighted_score * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {(ap.avg_weighted_score_excl_fatal * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-16 text-center text-muted-foreground">
              No agent performance data yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auditor Agreement / Model Calibration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Auditor Agreement / Model Calibration
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            How often human overrides agree with the AI model. Higher
            agreement means better model calibration.
          </p>
        </CardHeader>
        <CardContent>
          {auditorAgreement ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Agreement Rate</p>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                  {(auditorAgreement.agreement_rate * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Results left unchanged by human review
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total Overrides</p>
                <div className="text-3xl font-bold mt-1">
                  {auditorAgreement.total_overrides}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  In the selected date range
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  FAIL &rarr; PASS
                </p>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {auditorAgreement.total_overrides > 0
                    ? (
                        (auditorAgreement.fail_to_pass_count /
                          auditorAgreement.total_overrides) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {auditorAgreement.fail_to_pass_count} overrides — model was too
                  strict
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  FAIL &rarr; NOTE
                </p>
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {auditorAgreement.total_overrides > 0
                    ? (
                        (auditorAgreement.fail_to_note_count /
                          auditorAgreement.total_overrides) *
                        100
                      ).toFixed(1)
                    : "0.0"}
                  %
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {auditorAgreement.fail_to_note_count} overrides — downgraded to
                  note
                </p>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No auditor agreement data yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Critical Fails Drill-down */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Critical Fails Breakdown
          </CardTitle>
          {/* Breadcrumb trail */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <button
              onClick={() => goToBreadcrumb("all")}
              className={`flex items-center gap-1 hover:text-foreground transition-colors ${
                !selectedCategory ? "font-semibold text-foreground" : ""
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              All Failures
            </button>
            {selectedCategory && (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <button
                  onClick={() => goToBreadcrumb("category")}
                  className={`hover:text-foreground transition-colors ${
                    !selectedRetailer ? "font-semibold text-foreground" : ""
                  }`}
                >
                  {CATEGORY_CONFIG[selectedCategory as CategoryKey]?.label ||
                    selectedCategory}
                </button>
              </>
            )}
            {selectedCategory && selectedRetailer && (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-semibold text-foreground">
                  {selectedRetailer}
                </span>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Level 1 — Category cards + pie chart */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-4 grid-cols-3">
              {(Object.keys(CATEGORY_CONFIG) as CategoryKey[]).map((key) => {
                const config = CATEGORY_CONFIG[key];
                const Icon = config.icon;
                const count = categoryTotals[key];
                const isSelected = selectedCategory === key;
                const isEmpty = count === 0;
                return (
                  <button
                    key={key}
                    onClick={() => handleSelectCategory(key)}
                    className={`rounded-lg border p-4 text-left transition-all ${
                      isEmpty
                        ? "border-border bg-muted/30 opacity-60"
                        : `${config.border} ${config.bg}`
                    } ${
                      isSelected ? `ring-2 ${config.ring}` : ""
                    } hover:shadow-sm`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className={`h-5 w-5 ${
                          isEmpty ? "text-muted-foreground" : config.text
                        }`}
                      />
                    </div>
                    <div
                      className={`text-2xl font-bold mt-2 ${
                        isEmpty ? "text-muted-foreground" : config.text
                      }`}
                    >
                      {count}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {config.label}
                    </p>
                  </button>
                );
              })}
            </div>
            <div>
              {categoryPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={(props: Record<string, any>) =>
                        `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {categoryPieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  No critical failures yet
                </div>
              )}
            </div>
          </div>

          {/* Level 2 — Retailers within selected category */}
          {selectedCategory && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-sm font-medium text-muted-foreground">
                Retailers with{" "}
                {CATEGORY_CONFIG[selectedCategory as CategoryKey]?.label}{" "}
                failures
              </p>
              {retailerRows.length > 0 ? (
                <div className="space-y-1.5">
                  {retailerRows.map(([retailerName, count]) => {
                    const isSelected = selectedRetailer === retailerName;
                    const config = CATEGORY_CONFIG[selectedCategory as CategoryKey];
                    const pct = maxRetailerFails
                      ? (count / maxRetailerFails) * 100
                      : 0;
                    return (
                      <button
                        key={retailerName}
                        onClick={() => handleSelectRetailer(retailerName)}
                        className={`w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? `${config.border} ${config.bg}`
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <span className="flex-1 text-sm font-medium truncate">
                          {retailerName}
                        </span>
                        <div className="w-32 bg-muted rounded-full h-2 hidden sm:block">
                          <div
                            className="h-2 rounded-full bg-red-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className="text-sm font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No failures recorded for this category
                </div>
              )}
            </div>
          )}

          {/* Level 3 — Specific checks within selected category + retailer */}
          {selectedCategory && selectedRetailer && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-sm font-medium text-muted-foreground">
                Failed checks — {selectedRetailer}
              </p>
              {checkBreakdown.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Fails</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Fail Rate</TableHead>
                      <TableHead className="w-[160px]">Rate</TableHead>
                      <TableHead className="text-center">Config</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkBreakdown.map((cf) => {
                      return (
                        <TableRow key={cf.check_code}>
                          <TableCell className="font-medium">
                            {cf.check_name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {cf.check_code}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">
                            {cf.fail_count}
                          </TableCell>
                          <TableCell className="text-right">
                            {cf.total_scored}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {(cf.fail_rate * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="h-2 rounded-full bg-red-500"
                                style={{ width: `${cf.fail_rate * 100}%` }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Link
                              href={`/checks?highlight=${cf.check_id}`}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View Config
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No failed checks for this retailer
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repeat Offenders */}
      {repeatOffenders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Repeat Offenders
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Agents with multiple critical failures in the last 7 days
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead className="text-right">Critical Fails</TableHead>
                  <TableHead className="text-right">Leads Scored</TableHead>
                  <TableHead className="text-right">Fail Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repeatOffenders.map((ro) => (
                  <TableRow key={ro.agent_id}>
                    <TableCell className="font-medium">
                      {ro.agent_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ro.employee_id}
                    </TableCell>
                    <TableCell className="text-right text-red-600 dark:text-red-400 font-semibold">
                      {ro.critical_fail_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {ro.leads_scored}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {(ro.fail_rate * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {summary && summary.total_scored === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No leads scored yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Upload a recording and score a lead to see your dashboard come to
              life. Go to Leads to get started.
            </p>
            <a href="/leads">
              <Button className="mt-4">View Leads</Button>
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
