"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createLead, getRetailers } from "@/lib/api";
import type { Retailer } from "@/lib/types";

export default function NewLeadPage() {
  const router = useRouter();
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    external_id: "",
    retailer_id: "",
    agent_id: "",
    campaign: "",
    customer_name: "",
    plan_name: "",
    plan_rate: "",
    sale_date: new Date().toISOString().split("T")[0],
  });

  const [crmFields, setCrmFields] = useState<{ key: string; value: string }[]>([
    { key: "plan_rate", value: "" },
    { key: "plan_name", value: "" },
    { key: "email", value: "" },
    { key: "state", value: "" },
  ]);

  useEffect(() => {
    getRetailers().then(setRetailers).catch(console.error);
  }, []);

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addCrmField = () => {
    setCrmFields((prev) => [...prev, { key: "", value: "" }]);
  };

  const updateCrmField = (index: number, part: "key" | "value", val: string) => {
    setCrmFields((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [part]: val };
      return copy;
    });
  };

  const removeCrmField = (index: number) => {
    setCrmFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.external_id || !form.retailer_id) {
      setError("Lead ID and Retailer are required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const crm_data: Record<string, string> = {};
    for (const f of crmFields) {
      if (f.key.trim()) crm_data[f.key.trim()] = f.value;
    }

    try {
      const lead = await createLead({
        external_id: form.external_id,
        retailer_id: Number(form.retailer_id),
        agent_id: form.agent_id ? Number(form.agent_id) : null,
        campaign: form.campaign || null,
        customer_name: form.customer_name || null,
        plan_name: form.plan_name || null,
        plan_rate: form.plan_rate || null,
        sale_date: form.sale_date,
        crm_data: Object.keys(crm_data).length > 0 ? crm_data : null,
      });
      router.push(`/leads/${lead.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create lead");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Create New Lead</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Lead Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Lead ID *
                </label>
                <Input
                  value={form.external_id}
                  onChange={(e) => updateField("external_id", e.target.value)}
                  placeholder="LEAD-2024-001"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Retailer *
                </label>
                <select
                  value={form.retailer_id}
                  onChange={(e) => updateField("retailer_id", e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select retailer</option>
                  {retailers.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Customer Name
                </label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => updateField("customer_name", e.target.value)}
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Sale Date
                </label>
                <Input
                  type="date"
                  value={form.sale_date}
                  onChange={(e) => updateField("sale_date", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Plan Name
                </label>
                <Input
                  value={form.plan_name}
                  onChange={(e) => updateField("plan_name", e.target.value)}
                  placeholder="AGL Value Saver"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Plan Rate
                </label>
                <Input
                  value={form.plan_rate}
                  onChange={(e) => updateField("plan_rate", e.target.value)}
                  placeholder="26.4c/kWh"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Campaign
                </label>
                <Input
                  value={form.campaign}
                  onChange={(e) => updateField("campaign", e.target.value)}
                  placeholder="Energy Switch Q1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Agent ID
                </label>
                <Input
                  value={form.agent_id}
                  onChange={(e) => updateField("agent_id", e.target.value)}
                  placeholder="1"
                  type="number"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>CRM Data</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addCrmField}>
                + Add Field
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              CRM fields are compared against the transcript during factual checks (Type B).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {crmFields.map((field, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={field.key}
                  onChange={(e) => updateCrmField(i, "key", e.target.value)}
                  placeholder="Field name (e.g. email)"
                  className="w-1/3"
                />
                <Input
                  value={field.value}
                  onChange={(e) => updateCrmField(i, "value", e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCrmField(i)}
                  className="text-muted-foreground hover:text-red-500"
                >
                  x
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push("/leads")}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Lead"}
          </Button>
        </div>
      </form>
    </div>
  );
}
