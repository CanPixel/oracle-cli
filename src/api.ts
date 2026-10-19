// Typed wrappers around the Tauri commands in src-tauri/src/lib.rs.
import { Channel, invoke } from '@tauri-apps/api/core';

export type ModelKind = 'chat' | 'embedding' | 'reranker' | 'projector';

export interface ModelInfo {
  id: string;
  path: string;
  kind: ModelKind;
  arch: string;
  name: string | null;
  size_label: string | null;
  quant: string | null;
  size_bytes: number;
  context_length: number | null;
  has_chat_template: boolean;
}

export interface Status {
  models: ModelInfo[];
  loaded: string | null;
  rag: { embed_model: string | null; docs: number; ready: boolean };
  data_dir: string;
  default_persona: string;
}

export interface GenParams {
  temperature: number;
  top_k: number;
  top_p: number;
  min_p: number;
  repeat_penalty: number;
  max_tokens: number;
  seed: number;
  n_ctx: number;
}

export const DEFAULT_PARAMS: GenParams = {
  temperature: 0.7,
  top_k: 40,
  top_p: 0.95,
  min_p: 0.05,
  repeat_penalty: 1.1,
  max_tokens: 256,
  seed: 42,
  n_ctx: 4096,
};

export interface GenStats {
  model: string;
  load_ms: number | null;
  prompt_tokens: number;
  prompt_ms: number;
  ttft_ms: number;
  gen_tokens: number;
  gen_ms: number;
  prompt_tps: number;
  gen_tps: number;
  total_ms: number;
  stop_reason: 'eos' | 'length' | 'cancelled';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  persona: string;
  corruption: number;
  use_rag: boolean;
  history: ChatMessage[];
  prompt: string;
  params: GenParams;
}

export type ChatEvent = { event: 'lore'; docs: string[] } | { event: 'token'; text: string };

export interface Suite {
  name: string;
  cases: { id: string; category: string; prompt: string }[];
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface Judgement {
  in_character: number;
  instructions: number;
  quality: number;
  note: string;
}

export interface CaseResult {
  model: string;
  case_id: string;
  category: string;
  run: number;
  prompt: string;
  output: string;
  error: string | null;
  stats: GenStats;
  checks: CheckResult[];
  rule_score: number;
  judge: Judgement | null;
}

export interface ModelSummary {
  id: string;
  arch: string;
  quant: string | null;
  size_bytes: number;
  load_ms: number;
  avg_ttft_ms: number;
  avg_prompt_tps: number;
  avg_gen_tps: number;
  avg_gen_tokens: number;
  rule_score: number;
  by_category: Record<string, number>;
  judge_in_character: number | null;
  judge_instructions: number | null;
  judge_quality: number | null;
  errors: number;
}

export interface Report {
  id: string;
  created_at: number;
  suite: string;
  params: GenParams;
  use_rag: boolean;
  judge: string | null;
  summaries: ModelSummary[];
  results: CaseResult[];
}

export interface ReportMeta {
  id: string;
  created_at: number;
  suite: string;
  models: string[];
}

export interface BenchRequest {
  models: string[];
  judge: string | null;
  use_rag: boolean;
  repeats: number;
  params: GenParams;
  suite?: unknown;
}

export type Progress =
  | { event: 'started'; total: number }
  | { event: 'loading'; model: string }
  | { event: 'case_started'; model: string; case_id: string; run: number; index: number }
  | { event: 'token'; text: string }
  | { event: 'case_finished'; index: number; result: CaseResult }
  | { event: 'judging'; model: string; case_id: string; index: number }
  | { event: 'done'; report: Report };

function channel<T>(onEvent: (e: T) => void): Channel<T> {
  const ch = new Channel<T>();
  ch.onmessage = onEvent;
  return ch;
}

export const api = {
  status: () => invoke<Status>('status'),
  loadModel: (id: string) => invoke<number | null>('load_model', { id }),
  cancel: () => invoke<void>('cancel'),
  chat: (req: ChatRequest, onEvent: (e: ChatEvent) => void) =>
    invoke<{ text: string; stats: GenStats }>('chat', { req, onEvent: channel(onEvent) }),
  getSuite: () => invoke<Suite>('get_suite'),
  runBench: (req: BenchRequest, onEvent: (e: Progress) => void) =>
    invoke<Report>('run_bench', { req, onEvent: channel(onEvent) }),
  listReports: () => invoke<ReportMeta[]>('list_reports'),
  loadReport: (id: string) => invoke<Report>('load_report', { id }),
};

export const chatModels = (s: Status | null) => s?.models.filter(m => m.kind === 'chat') ?? [];

export const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
