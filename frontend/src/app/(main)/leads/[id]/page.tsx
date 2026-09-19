"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
// Badge import removed — using inline styles
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// Table imports kept for potential future use
import {
  getLead,
  getScorecard,
  getTranscript,
  getRecording,
  getAudioUrl,
  uploadTranscript,
  uploadRecording,
  deleteRecording,
  transcribeLead,
  scoreLead,
  processLead,
} from "@/lib/api";
import type { Lead, Scorecard, Transcript, ScoreResult, Recording } from "@/lib/types";
import { FileText, Play, Pause, Volume2, CheckCircle, XCircle, AlertTriangle, ShieldAlert, Clock, MessageSquareQuote, Mic, Square, Trash2, AudioLines, UserCheck, Undo2 } from "lucide-react";

function resultColor(result: string) {
  switch (result) {
    case "PASS":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case "FAIL":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    case "NOTE":
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800";
    default:
      return "";
  }
}

function gateColor(decision: string) {
  switch (decision) {
    case "auto_submit":
      return "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400";
    case "held_critical_fail":
      return "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400";
    case "held_low_confidence":
      return "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400";
    case "held_random_sample":
      return "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400";
    default:
      return "bg-muted border-border text-muted-foreground";
  }
}

function gateLabel(decision: string) {
  switch (decision) {
    case "auto_submit":
      return "AUTO SUBMIT — All checks passed";
    case "held_critical_fail":
      return "HELD — Critical check failure detected";
    case "held_low_confidence":
      return "HELD — Low confidence score requires human review";
    case "held_random_sample":
      return "HELD — Random sample for QA calibration";
    case "pending":
      return "PENDING — Not yet scored";
    default:
      return decision;
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function typeLabelFor(checkType: string) {
  return checkType === "A_VERBATIM"
    ? "Verbatim / Script"
    : checkType === "B_FACTUAL"
      ? "Factual / CRM"
      : checkType === "C_BEHAVIOUR"
        ? "Behavioural"
        : checkType;
}

function typeBadgeClass(checkType: string) {
  switch (checkType) {
    case "A_VERBATIM":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "B_FACTUAL":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "C_BEHAVIOUR":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  }
}

export default function ScorecardPage() {
  const params = useParams();
  const leadId = Number(params.id);
  const [lead, setLead] = useState<Lead | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [processing, setProcessing] = useState(false);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  useEffect(() => {
    getLead(leadId).then(setLead).catch(console.error);
    getScorecard(leadId).then(setScorecard).catch(() => {});
    getTranscript(leadId).then(setTranscript).catch(() => {});
    getRecording(leadId).then(setRecording).catch(() => {});
  }, [leadId]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const handleTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTranscript(true);
    setError(null);
    try {
      const t = await uploadTranscript(leadId, file);
      setTranscript(t);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transcript upload failed");
    } finally {
      setUploadingTranscript(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `recording-${leadId}.webm`, { type: "audio/webm" });
        setUploadingRecording(true);
        try {
          const rec = await uploadRecording(leadId, file);
          setRecording(rec);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Recording upload failed");
        } finally {
          setUploadingRecording(false);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setError("Microphone access denied. Please allow microphone access.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);
    try {
      if (transcript && !recording) {
        await scoreLead(leadId);
      } else {
        await processLead(leadId);
      }
      const [updatedLead, fullScorecard, updatedTranscript] = await Promise.all([
        getLead(leadId),
        getScorecard(leadId),
        getTranscript(leadId).catch(() => null),
      ]);
      setLead(updatedLead);
      setScorecard(fullScorecard);
      if (updatedTranscript) setTranscript(updatedTranscript);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteRecording = async () => {
    if (!recording) return;
    if (!confirm("Delete this audio recording? This cannot be undone.")) return;
    try {
      await deleteRecording(leadId);
      setRecording(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete recording");
    }
  };

  const handleTranscribe = async () => {
    setTranscribing(true);
    setError(null);
    try {
      const t = await transcribeLead(leadId);
      setTranscript(t);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    audio.play();
    setIsPlaying(true);
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  if (!lead)
    return (
      <div className="text-center py-20 text-muted-foreground">Loading...</div>
    );

  const audioSrc = recording ? getAudioUrl(recording.id) : null;

  return (
    <div className="space-y-6">
      {/* Lead Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{lead.external_id}</h1>
          <p className="text-muted-foreground mt-1">
            {lead.customer_name} &middot;{" "}
            {lead.retailer?.name || "Unknown Retailer"} &middot;{" "}
            {lead.agent?.name || "No Agent"} &middot; {lead.sale_date}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={transcriptInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleTranscriptUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => transcriptInputRef.current?.click()}
            disabled={uploadingTranscript}
          >
            <FileText className="h-4 w-4 mr-2" />
            {uploadingTranscript ? "Uploading..." : "Upload Transcript"}
          </Button>
          {!isRecording ? (
            <Button
              variant="outline"
              onClick={startRecording}
              disabled={uploadingRecording}
            >
              <Mic className="h-4 w-4 mr-2" />
              {uploadingRecording ? "Uploading..." : "Record Audio"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={stopRecording}
              >
                <Square className="h-3 w-3 mr-1 fill-current" />
                Stop
              </Button>
            </div>
          )}
          {recording && !transcript && !scorecard && (
            <Button
              variant="outline"
              onClick={handleTranscribe}
              disabled={transcribing}
            >
              <AudioLines className="h-4 w-4 mr-2" />
              {transcribing ? "Transcribing..." : "Transcribe"}
            </Button>
          )}
          {(recording || transcript) && !scorecard && (
            <Button onClick={handleProcess} disabled={processing || transcribing} size="lg">
              {processing ? "Scoring..." : "Score This Lead"}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Audio Player */}
      {audioSrc && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={togglePlay}>
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
              <div className="flex-1">
                <div
                  className="relative w-full h-2 bg-muted rounded-full cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    seekTo(pct * duration);
                  }}
                >
                  <div
                    className="absolute h-2 bg-primary rounded-full"
                    style={{
                      width: duration ? `${(currentTime / duration) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>
              <span className="text-sm text-muted-foreground tabular-nums w-24 text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDeleteRecording}
                className="text-muted-foreground hover:text-red-600"
                title="Delete recording"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <audio
              ref={audioRef}
              src={audioSrc}
              preload="metadata"
              onTimeUpdate={() =>
                setCurrentTime(audioRef.current?.currentTime || 0)
              }
              onLoadedMetadata={() =>
                setDuration(audioRef.current?.duration || 0)
              }
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
            />
          </CardContent>
        </Card>
      )}

      {/* Gate Decision Banner */}
      {scorecard && (
        <div
          className={`border rounded-lg px-6 py-4 ${gateColor(scorecard.gate_decision)}`}
        >
          <p className="font-semibold text-lg">
            {gateLabel(scorecard.gate_decision)}
          </p>
          <p className="text-sm mt-1 opacity-75">
            Scored in{" "}
            {scorecard.scoring_duration_ms
              ? `${(scorecard.scoring_duration_ms / 1000).toFixed(1)}s`
              : "—"}{" "}
            &middot; {scorecard.total_checks} checks evaluated
          </p>

          {/* Failure Details — compact summary of failed checks, visible immediately in the banner */}
          {scorecard.gate_decision !== "auto_submit" &&
            scorecard.results?.some((r: ScoreResult) => r.result === "FAIL") && (
              <div className="mt-4 border-t border-current/20 pt-3">
                <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="h-4 w-4" />
                  Failure Details
                </p>
                <div className="space-y-2">
                  {scorecard.results
                    .filter((r: ScoreResult) => r.result === "FAIL")
                    .map((r: ScoreResult) => {
                      const evidence = r.evidence_text || "";
                      const truncatedEvidence =
                        evidence.length > 120
                          ? `${evidence.slice(0, 120)}…`
                          : evidence;
                      const checkType = r.check?.check_type || "";
                      const typeLabel = typeLabelFor(checkType);
                      return (
                        <div
                          key={r.id}
                          className="bg-background/70 dark:bg-background/40 border border-border rounded px-3 py-2 text-foreground"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <XCircle className="h-4 w-4 text-red-500 dark:text-red-400 flex-shrink-0" />
                            <span className="font-medium text-sm">
                              {r.check?.name || `Check #${r.check_id}`}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeBadgeClass(checkType)}`}>
                              {typeLabel}
                            </span>
                            {r.check?.is_critical && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 font-semibold">
                                CRITICAL
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                              <Clock className="h-3 w-3" />
                              {formatTime(r.audio_timestamp_start)} – {formatTime(r.audio_timestamp_end)}
                            </span>
                          </div>
                          <p className="text-sm mt-1">{r.reasoning}</p>
                          {truncatedEvidence && (
                            <p className="text-xs italic text-muted-foreground mt-1">
                              &ldquo;{truncatedEvidence}&rdquo;
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Human Review Outcome — shown when admin sets a review status */}
      {lead.status && ["acknowledged", "discussing_with_customer", "checking_crm", "approved", "rejected"].includes(lead.status) && scorecard && (() => {
        const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
          acknowledged: { label: "Acknowledged", color: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" },
          discussing_with_customer: { label: "Discussing with Customer", color: "bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400" },
          checking_crm: { label: "Checking CRM", color: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400" },
          approved: { label: "Approved by Human Auditor", color: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400" },
          rejected: { label: "Rejected by Human Auditor", color: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400" },
        };
        const cfg = STATUS_CONFIG[lead.status];
        if (!cfg) return null;

        const allOverrides = scorecard.results
          ?.flatMap((r: ScoreResult) => (r.overrides || []).map(ov => ({ ...ov, checkName: r.check?.name || `Check #${r.check_id}` })))
          || [];
        const overriddenToPass = allOverrides.filter(ov => ov.new_result === "PASS");

        return (
          <div className={`border rounded-lg px-6 py-4 ${cfg.color}`}>
            <div className="flex items-center gap-3 mb-1">
              <UserCheck className="h-6 w-6 flex-shrink-0" />
              <div>
                <p className="font-semibold text-lg">{cfg.label}</p>
                <p className="text-sm opacity-80">
                  This lead has been reviewed by a human auditor
                  {scorecard.failed > 0 && (
                    <> &middot; {scorecard.failed} AI-flagged discrepanc{scorecard.failed === 1 ? "y" : "ies"} observed</>
                  )}
                  {overriddenToPass.length > 0 && (
                    <> &middot; {overriddenToPass.length} override{overriddenToPass.length !== 1 ? "s" : ""} applied</>
                  )}
                </p>
              </div>
            </div>

            {allOverrides.length > 0 && (
              <div className="mt-3 border-t border-current/15 pt-3 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Undo2 className="h-4 w-4" />
                  Audit Trail — Human Overrides
                </p>
                {allOverrides.map((ov) => (
                  <div key={ov.id} className="bg-background/70 dark:bg-background/40 border border-border rounded px-3 py-2 text-foreground text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{ov.checkName}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">{ov.original_result}</span>
                      <span className="text-muted-foreground">&rarr;</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        ov.new_result === "PASS"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                      }`}>{ov.new_result}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        by <span className="font-medium text-foreground">{ov.overridden_by}</span> &middot; {new Date(ov.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 italic">&ldquo;{ov.reason}&rdquo;</p>
                  </div>
                ))}
              </div>
            )}

            {lead.status === "approved" && scorecard.failed > 0 && allOverrides.length === 0 && (
              <p className="text-sm opacity-80 mt-3 border-t border-current/15 pt-3">
                The auditor approved this lead despite {scorecard.failed} flagged check{scorecard.failed !== 1 ? "s" : ""}. No individual overrides were recorded — the approval covers the lead as a whole.
              </p>
            )}
          </div>
        );
      })()}

      {/* Score Summary Cards */}
      {scorecard && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Passed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {scorecard.passed}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {scorecard.failed}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {scorecard.noted}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Weighted Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(scorecard.weighted_score * 100).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Criticals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {scorecard.critical_passed}/{scorecard.critical_total}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Check Results — detailed cards */}
      {scorecard?.results && scorecard.results.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold">Check-by-Check Results</h2>
          {scorecard.results.map((r: ScoreResult) => {
            const isFail = r.result === "FAIL";
            const isPass = r.result === "PASS";
            const checkType = r.check?.check_type || "";
            const typeLabel = typeLabelFor(checkType);
            const evalConfig = r.check?.evaluation_config || {};
            const borderClass = isFail
              ? "border-red-300 dark:border-red-800"
              : isPass
                ? "border-green-300 dark:border-green-800"
                : "border-yellow-300 dark:border-yellow-800";
            const bgClass = isFail
              ? "bg-red-50/50 dark:bg-red-950/20"
              : isPass
                ? "bg-green-50/50 dark:bg-green-950/20"
                : "bg-yellow-50/50 dark:bg-yellow-950/20";

            return (
              <div
                key={r.id}
                className={`border rounded-lg p-4 ${borderClass} ${bgClass}`}
              >
                {/* Row 1: Check name, type badge, result badge, timestamp */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {isFail ? (
                      <XCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0" />
                    ) : isPass ? (
                      <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-yellow-500 dark:text-yellow-400 flex-shrink-0" />
                    )}
                    <div>
                      <span className="font-semibold text-base">
                        {r.check?.name || `Check #${r.check_id}`}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                          {r.check?.code}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeBadgeClass(checkType)}`}>
                          {typeLabel}
                        </span>
                        {r.check?.is_critical && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 font-semibold flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" />
                            CRITICAL
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${resultColor(r.result)}`}
                    >
                      {r.result}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="font-mono">
                        {formatTime(r.audio_timestamp_start)} – {formatTime(r.audio_timestamp_end)}
                      </span>
                      {audioSrc && (
                        <button
                          onClick={() => seekTo(r.audio_timestamp_start)}
                          className="ml-1 text-primary hover:underline cursor-pointer"
                          title="Play from here"
                        >
                          <Play className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Failure Category banner — explains which dimension caused the fail */}
                {isFail && checkType === "A_VERBATIM" && (
                  <div className="border-l-4 border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 pl-3 py-2 mb-3 text-sm">
                    <span className="font-semibold text-blue-800 dark:text-blue-300">
                      Verbatim Check Failed
                    </span>{" "}
                    <span className="text-blue-900/80 dark:text-blue-300/80">
                      — Transcript does not match the approved script. Key phrases like recording
                      disclaimer, T&amp;Cs, EIC must be spoken verbatim.
                    </span>
                    {evalConfig.approved_script && (
                      <p className="mt-1 italic border-l-2 border-blue-300 dark:border-blue-700 pl-2 text-blue-900/80 dark:text-blue-300/80">
                        &ldquo;{evalConfig.approved_script}&rdquo;
                      </p>
                    )}
                  </div>
                )}
                {isFail && checkType === "B_FACTUAL" && (
                  <div className="border-l-4 border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 pl-3 py-2 mb-3 text-sm">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      Factual Check Failed
                    </span>{" "}
                    <span className="text-emerald-900/80 dark:text-emerald-300/80">
                      — Mismatch between transcript, CRM fields, and/or retailer rate card.
                    </span>
                    {Array.isArray(evalConfig.crm_fields) && evalConfig.crm_fields.length > 0 && (
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        <span className="text-emerald-900/70 dark:text-emerald-300/70 text-xs">CRM fields:</span>
                        {evalConfig.crm_fields.map((field: string) => (
                          <span
                            key={field}
                            className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-mono"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    )}
                    {evalConfig.comparison_rules && (
                      <p className="mt-1 text-emerald-900/80 dark:text-emerald-300/80">
                        Comparison rules: {String(evalConfig.comparison_rules)}
                      </p>
                    )}
                  </div>
                )}
                {isFail && checkType === "C_BEHAVIOUR" && (
                  <div className="border-l-4 border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 pl-3 py-2 mb-3 text-sm">
                    <span className="font-semibold text-amber-800 dark:text-amber-300">
                      Behavioural Check Failed
                    </span>{" "}
                    <span className="text-amber-900/80 dark:text-amber-300/80">
                      — Call behaviour does not meet quality standards.
                    </span>
                    {evalConfig.behaviour_type && (
                      <p className="mt-1 text-amber-900/80 dark:text-amber-300/80">
                        Behaviour type: <span className="font-medium">{String(evalConfig.behaviour_type)}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Row 2: Confidence bar */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs text-muted-foreground w-20">Confidence</span>
                  <div className="flex-1 max-w-xs bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        r.confidence >= 0.7
                          ? "bg-green-500"
                          : r.confidence >= 0.5
                            ? "bg-yellow-500"
                            : "bg-red-500"
                      }`}
                      style={{ width: `${r.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold tabular-nums w-12">
                    {(r.confidence * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Row 3: Evidence quote with timestamp */}
                <div className="mb-2">
                  <div className="flex items-start gap-2">
                    <MessageSquareQuote className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium text-muted-foreground">Transcript Evidence</p>
                        {(r.audio_timestamp_start > 0 || r.audio_timestamp_end > 0) && (
                          <button
                            onClick={() => audioSrc && seekTo(r.audio_timestamp_start)}
                            className={`inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded ${
                              audioSrc
                                ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                                : "bg-muted text-muted-foreground"
                            }`}
                            title={audioSrc ? "Click to play from this timestamp" : "Timestamp"}
                          >
                            <Clock className="h-3 w-3" />
                            {formatTime(r.audio_timestamp_start)} – {formatTime(r.audio_timestamp_end)}
                            {audioSrc && <Play className="h-2.5 w-2.5" />}
                          </button>
                        )}
                        {r.transcript_utterance_index >= 0 && (
                          <span className="text-xs text-muted-foreground">
                            Utterance #{r.transcript_utterance_index}
                          </span>
                        )}
                      </div>
                      <p className="text-sm italic bg-background/80 dark:bg-background/40 rounded px-3 py-2 border border-border">
                        &ldquo;{r.evidence_text}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>

                {/* Row 4: AI Reasoning — the WHY */}
                <div className={`rounded px-3 py-2 text-sm ${
                  isFail
                    ? "bg-red-100/60 dark:bg-red-900/20 text-red-900 dark:text-red-300"
                    : isPass
                      ? "bg-green-100/60 dark:bg-green-900/20 text-green-900 dark:text-green-300"
                      : "bg-yellow-100/60 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-300"
                }`}>
                  <span className="font-semibold">
                    {isFail ? "Why it failed: " : isPass ? "Why it passed: " : "Note: "}
                  </span>
                  {r.reasoning}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transcript Viewer */}
      {transcript && (
        <Card>
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
            <p className="text-sm text-muted-foreground">
              {transcript.word_count} words &middot;{" "}
              {transcript.speaker_count} speakers
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {transcript.utterances.map((utt) => (
                <div
                  key={utt.index}
                  className="flex gap-3"
                  id={`utt-${utt.index}`}
                >
                  <div className="flex-shrink-0 w-24 text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        utt.speaker === 0
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                      }`}
                    >
                      {utt.speaker_label}
                    </span>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {audioSrc ? (
                        <button
                          onClick={() => seekTo(utt.start)}
                          className="hover:text-primary cursor-pointer"
                        >
                          {formatTime(utt.start)}
                        </button>
                      ) : (
                        formatTime(utt.start)
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed">{utt.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CRM Data */}
      {lead.crm_data && (
        <Card>
          <CardHeader>
            <CardTitle>CRM Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(lead.crm_data).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-sm text-muted-foreground">
                    {key
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </dt>
                  <dd className="text-sm font-medium">{String(value)}</dd>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
