// interest.classifier.ts
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { INTEREST_SCHEMA } from '@server/api/message-queue/reply/interest.schema';
import { LeadActionEnum, LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';

export type InterestResult = {
  interested: boolean;
  intent: keyof typeof LeadIntentEnum;
  reason: string;
  confidence: number; // 0..1
  suggestedReply: string;
  action?: keyof typeof LeadActionEnum;
  followUpAt?: string; // ISO date-time with numeric offset
  department: LeadDepartmentEnum;
};

export type Role = 'LEAD' | 'YOU';
export type LeadReplyItem = { from: Role; text: string; at?: string };

/* -------------------------- STRICT SYSTEM PROMPT -------------------------- */
const SYSTEM_PROMPT = `
You are a strict classifier for sales outreach replies.
Return ONLY the function result (JSON). No extra text. No markdown.

INPUT FORMAT (user content is a single JSON object):
{
  "LOCALE_HINT": string,
  "TIMEZONE": string,
  "REFERENCE_TIME_ISO": string,
  "OUTREACH": string,
  "CONVERSATION": [{ "from": "LEAD" | "YOU", "text": string, "at": string? }]
}

LANGUAGE ENFORCEMENT (CRITICAL):
- All natural-language fields MUST be exactly in LOCALE_HINT. This includes "reason" and "suggestedReply".
- If LOCALE_HINT starts with "he" (e.g., "he-IL"): write in Hebrew script only, no English words except proper nouns/URLs. Digits are allowed.
- If any word is not in LOCALE_HINT, fix it and output corrected JSON.
- "followUpAt" is an ISO datetime (not natural language).

DEPARTMENT CLASSIFICATION (DETERMINISTIC):
... (unchanged) ...

EXAMPLES:
- YOU: "הלוואה דיגיטלית בתנאים מיוחדים" → department="GENERAL"
- YOU: "הלוואת משכנתא לרכישת דירה" → department="MORTGAGE"
- LEAD: "הלוואה לרכב" → department="CAR"

YOUR TASK:
- Consider the whole CONVERSATION for interest/intent and department classification.
- If LEAD suggests timing, set action=SCHEDULE_FOLLOW_UP and compute followUpAt.

STYLE FOR suggestedReply:
- Formal, concise, third-person/corporate (e.g., "נציגינו ייצרו קשר...", "פנייתך התקבלה...").
- No first-person singular, no emojis, no slang, no promises.

TIME & SCHEDULING:
- Use REFERENCE_TIME_ISO and TIMEZONE to resolve relative phrases.
- Vague times mapping: morning=09:00, noon=12:00, afternoon=15:00, evening=18:00, night=20:00 (TIMEZONE).
- Always output a FUTURE datetime; if past, roll forward.
- Output followUpAt with numeric offset (e.g., 2025-09-03T09:00:00+03:00).

DECISION RULES:
- interested=true for clear positive signals (requests for info/demo/callback).
- interested=false for declines, unsubscribe, abuse, or out-of-scope.
- If unclear, intent="AMBIGUOUS" with a brief clarifying suggestedReply.

// NEW: SARCASM & ROLE-REVERSAL
- If the LEAD’s message is a role-reversal offering YOU the same product/service you offered (e.g., "אני יכולה לתת לך הלוואה"), treat this as sarcasm/irony indicating lack of interest.
- In such cases: interested=false; intent="DECLINE".
- The suggestedReply should remain polite and neutral-corporate (third-person), e.g.:
  "התקבלה תשובתך. במידה ותהיה מעוניין/ת בעתיד, נשמח לסייע."
`.trim();

/* -------------------- DETERMINISTIC DEPARTMENT POST-GUARD -------------------- */
/**
 * We still hard-guard the department locally to avoid LLM drift.
 * Rule: scan ALL messages from newest to oldest (both YOU and LEAD).
 * - If a message is CAR → CAR
 * - Else if a message matches MORTGAGE rule → MORTGAGE
 * - Else GENERAL
 */
const CAR_PATTERNS = [
  /(?:^|\W)car(?:$|\W)|auto(?!\w)|vehicle|automobile/i,
  /רכב/i,
  /машин/i, // Russian stems
  /voiture/i,
  /coche/i,
  /سيارة/i,
  /자동차/i,
  /🚗/,
];

const MORTGAGE_KEYWORDS = [
  /mortgage/i,
  /mortage/i,
  /משכנת[אה]/i,
  /ипотек/i,
  /hipotec/i, // es/pt stems
  /hypoth[eè]que/i,
  /رهن\s?عقاري/i,
  /房屋贷款|房贷/,
  /home\s*loan/i,
];

const HOME_TOKENS = [/בית|דירה|נכס/i, /home|house|property|real\s*estate/i, /🏠/];

const LOAN_TOKENS = /\b(loan|credit|financ\w+|הלווא[הות]?|אשראי)\b/i;

function isCar(text: string): boolean {
  return CAR_PATTERNS.some((r) => r.test(text));
}

/** Mortgage only if a mortgage word exists OR (home token AND loan token) exist in the SAME text */
function isMortgage(text: string): boolean {
  if (MORTGAGE_KEYWORDS.some((r) => r.test(text))) return true;
  return HOME_TOKENS.some((r) => r.test(text)) && LOAN_TOKENS.test(text);
}

function inferDepartmentFromAllMessages(conversation: LeadReplyItem[]): LeadDepartmentEnum {
  if (conversation.length === 0) return LeadDepartmentEnum.GENERAL;

  // Scan all messages from newest to oldest
  for (let i = conversation.length - 1; i >= 0; i--) {
    const t = conversation[i]?.text ?? '';
    if (isCar(t)) return LeadDepartmentEnum.CAR;
    if (isMortgage(t)) return LeadDepartmentEnum.MORTGAGE;
  }
  return LeadDepartmentEnum.GENERAL;
}

/* ------------------------------- MAIN FUNCTION ------------------------------- */
export async function classifyInterest(
  openai: OpenAiService,
  params: {
    outreachText: string;
    leadReplies: LeadReplyItem[];
    localeHint?: string;
    timezone?: string;
    referenceTimeIso?: string;
  }
): Promise<InterestResult | null> {
  const { outreachText, leadReplies, localeHint = 'auto', timezone = 'UTC', referenceTimeIso = new Date().toISOString() } = params;

  const userPayload = {
    LOCALE_HINT: localeHint,
    TIMEZONE: timezone,
    REFERENCE_TIME_ISO: referenceTimeIso,
    OUTREACH: outreachText || '(empty)',
    CONVERSATION: leadReplies ?? [],
  };

  const messages = [openai.createSystemMessage(SYSTEM_PROMPT), openai.createUserMessage(JSON.stringify(userPayload))];

  const ai = await openai.requestWithJsonSchema<InterestResult>(messages, INTEREST_SCHEMA as any, {
    model: 'gpt-4o-mini',
    temperature: 0 as const,
    max_tokens: 300 as const,
  });

  if (!ai) return null;

  // Hard-guard department using ALL messages (latest precedence)
  const safeDept = inferDepartmentFromAllMessages(userPayload.CONVERSATION);
  return { ...ai, department: safeDept };
}
