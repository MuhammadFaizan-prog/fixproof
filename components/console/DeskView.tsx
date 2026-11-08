"use client";

import { ChevronDown, ClipboardCheck, PencilLine, Send, ShieldCheck, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublicResult } from "@/lib/agent/triage";
import type { ProvenClaim } from "@/lib/agent/steps/prove";
import { ASSIGNMENT_GROUPS } from "@/lib/agent/steps/handoff";
import { cn } from "@/lib/utils";
import { RECORDED_EDITS, scriptedEdit } from "@/data/hitl";
import { Eyebrow, Panel } from "./primitives";
import { verdictWord } from "./plain";

export interface AuditEntry {
  at: string;
  action: string;
}

interface Recheck {
  claims: ProvenClaim[];
  unsupported: number;
  credits: number;
  mode: "replay" | "live";
  text: string;
}

/**
 * The technician's side of the outcome. Every control here is advisory: it
 * changes what FixProof would send or who owns the ticket in this session,
 * and nothing is executed or granted. Edits are re-verified by Verify before
 * Approve & send unlocks; a team change needs a reason; every action lands in
 * the audit log (action names only, never ticket text).
 */
export function DeskView({ result, scenarioId, audit, onAudit }: { result: PublicResult; scenarioId: string | null; audit: AuditEntry[]; onAudit: (action: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const original = result.reply ?? "";
  const [text, setText] = useState(original);
  const [check, setCheck] = useState<Recheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState("");
  const [sent, setSent] = useState(false);
  const currentTeam = result.handoff?.assignmentGroup ?? "Service Desk";
  const [team, setTeam] = useState(currentTeam);
  const [teamPick, setTeamPick] = useState(currentTeam);
  const [teamReason, setTeamReason] = useState("");
  const recorded = scenarioId ? RECORDED_EDITS[scenarioId] : undefined;

  const edited = text.trim() !== original.trim();
  const verifiedThis = check !== null && check.text === text.trim();
  const blocked = edited && (!verifiedThis || (check!.unsupported > 0 && !override.trim()));
  const sendNote = !edited
    ? "The reply is the one Verify already checked."
    : !verifiedThis
      ? "Re-verify the edit before it can be sent."
      : check!.unsupported > 0
        ? override.trim()
          ? "Sending with an override; the reason is logged."
          : `${check!.unsupported} sentence${check!.unsupported === 1 ? " is" : "s are"} not backed by the knowledge base. Remove ${check!.unsupported === 1 ? "it" : "them"} or give a reason to override.`
        : "Every sentence of the edit is backed by the knowledge base.";

  const recheck = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recheck", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: scenarioId ?? undefined, reply: value }) });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? "Re-verify failed. Nothing was sent.");
        onAudit("Re-verify failed; send stays blocked");
        return;
      }
      setCheck({ claims: body.claims, unsupported: body.unsupported, credits: body.credits, mode: body.mode, text: value.trim() });
      onAudit(`Edit re-verified by Verify (${body.unsupported ? `${body.unsupported} not backed` : "all backed"}, ${body.mode === "replay" ? "recorded" : `${body.credits} credits`})`);
    } catch {
      setError("Could not reach FixProof. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  };

  const conf = result.handoff?.assignmentConfidence;
  const teamOk = teamPick !== team && teamReason.trim().length > 0;
  const fixAllowed = Boolean(result.outcome.runFix);
  const fixWhy = result.fixGate?.ran ? (fixAllowed ? "Inspect cleared the script for this laptop's approved scope." : "Inspect did not clear the script, so it cannot be approved.") : "No fix script in the sources.";
  const preview = useMemo(() => (verifiedThis ? check!.claims : null), [verifiedThis, check]);

  return (
    <Panel aria-labelledby={`${id}-h`} className="px-5 py-4 sm:px-7" data-desk-view>
      <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left" data-desk-toggle>
        <span className="min-w-0">
          <Eyebrow as="span" className="flex items-center gap-1.5 text-primary">
            <ClipboardCheck aria-hidden className="size-3.5" /> Desk view · for the technician
          </Eyebrow>
          <span id={`${id}-h`} className="mt-1 block text-[17px] font-medium leading-6 tracking-[-0.01em]">
            Approve, edit and re-verify, or change the team
          </span>
        </span>
        <span className="flex items-center gap-2">
          {audit.length ? <span className="tabular text-[13px] text-muted-foreground">{audit.length} logged</span> : null}
          <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
      <div id={`${id}-body`} className="fp-row-in">

      {original ? (
        <>
          <label htmlFor={`${id}-reply`} className="mt-4 block text-[14px] font-medium">
            Reply to send (edit it and Verify checks it again)
          </label>
          <textarea
            id={`${id}-reply`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSent(false);
            }}
            rows={Math.min(8, Math.max(3, text.split("\n").length + 1))}
            className="mt-1.5 w-full rounded-[18px] border border-hairline bg-card px-4 py-3 text-[15px] leading-[22px] focus-visible:outline-2 focus-visible:outline-ring"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-11 rounded-full border-hairline bg-card px-4 text-[15px]" disabled={!edited || busy || verifiedThis} onClick={() => recheck(text)}>
              <PencilLine aria-hidden /> {busy ? "Verifying…" : "Re-verify edit"}
            </Button>
            {recorded ? (
              <Button
                variant="outline"
                className="h-11 rounded-full border-hairline bg-card px-4 text-[15px]"
                disabled={busy}
                onClick={() => {
                  const v = scriptedEdit(original, recorded.sentence);
                  setText(v);
                  setSent(false);
                  onAudit("Technician edited the reply");
                  void recheck(v);
                }}
              >
                Try the recorded edit: {recorded.label.toLowerCase()}
              </Button>
            ) : null}
            {edited ? (
              <button type="button" className="h-11 rounded-full px-3 text-[14px] text-muted-foreground underline" onClick={() => setText(original)}>
                Undo edit
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mt-2 rounded-[14px] bg-risk-wash px-3 py-2 text-[14px] text-risk">
              {error}
            </p>
          ) : null}
          {preview ? (
            <ul className="mt-3 flex flex-col gap-1.5" aria-label="Edited reply, re-verified sentence by sentence" data-recheck>
              {preview.map((c, i) => (
                <li key={i} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[14px] border px-3 py-2", c.kept ? "border-hairline bg-card" : "border-risk-soft bg-risk-wash")} data-kept={c.kept}>
                  <span className={cn("text-[14px] leading-5", !c.kept && "line-through decoration-risk/60")}>{c.text}</span>
                  <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium", c.kept ? "bg-ok-soft text-ok" : "bg-risk-soft text-risk")}>{verdictWord(c.verdict)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {verifiedThis && check!.unsupported > 0 ? (
            <div className="mt-3">
              <label htmlFor={`${id}-override`} className="block text-[14px] font-medium">
                Override reason (required to send unverified sentences)
              </label>
              <input id={`${id}-override`} value={override} onChange={(e) => setOverride(e.target.value)} className="mt-1.5 h-11 w-full rounded-full border border-hairline bg-card px-4 text-[15px]" />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              className="h-11 rounded-full px-5 text-[15px]"
              disabled={blocked || sent}
              onClick={() => {
                setSent(true);
                onAudit(edited ? (override.trim() ? "Approved & sent with an override reason" : "Approved & sent the re-verified edit") : "Approved & sent the verified reply");
              }}
            >
              <Send aria-hidden /> {sent ? "Sent (simulated)" : "Approve & send"}
            </Button>
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {sendNote}
            </p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[14px] text-muted-foreground">No reply was drafted for this ticket, so there is nothing to approve.</p>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <fieldset className="rounded-[18px] border border-hairline bg-card px-4 py-3">
          <legend className="flex items-center gap-1.5 px-1 text-[14px] font-medium">
            <Users aria-hidden className="size-4" /> Owning team
          </legend>
          <p className="text-[13px] text-muted-foreground">
            Now: <span className="font-medium text-foreground">{team}</span>
            {team === currentTeam && conf != null ? ` · Fill's confidence ${Math.round(conf * 100)}%` : team !== currentTeam ? " · changed by a technician" : ""}
          </p>
          <label htmlFor={`${id}-team`} className="mt-2 block text-[13px]">
            Change team to
          </label>
          <select id={`${id}-team`} value={teamPick} onChange={(e) => setTeamPick(e.target.value)} className="mt-1 h-11 w-full rounded-full border border-hairline bg-card px-3 text-[15px]">
            {ASSIGNMENT_GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <label htmlFor={`${id}-team-reason`} className="mt-2 block text-[13px]">
            Reason (required)
          </label>
          <input id={`${id}-team-reason`} value={teamReason} onChange={(e) => setTeamReason(e.target.value)} className="mt-1 h-11 w-full rounded-full border border-hairline bg-card px-4 text-[15px]" />
          <Button
            variant="outline"
            className="mt-2 h-11 rounded-full border-hairline bg-card px-4 text-[15px]"
            disabled={!teamOk}
            onClick={() => {
              onAudit(`Team changed ${team} → ${teamPick} (reason given)`);
              setTeam(teamPick);
              setTeamReason("");
            }}
          >
            Change team
          </Button>
        </fieldset>
        <div className="rounded-[18px] border border-hairline bg-card px-4 py-3">
          <p className="flex items-center gap-1.5 text-[14px] font-medium">
            <ShieldCheck aria-hidden className="size-4" /> Fix script
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">{fixWhy}</p>
          <Button variant="outline" className="mt-2 h-11 rounded-full border-hairline bg-card px-4 text-[15px]" disabled={!fixAllowed} onClick={() => onAudit("Approved the simulated script run (nothing executes)")}>
            Approve simulated run
          </Button>
          <p className="mt-2 text-[12px] text-muted-foreground">FixProof never runs scripts and never grants access; runs are simulated.</p>
        </div>
      </div>

      <div className="mt-4">
        <Eyebrow>Audit log · this session</Eyebrow>
        {audit.length ? (
          <ol className="mt-1.5 flex flex-col gap-1 text-[13px]" data-audit-log>
            {audit.map((a, i) => (
              <li key={i} className="tabular text-muted-foreground">
                <span className="text-foreground">{a.at}</span> · {a.action}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-[13px] text-muted-foreground">No technician action yet.</p>
        )}
      </div>
      </div>
      ) : null}
    </Panel>
  );
}
