"use client";

import { ChevronDown, FlaskConical } from "lucide-react";
import { useId, useState } from "react";
import naiveData from "@/data/naive-presets.json";
import { cn } from "@/lib/utils";
import { Chip, Eyebrow, Panel } from "./primitives";

interface NaiveSentence {
  text: string;
  verdict: string;
  supported: number;
}
interface NaivePreset {
  reply: string;
  sentences: NaiveSentence[];
  sources: { id: string; title: string; section: string }[];
  script: { articleId: string; lang: string; code: string; blockedByInspect: boolean | null } | null;
  wrongSetup: string[];
  injectionPassed: boolean;
  personalData: number;
  problems: string[];
  credits: number;
}

const PRESETS = (naiveData as { presets: Record<string, NaivePreset> }).presets;

const VERDICT: Record<string, { label: string; bad: boolean }> = {
  supported: { label: "Supported", bad: false },
  not_a_claim: { label: "Framing", bad: false },
  not_stated: { label: "Not in the KB", bad: true },
  contradicted: { label: "Contradicted", bad: true },
};

/** Plain-language list of what the naive bot got wrong on this ticket, from recorded Clocked verdicts only. */
export function naiveProblems(n: NaivePreset): string[] {
  const out: string[] = [];
  const unsupported = n.sentences.filter((s) => VERDICT[s.verdict]?.bad ?? true).length;
  if (unsupported) out.push(`${unsupported} of ${n.sentences.length} sentences are not backed by any passage that applies to this employee (Verify).`);
  if (n.script?.blockedByInspect) out.push("It pasted a fix script that Inspect blocks: one line turns off antivirus.");
  for (const id of n.wrongSetup) {
    const t = n.sources.find((s) => s.id.startsWith(`${id}#`))?.title ?? id;
    out.push(`It drafted from “${t}”, which Rerank marks as written for a different setup.`);
  }
  if (n.injectionPassed) out.push("The injected instruction in the ticket went straight to the model (no Guard).");
  if (n.personalData) out.push(`${n.personalData} personal-data item${n.personalData === 1 ? "" : "s"} went to the model and logs unmasked (no Protect).`);
  return out;
}

/**
 * "Without FixProof": what a simulated naive Tier-0 bot (top 3 keyword
 * passages, no checks, one draft) would have sent for this preset, judged by
 * the same Verify call against the passages FixProof kept. Collapsed by default
 * under the outcome; only presets have a recording.
 */
export function NaiveCard({ scenarioId }: { scenarioId: string | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const n = scenarioId ? PRESETS[scenarioId] : undefined;
  if (!n) return null;
  const problems = naiveProblems(n);
  const summary = problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"} FixProof caught` : "No problem flagged on this ticket";
  return (
    <Panel aria-labelledby={`${id}-h`} className="px-5 py-4 sm:px-7" data-naive-card={scenarioId}>
      <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <Eyebrow as="span" className="flex items-center gap-1.5 text-violet">
            <FlaskConical aria-hidden className="size-3.5" /> Without FixProof · simulated naive bot, not FixProof
          </Eyebrow>
          <span id={`${id}-h`} className="mt-1 block text-[17px] font-medium leading-6 tracking-[-0.01em]">
            What an unchecked help-desk bot would have sent
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Chip tone={problems.length ? "risk" : "neutral"}>{summary}</Chip>
          <ChevronDown aria-hidden className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div id={`${id}-body`} className="fp-row-in mt-3">
          {problems.length ? (
            <ul className="flex flex-col gap-1.5 text-[14px] leading-5 text-risk">
              {problems.map((p) => (
                <li key={p} className="rounded-[14px] bg-risk-wash px-3 py-2">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
          <Eyebrow className="mt-4">Its reply, sentence by sentence (judged by Verify)</Eyebrow>
          <ul className="mt-2 flex flex-col gap-1.5" aria-label="Naive reply, sentence by sentence">
            {n.sentences.map((s, i) => {
              const v = VERDICT[s.verdict] ?? { label: "Not in the KB", bad: true };
              return (
                <li key={i} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[14px] border px-3 py-2", v.bad ? "border-risk-soft bg-risk-wash" : "border-hairline bg-card")}>
                  <span className={cn("whitespace-pre-wrap break-words text-[14px] leading-5", v.bad && "line-through decoration-risk/60")}>{s.text}</span>
                  <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium", v.bad ? "bg-risk-soft text-risk" : "bg-ok-soft text-ok")}>{v.label}</span>
                </li>
              );
            })}
          </ul>
          {n.script ? (
            <>
              <Eyebrow className="mt-4">The script it showed as-is{n.script.blockedByInspect ? " (Inspect blocks it)" : ""}</Eyebrow>
              <pre className="mt-2 overflow-x-auto rounded-[14px] bg-foreground p-3 font-mono text-[12.5px] leading-5 text-[#dfe7e7]">
                {n.script.code.split("\n").map((l, i) => (
                  <span key={i} className={cn("block", /DisableRealtimeMonitoring|Set-MpPreference/.test(l) && "bg-risk/40 text-white")}>
                    {l || " "}
                  </span>
                ))}
              </pre>
            </>
          ) : null}
          <p className="mt-3 text-[13px] text-muted-foreground">
            Drafted from the top 3 keyword matches ({n.sources.map((s) => s.title).join(" · ")}). Recorded live with the eval; {n.credits} credits. Same ticket, same judge as FixProof.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
