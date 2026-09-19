"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLeads, uploadTranscript } from "@/lib/api";
import type { LeadListItem } from "@/lib/types";

function gateBadgeVariant(decision: string | null) {
  switch (decision) {
    case "auto_submit":
      return "default" as const;
    case "held_critical_fail":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function gateBadgeLabel(decision: string | null) {
  switch (decision) {
    case "auto_submit":
      return "Auto Submit";
    case "held_critical_fail":
      return "Held - Critical Fail";
    case "held_low_confidence":
      return "Held - Low Confidence";
    case "held_random_sample":
      return "Held - Random Sample";
    case "pending":
      return "Pending";
    default:
      return decision || "—";
  }
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeLeadId, setActiveLeadId] = useState<number | null>(null);

  useEffect(() => {
    getLeads()
      .then(setLeads)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeLeadId) return;
    setUploadingFor(activeLeadId);
    try {
      await uploadTranscript(activeLeadId, file);
      const updated = await getLeads();
      setLeads(updated);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploadingFor(null);
      setActiveLeadId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (loading)
    return (
      <div className="text-center py-20 text-muted-foreground">
        Loading leads...
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Leads</h1>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleTranscriptUpload}
        className="hidden"
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Retailer</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Sale Date</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Gate Decision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {lead.external_id}
                    </Link>
                  </TableCell>
                  <TableCell>{lead.customer_name || "—"}</TableCell>
                  <TableCell>{lead.retailer_name || "—"}</TableCell>
                  <TableCell>{lead.agent_name || "—"}</TableCell>
                  <TableCell>{lead.sale_date}</TableCell>
                  <TableCell>
                    {lead.weighted_score != null
                      ? `${(lead.weighted_score * 100).toFixed(0)}%`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={gateBadgeVariant(lead.gate_decision)}>
                      {gateBadgeLabel(lead.gate_decision)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{lead.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Upload Transcript"
                        disabled={uploadingFor === lead.id}
                        onClick={() => {
                          setActiveLeadId(lead.id);
                          fileInputRef.current?.click();
                        }}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Link href={`/leads/${lead.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Record Audio"
                        >
                          <Mic className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {leads.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No leads found
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
