// interest.classifier.ts
import { OpenAiService } from '@server/services/open-ai/open-ai.service';
import { LeadActionEnum, LeadDepartmentEnum, LeadIntentEnum } from '@server/api/message-queue/reply/interest.enum';
import type { JsonSchema } from '@server/services/open-ai/open-ai.types';

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
- MORTGAGE: If message contains "כנגד נכס" (against property) OR if message contains "שיעבוד" with property/real estate context
- CAR: If message contains "יש לך רכב" (you have a car) pattern OR if message contains "שיעבוד" with car/vehicle context
- GENERAL: If message contains "ללא צורך בערבויות ובטחונות" (no need for guarantees and securities) - only if not already classified as MORTGAGE or CAR
- GENERAL: For all other messages that don't match the above patterns

IMPORTANT: Messages containing "שיעבוד" (lien/collateral) CANNOT be GENERAL - they must be either CAR or MORTGAGE based on context.

EXAMPLES:
- YOU: "ללא צורך בערבויות ובטחונות" → department="GENERAL"
- YOU: "בדקת דרכנו הלוואה כנגד הנכס שלך" → department="MORTGAGE"
- YOU: "יש לך רכב משנת 2020, יש לך זכאות להלוואה" → department="CAR"
- YOU: "הלוואה עם שיעבוד על הנכס" → department="MORTGAGE"
- YOU: "הלוואה עם שיעבוד על הרכב" → department="CAR"
- YOU: "הלוואה של עד 100,000 ₪ על בסיס שעבוד הרכב" → department="CAR"
- YOU: "הלוואה של עד 100,000 ₪ על שעבוד רכב" → department="CAR"
- YOU: "הלוואה של עד 100,000 ₪ על שעבוד הרכב" → department="CAR"
- YOU: "הלוואה דיגיטלית בתנאים מיוחדים" → department="GENERAL"
- YOU: "הלוואה לשיפוץ הבית, רכישת רכב, השקעה" → department="GENERAL"
- YOU: "הלוואה נוספת בתנאים מועדפים" → department="GENERAL"

YOUR TASK:
- Consider the whole CONVERSATION for interest/intent classification.
- For department classification, ONLY consider the OUTREACH message (not conversation replies).
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
- interested=true for NOT_NOW responses (leads saying "not now" but not declining).
- interested=false for declines, unsubscribe, abuse, or out-of-scope.
- interested=false for auto-replies and automated responses (intent="OUT_OF_SCOPE").
- If unclear, intent="AMBIGUOUS" with a brief clarifying suggestedReply.

AUTO-REPLY DETECTION PATTERNS (Hebrew):
- "אנחנו לא זמינים כרגע" / "לא זמינים כרגע"
- "תודה שיצרת קשר" / "תודה על פנייתך"
- "איך אפשר לעזור?" / "איך נוכל לעזור?"
- "נענה לך בהקדם" / "נחזור אליך"
- "שעות הפעילות" / "שעות עבודה"
- Generic business responses without specific context

// NUMERIC RESPONSE HANDLING (OPTIONAL):
- If LEAD replies with just "1" (or "1."): interested=true; intent="POSITIVE_INTEREST"; action="REPLY"
- If LEAD replies with just "2" (or "2."): interested=false; intent="DECLINE"; action="DO_NOT_CONTACT"
- If LEAD replies with just "3" (or "3."): interested=false; intent="UNSUBSCRIBE"; action="ADD_TO_DNC"
- Note: These numeric responses are optional - leads may respond with natural language instead

// NEW: AUTO-REPLY DETECTION
- If the LEAD's message appears to be an auto-reply or automated response (e.g., "אנחנו לא זמינים כרגע", "תודה שיצרת קשר", "איך אפשר לעזור?"), treat this as out-of-scope.
- In such cases: interested=false; intent="OUT_OF_SCOPE".
- The suggestedReply should remain polite and neutral-corporate (third-person), e.g.:
  "התקבלה תשובתך. במידה ותהיה מעוניין/ת בעתיד, נשמח לסייע."

// NEW: SARCASM & ROLE-REVERSAL
- If the LEAD's message is a role-reversal offering YOU the same product/service you offered (e.g., "אני יכולה לתת לך הלוואה"), treat this as sarcasm/irony indicating lack of interest.
- In such cases: interested=false; intent="DECLINE".
- The suggestedReply should remain polite and neutral-corporate (third-person), e.g.:
  "התקבלה תשובתך. במידה ותהיה מעוניין/ת בעתיד, נשמח לסייע."

// CONDITIONAL INTEREST WITH SPECIFIC REQUIREMENTS
- If LEAD expresses interest but with specific conditions/requirements (e.g., "אני מוכנה להלוואה רק כנגד שיקים", "אני מעוניין רק בתנאים מסוימים"), treat as conditional interest.
- In such cases: interested=true; intent="POSITIVE_INTEREST"; action="REPLY".
- The suggestedReply should be formal and indicate that representatives will follow up if relevant, e.g.:
  "פנייתך התקבלה. נציגינו יחזרו אליך במידה והתנאים יהיו רלוונטיים עבורך."
`.trim();

/* -------------------- DETERMINISTIC DEPARTMENT POST-GUARD -------------------- */
/**
 * Department classification based on outreach message only (not lead replies).
 * Rule: Only check the outreach message for specific Hebrew patterns.
 * - MORTGAGE: Contains "כנגד נכס" (against property) OR "שיעבוד" with property context
 * - CAR: Contains "יש לך רכב" (you have a car) pattern OR "שיעבוד" with car context
 * - GENERAL: All other messages (but NOT if they contain "שיעבוד")
 */
const MORTGAGE_PATTERN = /כנגד\s*ה?נכס/i;
const CAR_PATTERN = /יש\s*לך\s*רכב/i;
const SHIYABUD_PATTERN = /שעבוד/i;
const NO_GUARANTEES_PATTERN = /ללא\s*צורך\s*בערבויות\s*ובטחונות/i;

// Property/real estate context patterns
const PROPERTY_CONTEXT_PATTERNS = [
  /נכס/i,
  /בית/i,
  /דירה/i,
  /מקרקעין/i,
  /נדל"ן/i,
  /property/i,
  /real\s*estate/i,
  /home/i,
  /house/i
];

// Car/vehicle context patterns
const CAR_CONTEXT_PATTERNS = [
  /רכב/i,
  /מכונית/i,
  /אוטו/i,
  /בסיס\s*שעבוד\s*הרכב/i,
  /שעבוד\s*רכב/i,
  /שעבוד\s*הרכב/i,
  /car/i,
  /vehicle/i,
  /auto/i,
  /automobile/i
];

function isMortgageMessage(text: string): boolean {
  // Direct mortgage pattern
  if (MORTGAGE_PATTERN.test(text)) return true;
  
  // Shiyabud with property context
  if (SHIYABUD_PATTERN.test(text)) {
    return PROPERTY_CONTEXT_PATTERNS.some(pattern => pattern.test(text));
  }
  
  return false;
}

function isCarMessage(text: string): boolean {
  // Direct car pattern
  if (CAR_PATTERN.test(text)) return true;
  
  // Shiyabud with car context
  if (SHIYABUD_PATTERN.test(text)) {
    return CAR_CONTEXT_PATTERNS.some(pattern => pattern.test(text));
  }
  
  return false;
}

function isNoGuaranteesMessage(text: string): boolean {
  return NO_GUARANTEES_PATTERN.test(text);
}

// Auto-reply detection patterns
const AUTO_REPLY_PATTERNS = [
  /אנחנו\s*לא\s*זמינים\s*כרגע/i,
  /לא\s*זמינים\s*כרגע/i,
  /תודה\s*שיצרת\s*קשר/i,
  /תודה\s*על\s*פנייתך/i,
  /איך\s*אפשר\s*לעזור/i,
  /איך\s*נוכל\s*לעזור/i,
  /נענה\s*לך\s*בהקדם/i,
  /נחזור\s*אליך/i,
  /שעות\s*הפעילות/i,
  /שעות\s*עבודה/i,
  /תודה\s*שיצרת\s*קשר\s*עם\s*[^!]*!?\s*איך\s*אפשר\s*לעזור/i, // Pattern for "Thank you for contacting [Business Name]! How can we help?"
];

function isAutoReply(text: string): boolean {
  return AUTO_REPLY_PATTERNS.some(pattern => pattern.test(text));
}

function inferDepartmentFromOutreach(outreachText: string): LeadDepartmentEnum {
  // Check for specific loan types first (these take priority over general patterns)
  if (isMortgageMessage(outreachText)) return LeadDepartmentEnum.MORTGAGE;
  if (isCarMessage(outreachText)) return LeadDepartmentEnum.CAR;
  
  // Check for no-guarantees pattern - this should be GENERAL only if not already classified
  if (isNoGuaranteesMessage(outreachText)) return LeadDepartmentEnum.GENERAL;
  
  // If message contains "שיעבוד" but no clear context, default to MORTGAGE
  if (SHIYABUD_PATTERN.test(outreachText)) {
    return LeadDepartmentEnum.MORTGAGE;
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

  const interestSchema: JsonSchema = {
    name: 'classify_interest',
    type: 'object',
    description: 'Classify whether the lead is interested based on outreach and their reply.',
    additionalProperties: false,
    properties: {
      interested: { type: 'boolean', description: 'True if the lead shows interest or asks for more info.' },
      intent: {
        type: 'string',
        description: 'Fine-grained intent label.',
        enum: Object.values(LeadIntentEnum),
      },
      reason: { type: 'string', description: 'One-sentence justification in plain language.' },
      confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Model confidence heuristic (0–1).' },
      suggestedReply: { type: 'string', description: 'A concise reply to send next (same language as the lead).' },
      action: {
        type: 'string',
        enum: Object.values(LeadActionEnum),
        description: 'Operational action to take.',
      },
      followUpAt: {
        type: 'string',
        description: 'If action is SCHEDULE_FOLLOW_UP, an ISO-8601 datetime with numeric timezone offset (e.g., +03:00).',
        format: 'date-time',
      },
      department: {
        type: 'string',
        description: 'Department inferred solely from messages sent by YOU (the sender).',
        enum: Object.values(LeadDepartmentEnum),
      },
    },
    required: ['interested', 'intent', 'reason', 'confidence', 'suggestedReply', 'department'],
  };

  const ai = await openai.requestWithJsonSchema<InterestResult>(messages, interestSchema, {
    model: 'gpt-4o-mini',
    temperature: 0 as const,
    max_tokens: 300 as const,
  });

  if (!ai) return null;

  // Hard-guard department using ONLY the outreach message (not lead replies or your replies)
  // This ensures department never changes based on conversation flow
  const safeDept = inferDepartmentFromOutreach(outreachText);
  
  // Hard-guard auto-reply detection - check the latest lead reply
  const latestLeadReply = leadReplies.filter(reply => reply.from === 'LEAD').pop();
  if (latestLeadReply && isAutoReply(latestLeadReply.text)) {
    return {
      ...ai,
      interested: false,
      intent: 'OUT_OF_SCOPE' as keyof typeof LeadIntentEnum,
      reason: 'Auto-reply detected',
      confidence: 1.0,
      suggestedReply: 'התקבלה תשובתך. במידה ותהיה מעוניין/ת בעתיד, נשמח לסייע.',
      action: 'DO_NOT_CONTACT' as keyof typeof LeadActionEnum,
      department: safeDept
    };
  }
  
  return { ...ai, department: safeDept };
}
