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
  department: LeadDepartmentEnum; // 🆕
};

export type Role = 'LEAD' | 'YOU';
export type LeadReplyItem = { from: Role; text: string; at?: string };

// === UPDATED SYSTEM PROMPT ===
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
- Inspect ONLY messages where from == "YOU" (ignore LEAD for this decision).
- If ANY of those messages refer to **car/automotive** context (any language/emoji/synonyms, e.g., "car", "auto", "vehicle", "רכב", "машина", "voiture", "coche", "سيارة", "automóvil", "자동차", "🚗"), set:
  department = "CAR_DEPARTMENT".
- ELSE if ANY of those messages refer to **mortgage/home-loan** context (any language/emoji/synonyms, including misspelling "mortage": "mortgage", "mortage", "משכנתא", "ипотека", "hipoteca", "hypothèque", "משכן", "رهن عقاري", "房屋贷款", "🏠💸"), set:
  department = "MORTAGE_DEPARTMENT".
- ELSE:
  department = "LOAN_DEPARTMENT".
- If both contexts appear in "YOU" messages, choose the context from the **most recent "YOU" message**.

YOUR TASK:
- Consider the whole CONVERSATION for interest/intent, but department must use only "YOU" messages.
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

Return only valid JSON matching the schema.
`.trim();

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

  return openai.requestWithJsonSchema<InterestResult>(messages, INTEREST_SCHEMA as any, {
    model: 'gpt-4o-mini',
    temperature: 0 as const,
    max_tokens: 300 as const,
  });
}
