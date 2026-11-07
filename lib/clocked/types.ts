/**
 * Request and response types for the Clocked endpoints FixProof uses.
 * Shapes follow the reference pages at https://clocked.rezolve.ai/docs
 * (copies in the planning workspace, read 2026-11-08). Diagnostic keys the
 * docs call optional are typed optional; FixProof never requires them.
 */

export type Endpoint =
  | "decide"
  | "extract"
  | "fill"
  | "pii"
  | "injection"
  | "script"
  | "grounding"
  | "compare"
  | "rerank"
  | "pipeline";

export const ENDPOINTS: readonly Endpoint[] = [
  "decide",
  "extract",
  "fill",
  "pii",
  "injection",
  "script",
  "grounding",
  "compare",
  "rerank",
  "pipeline",
] as const;

/** Product names shown in the UI (Clocked's own names for each endpoint). */
export const ENDPOINT_LABEL: Record<Endpoint, string> = {
  decide: "Decide",
  extract: "Extract",
  fill: "Fill",
  pii: "Protect",
  injection: "Guard",
  script: "Inspect",
  grounding: "Verify",
  compare: "Compare",
  rerank: "Rerank",
  pipeline: "Pipeline",
};

export type Probabilities = Record<string, number>;

/** Character span. start is zero-based, end exclusive, counted in Unicode code points. */
export interface Span {
  start: number;
  end: number;
}

/* ----------------------------------------------------------------- Decide */

export type DecideQuestion =
  | { type: "noul"; instructions?: string; criteria?: { true: string; false: string }; threshold?: number; document?: string }
  | { type: "choice"; instructions?: string; criteria: Record<string, string>; document?: string }
  | { type: "multiselect"; instructions?: string; criteria?: Record<string, string>; options?: string[]; threshold?: number; document?: string }
  | { type: "score"; instructions?: string; criteria: string[]; document?: string };

export interface DecideRequest {
  state?: string | Record<string, unknown> | unknown[];
  questions: Record<string, DecideQuestion>;
  instructions?: string;
  calibration_temperature?: number;
  rotations?: number;
  documents?: { id: string; text: string }[];
}

export type DecideAnswer =
  | { type: "noul"; noul: number; decision?: boolean; threshold?: number }
  | { type: "choice"; choice: string; probabilities: Probabilities; confidence: number }
  | { type: "multiselect"; selected: string[]; probabilities: Probabilities; threshold: number }
  | { type: "score"; score: number; legend: Record<string, string>; probabilities: Probabilities; confidence: number };

export interface DecideResponse {
  model: string;
  answers: Record<string, DecideAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/* ---------------------------------------------------------------- Extract */

export type ExtractFormat = "text" | "integer" | "number" | "date" | "email" | "phone" | "url" | "code";

export interface ExtractField {
  description?: string;
  list?: boolean;
  max_items?: number;
  format?: ExtractFormat;
  normalize?: string | Record<string, unknown>;
}

export interface ExtractRequest {
  text: string;
  fields: Record<string, string | ExtractField>;
  instructions?: string;
}

export interface SourceRead {
  value: string | null;
  start?: number;
  end?: number;
  confidence?: number;
  normalized?: unknown;
}

export interface ExtractedField {
  value: string | string[] | null;
  start?: number;
  end?: number;
  confidence?: number;
  items?: SourceRead[];
  normalized?: unknown;
}

export interface ExtractResponse {
  model: string;
  fields: Record<string, ExtractedField>;
  timing?: Record<string, unknown>;
}

/* ------------------------------------------------------------------- Fill */

export type FillField =
  | { type: "extract"; description?: string; infer?: boolean; list?: boolean; max_items?: number; format?: ExtractFormat; region?: [number, number] }
  | { type: "choice"; description?: string; options: string[]; allow_none?: boolean }
  | { type: "multiselect"; description?: string; options: string[]; threshold?: number }
  | { type: "score"; description?: string; levels: string[] }
  | { type: "yes_no"; description?: string }
  | { type: "generate"; description?: string; format?: "text" | "date" | "number"; max_tokens?: number };

export interface FillRequest {
  text: string;
  fields: Record<string, FillField>;
  instructions?: string;
  reference_date?: string;
}

export interface FilledField {
  value: string | number | boolean | string[] | null;
  confidence?: number;
  probabilities?: Probabilities;
  expected?: number;
  threshold?: number;
  start?: number;
  end?: number;
  source?: "generated" | string;
}

export interface FillResponse {
  model: string;
  fields: Record<string, FilledField>;
  timing?: Record<string, unknown>;
}

/* ------------------------------------------------------- Protect (pii) */

export type PiiOperator = "replace" | "mask" | "hash" | "redact";

export interface PiiRequest {
  text: string;
  entities?: string[] | Record<string, string | null | { description: string; format?: string }>;
  instructions?: string;
  threshold?: number;
  max_items?: number;
  allow?: string[];
  deny?: string[] | Record<string, string>;
  anonymize?: PiiOperator | Record<string, PiiOperator>;
  mask_keep?: number;
}

export interface PiiEntity extends Span {
  type: string;
  value: string;
  confidence: number;
  source: string;
  mentions?: number;
}

export interface PiiResponse {
  model: string;
  entities: PiiEntity[];
  counts: Record<string, number>;
  anonymized_text?: string;
  threshold: number;
  instructions_used: string;
  timing?: Record<string, unknown>;
}

/* -------------------------------------------------- Guard (injection) */

export interface InjectionRequest {
  text: string;
  source?: "user" | "content";
  instructions?: string;
  categories?: string[];
  threshold?: number;
  evidence?: boolean;
}

export interface InjectionEvidence extends Span {
  quote: string;
  confidence: number;
  without?: number;
}

export interface InjectionResponse {
  model: string;
  injection: number;
  verdict: string;
  threshold: number;
  source: "user" | "content";
  instructions_used: string;
  category: string;
  categories: Probabilities;
  severity?: string;
  severity_expected?: number;
  severities?: Probabilities;
  evidence?: InjectionEvidence[];
  residual?: number;
  residual_verdict?: string;
  timing?: Record<string, unknown>;
}

/* ---------------------------------------------------- Inspect (script) */

export interface ScriptRequest {
  script: string;
  instructions?: string;
  categories?: string[] | null;
  threshold?: number;
  evidence?: boolean;
  rotations?: number | null;
}

export interface ScriptEvidence extends Span {
  line: string;
  confidence: number;
}

export interface ScriptResponse {
  model: string;
  malicious: number;
  suspicious: number;
  verdict: string;
  threshold: number;
  instructions_used: string;
  category: string;
  categories: Probabilities;
  severity?: string;
  severity_expected?: number;
  severities?: Probabilities;
  evidence?: ScriptEvidence[];
  timing?: Record<string, unknown>;
}

/* ------------------------------------------------ Verify (grounding) */

export interface SourceDoc {
  id: string;
  text: string;
}

export interface GroundingRequest {
  documents: (string | SourceDoc)[];
  answer: string;
  question?: string;
  claims?: string[];
  instructions?: string;
  threshold?: number;
  evidence?: "all" | "flagged" | "none";
  rotations?: number;
}

export interface DocPassage extends Span {
  /** null observed live when the quote is a "Document <id>:" header. */
  document: string | null;
  quote: string;
  confidence: number;
}

export type ClaimVerdict = "supported" | "contradicted" | "not_stated" | "not_a_claim";

export interface GroundingClaim {
  claim: string;
  kind: string;
  counted: boolean;
  weight: number;
  supported: number;
  contradicted: number;
  not_stated: number;
  not_a_claim: number;
  verdict: ClaimVerdict | string;
  sources?: Probabilities;
  source?: string | null;
  evidence?: DocPassage;
}

export interface GroundingResponse {
  model: string;
  grounded: number;
  ungrounded: number;
  verdict: string;
  threshold: number;
  instructions_used: string;
  documents: { id: string; share: number; share_of_answer: number; claims: number[] }[];
  claims: GroundingClaim[];
  unsupported_claims?: number[];
  not_claims?: number[];
  weakest_claim?: { index: number; supported: number } | null;
  answers_question?: number;
  timing?: Record<string, unknown>;
}

/* ---------------------------------------------------------------- Compare */

export interface CompareRequest {
  documents: (string | SourceDoc)[];
  instructions?: string;
  threshold?: number;
  evidence?: "all" | "flagged" | "none";
  kinds?: boolean;
  rotations?: number;
}

export interface CompareFinding {
  kind?: string;
  kinds?: Probabilities;
  confidence?: number;
  a: DocPassage;
  b: DocPassage;
}

export type PairRelation = "same" | "overlapping" | "conflicting" | "unrelated";

export interface ComparePair {
  a: string;
  b: string;
  relation: PairRelation | string;
  related: number;
  probabilities: Probabilities;
  duplicates: CompareFinding[];
  conflicts: CompareFinding[];
}

export interface CompareResponse {
  model: string;
  verdict: string;
  threshold: number;
  instructions_used: string;
  evidence: string;
  documents: { id: string; duplicates: string[]; overlaps: string[]; conflicts: string[] }[];
  pairs: ComparePair[];
  duplicates: number[];
  overlaps: number[];
  conflicts: number[];
  related_pairs: number[];
  timing?: Record<string, unknown>;
}

/* ----------------------------------------------------------------- Rerank */

export interface RerankDocument {
  text: string;
  id?: string;
  title?: string;
  metadata?: Record<string, string | number>;
}

export interface RerankRequest {
  query: string;
  documents: (string | RerankDocument)[];
  context?: string | Record<string, unknown> | unknown[];
  conversation?: { role: "user" | "assistant"; content: string }[];
  instructions?: string;
  top_n?: number;
  questions?: Record<string, DecideQuestion>;
  calibration_temperature?: number;
}

export type RerankAction = "use" | "expand" | "skip";
export type RerankReason = "different_case" | "unrelated" | "already_given";

export interface RerankResult {
  index: number;
  id?: string;
  action: RerankAction;
  reason?: RerankReason;
  relevance_score: number;
  document_score: number;
  levels: Probabilities;
}

export interface RerankResponse {
  model: string;
  results: RerankResult[];
  answers?: Record<string, DecideAnswer>;
  usage?: { input_tokens?: number };
  timing?: Record<string, unknown>;
}

/* --------------------------------------------------------------- Pipeline */

export type PipelineStepBody =
  | { decide: Omit<DecideRequest, "state"> | Record<string, never> | null }
  | { extract: Omit<ExtractRequest, "text"> | Record<string, never> | null }
  | { fill: Omit<FillRequest, "text"> | Record<string, never> | null }
  | { pii: Omit<PiiRequest, "text"> | Record<string, never> | null }
  | { injection: Omit<InjectionRequest, "text"> | Record<string, never> | null }
  | { script: Omit<ScriptRequest, "script"> | Record<string, never> | null }
  | { grounding: GroundingRequest }
  | { compare: CompareRequest }
  | { rerank: RerankRequest };

export type PipelineStep = PipelineStepBody & { stop?: boolean; name?: string };

export interface PipelineRequest {
  text?: string;
  steps: PipelineStep[];
  on_error?: "continue" | "stop";
}

export interface PipelineStepResult {
  step: number;
  endpoint: Exclude<Endpoint, "pipeline">;
  name?: string;
  status: number | null;
  ms?: number;
  result?: unknown;
  error?: unknown;
  skipped?: string;
}

export interface PipelineResponse {
  model: string;
  steps: PipelineStepResult[];
  stopped: { step: number; endpoint: string; reason: "flagged" | "error" } | null;
  timing?: { total_ms?: number; model_ms?: number };
}

/* ------------------------------------------------------- endpoint maps */

export interface RequestMap {
  decide: DecideRequest;
  extract: ExtractRequest;
  fill: FillRequest;
  pii: PiiRequest;
  injection: InjectionRequest;
  script: ScriptRequest;
  grounding: GroundingRequest;
  compare: CompareRequest;
  rerank: RerankRequest;
  pipeline: PipelineRequest;
}

export interface ResponseMap {
  decide: DecideResponse;
  extract: ExtractResponse;
  fill: FillResponse;
  pii: PiiResponse;
  injection: InjectionResponse;
  script: ScriptResponse;
  grounding: GroundingResponse;
  compare: CompareResponse;
  rerank: RerankResponse;
  pipeline: PipelineResponse;
}

/** Usage and transport facts for one logical call, read from the X-Clocked-* headers. */
export interface ClockedMeta {
  endpoint: Endpoint;
  /** Logical step name in the FixProof run, e.g. "screen" or "rerank:expand". */
  step: string;
  /** First 8 characters only; the full key never leaves the server. */
  idempotencyKeyPrefix: string;
  status: number;
  attempts: number;
  credits: number | null;
  modelMs: number | null;
  costUsd: number | null;
  costBasis: string | null;
  transport: string | null;
  roundTripMs: number;
  /** true when the answer came from a FixProof fixture, not the network. */
  replay: boolean;
  /** true when that fixture was built from the documented shape rather than recorded live. */
  synthetic: boolean;
  recordedAt: string | null;
}

export interface ClockedResult<E extends Endpoint> {
  data: ResponseMap[E];
  meta: ClockedMeta;
}
