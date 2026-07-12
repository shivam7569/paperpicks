/**
 * anthropic.ts — the Claude "judge": reads a paper's abstract and scores it.
 *
 * WHAT IT IS:   The model-scoring client. Wraps the Anthropic SDK to turn a
 *               paper (title/field/abstract) into structured relevance scores.
 * WHAT IT DOES: judgePaper({title, field, abstract}) → { importance 0–100,
 *               replicability 0–100, reason, badge }. Uses structured outputs
 *               (JudgeSchema via zodOutputFormat) so Claude returns validated
 *               JSON — no prompt-and-parse guesswork. judgeModelName() exposes
 *               the model id (MODELS.judge) for logging/attribution.
 * WORK WITH IT: import { judgePaper, judgeModelName } from './anthropic';
 *               called by the scoring/ingestion scripts to rate each paper.
 * BEHAVIORS:    Lazy singleton client; reads ANTHROPIC_API_KEY (throws if
 *               missing). thinking is DISABLED and max_tokens=1024 to keep the
 *               call cheap/fast/predictable. Scores clamped to 0–100, reason
 *               truncated to 300 chars, badge normalized against VALID_BADGES
 *               (else 'unclear'). Throws if no parsed_output comes back.
 * CHANGE IT:    Rubric/wording → edit JUDGE_PROMPT. Model → MODELS.judge in
 *               models.ts. Re-enable reasoning → thinking:{type:'enabled'}.
 *               Allowed badges → VALID_BADGES. Score/reason bounds → clamp()
 *               and the .slice(0,300) in judgePaper.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MODELS } from './models';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY in .env.local (see .env.example).');
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// The exact shape Claude must return. Structured outputs validates against this.
// Kept intentionally loose (numbers not forced to int, badge a plain string):
// structured outputs doesn't always pin a string enum, so we accept whatever
// comes back and normalize below — a stray value shouldn't fail a whole paper.
const JudgeSchema = z.object({
  importance: z.number(),
  replicability: z.number(),
  reason: z.string(),
  badge: z.string(),
});

const VALID_BADGES = ['code+data', 'code', 'method-only', 'unclear'];

export interface JudgeResult {
  importance: number; // 0–100
  replicability: number; // 0–100
  reason: string;
  badge: string;
}

const JUDGE_PROMPT = (title: string, field: string, abstract: string) =>
  `
You are an expert AI research reviewer. Judge this paper for a solo researcher who
follows LLMs, NLP, and computer vision and wants to read only genuinely important,
non-incremental work.

Title: ${title}
Field: ${field}
Abstract: ${abstract || '(no abstract available)'}

Rate two things from 0 to 100 (judge the ideas, not the writing quality):
- importance: how substantial and novel is the contribution? 100 = landmark / likely
  highly influential; ~50 = solid but incremental; <30 = minor or very niche.
- replicability: how reproducible does the described method sound for one person with
  modest resources? Consider method clarity, standard vs proprietary data, and compute
  scale. 100 = clear method + standard data + modest compute; low = needs massive
  proprietary infrastructure or is under-specified.

Also provide:
- reason: ONE concise sentence (max ~25 words) on why it matters (or why not).
- badge: best guess of reproducibility support — "code+data", "code", "method-only", or "unclear".
`.trim();

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function judgePaper(input: {
  title: string;
  field: string | null;
  abstract: string | null;
}): Promise<JudgeResult> {
  const res = await client().messages.parse({
    model: MODELS.judge,
    max_tokens: 1024,
    // Scoring an abstract is a simple call — disable thinking to keep it cheap,
    // fast, and predictable. (Sonnet 5 would otherwise run adaptive thinking.)
    thinking: { type: 'disabled' },
    messages: [
      {
        role: 'user',
        content: JUDGE_PROMPT(input.title, input.field ?? 'unknown', input.abstract ?? ''),
      },
    ],
    output_config: { format: zodOutputFormat(JudgeSchema) },
  });

  const parsed = res.parsed_output;
  if (!parsed) throw new Error('Judge returned no structured output');

  return {
    importance: clamp(parsed.importance),
    replicability: clamp(parsed.replicability),
    reason: parsed.reason.slice(0, 300),
    badge: VALID_BADGES.includes(parsed.badge) ? parsed.badge : 'unclear',
  };
}

export function judgeModelName(): string {
  return MODELS.judge;
}
