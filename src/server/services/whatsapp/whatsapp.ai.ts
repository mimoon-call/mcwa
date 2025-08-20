import type { WAConversation, WAPersona } from './whatsapp.type';
import type { JsonSchema } from '../open-ai/open-ai.types';
import { OpenAiService } from '../open-ai/open-ai.service';
import { LRUCache } from 'lru-cache';

export type Language = 'en' | 'he' | 'ar' | 'ru';

export class WhatsappAiService {
  private ai: OpenAiService;
  private langMap: Record<Language, string> = { en: 'English', he: 'Hebrew', ar: 'Arabic', ru: 'Russian' };
  private personaCache = new LRUCache<number, Omit<WAPersona, 'phoneNumber'>>({ max: 1000, ttl: 1000 * 60 * 60 * 24 });

  constructor() {
    this.ai = new OpenAiService();
  }

  // Helpers
  private recent<K extends string>(arr: K[], n: number) {
    return arr.slice(-n);
  }

  private getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Conversation
  /** Pick a lightweight topic-hint based on personas + recent chat */
  /** Pick a lightweight topic-hint based on personas + recent chat (no books) */
  private buildTopicHint(a: WAPersona, b: WAPersona, prev?: WAConversation[]): string {
    const hasKidsA = (a.children?.length ?? 0) > 0;
    const hasKidsB = (b.children?.length ?? 0) > 0;
    const bothHaveKids = hasKidsA && hasKidsB;

    const sameJob =
      a.jobTitle?.trim().toLowerCase() && b.jobTitle?.trim().toLowerCase() && a.jobTitle.trim().toLowerCase() === b.jobTitle.trim().toLowerCase();

    const likesNightlife = (p: WAPersona) => (p.hobbies || []).concat(p.interests || []).some((x) => /night|club|party|dj|bar/i.test(x));
    const eitherNightlife = likesNightlife(a) || likesNightlife(b);

    // dedupe vs last 8 msgs
    const recent = (prev || [])
      .slice(-8)
      .map((m) => m.text.toLowerCase())
      .join(' ');
    const mentioned = (k: string) => recent.includes(k);

    // Common, low-friction seeds (short, everyday)
    const seeds: Array<string> = [];

    if (bothHaveKids && !mentioned('birthday') && !mentioned('party')) seeds.push('kids_birthday');
    if (eitherNightlife && !mentioned('club') && !mentioned('bar')) seeds.push('night_out');
    if (!mentioned('date') && ((a.gender === 'male' && b.gender === 'female') || (a.gender === 'female' && b.gender === 'male'))) {
      seeds.push('meet_partner');
    }
    if (sameJob && !mentioned('project') && !mentioned('deadline')) seeds.push('work_colleagues');

    // New generic everyday topics (books intentionally excluded)
    if (!mentioned('coffee') && !mentioned('caf')) seeds.push('coffee_catchup');
    if (!mentioned('traffic') && !mentioned('parking')) seeds.push('traffic_parking');
    if (!mentioned('delivery') && !mentioned('package')) seeds.push('delivery_pickup');
    if (!mentioned('phone') && !mentioned('battery')) seeds.push('phone_battery');
    if (!mentioned('grocery') && !mentioned('shopping')) seeds.push('quick_groceries');
    if ((hasKidsA || hasKidsB) && !mentioned('school')) seeds.push('school_pickup');
    if (!mentioned('series') && !mentioned('episode')) seeds.push('tv_series');
    if (!mentioned('gym') && !mentioned('workout')) seeds.push('quick_workout');

    // If nothing suitable, leave empty so base prompt handles "small talk"
    if (!seeds.length) return '';

    // light randomization
    return seeds[Math.floor(Math.random() * seeds.length)];
  }

  private weightedChoice(weights: Array<[len: number, weight: number]>): number {
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [len, w] of weights) {
      r -= w;
      if (r <= 0) return len;
    }
    return 1;
  }

  private buildRunPlan(total: number): number[] {
    // 1 → 70%, 2 → 20%, 3 → 10%
    const weights: Array<[number, number]> = [
      [1, 70],
      [2, 20],
      [3, 10],
    ];
    const plan: number[] = [];
    let remaining = total;

    while (remaining > 0) {
      let pick = this.weightedChoice(weights);
      if (pick > remaining) pick = remaining; // last chunk fits
      plan.push(pick);
      remaining -= pick;
    }
    return plan;
  }

  private buildSpeakerOrder(total: number, aNumber: string, bNumber: string): Array<{ from: string; to: string }> {
    // Validate input phone numbers
    if (!aNumber || !bNumber) {
      console.error(`[AI Error] Invalid phone numbers: aNumber=${aNumber}, bNumber=${bNumber}`);
      return [];
    }

    const plan = this.buildRunPlan(total);
    const startWithA = Math.random() < 0.5;
    let currentFrom = startWithA ? aNumber : bNumber;
    let currentTo = startWithA ? bNumber : aNumber;

    const order: Array<{ from: string; to: string }> = [];
    for (const runLen of plan) {
      for (let i = 0; i < runLen; i++) {
        order.push({ from: currentFrom, to: currentTo });
      }
      // flip sender for next run
      [currentFrom, currentTo] = [currentTo, currentFrom];
    }

    return order;
  }

  private stripForbiddenPunct(s: string): string {
    return s.replace(/\s*[!.]+$/u, ''); // no trailing ! or .
  }

  private enforceSpeakerOrder(
    items: Array<{ fromNumber: string; toNumber: string; text: string }>,
    order: Array<{ from: string; to: string }>
  ): Array<{ fromNumber: string; toNumber: string; text: string }> {
    // Validate that we have enough items to match the order
    if (!items || items.length < order.length) {
      console.error(`[AI Error] Incomplete response: got ${items?.length || 0} messages, expected ${order.length}`);
      return [];
    }

    // force sender/receiver by index, keep text; also clean punctuation
    const out: Array<{ fromNumber: string; toNumber: string; text: string }> = [];

    for (let i = 0; i < order.length; i++) {
      const src = items[i];

      // Skip if source message is missing or invalid
      if (!src || !src.fromNumber || !src.toNumber || !src.text || src.text.trim() === '') {
        console.error(`[AI Error] Invalid message at index ${i}:`, src);
        continue;
      }

      // Ensure phone numbers are properly set - never allow undefined
      const fromNumber = order[i].from || src.fromNumber || '';
      const toNumber = order[i].to || src.toNumber || '';

      // Validate phone numbers
      if (!fromNumber || !toNumber) {
        console.error(`[AI Error] Invalid phone numbers at index ${i}: from=${fromNumber}, to=${toNumber}`);
        continue;
      }

      const cleanedText = this.stripForbiddenPunct(src.text.trim());

      // Skip if text becomes empty after cleaning
      if (!cleanedText) {
        console.error(`[AI Error] Empty text after cleaning at index ${i}: original="${src.text}"`);
        continue;
      }

      out.push({
        fromNumber: fromNumber,
        toNumber: toNumber,
        text: cleanedText,
      });
    }

    // Only return if we have valid messages
    if (out.length === 0) {
      console.error('[AI Error] No valid messages after processing');
      return [];
    }

    return out;
  }

  private buildConversationPrompt(
    a: WAPersona,
    b: WAPersona,
    messageCount: number,
    previousConversation: WAConversation[] | undefined,
    speakerOrder: Array<{ from: string; to: string }>,
    topicHint?: string
  ): string {
    const languageName = this.langMap[a.language] || 'Hebrew';
    const formatChildren = (children: { name: string; age: number }[]) =>
      children?.length > 0 ? children.map((c) => `${c.name} (${c.age})`).join(', ') : 'none';

    let previousContext = '';
    if (previousConversation?.length) {
      const recentMessages = previousConversation.slice(-6);
      previousContext = `
📱 PREVIOUS 24H CONTEXT (newest last):
${recentMessages.map((msg) => `${msg.fromNumber === a.phoneNumber ? a.name : b.name}: "${msg.text}"`).join('\n')}

🎯 CONTINUATION RULE:
Infer relationship, tone, and slang level from this context. Continue naturally if relevant; otherwise pivot to a light everyday topic without being abrupt.
`.trim();
    }

    const orderJson = JSON.stringify(speakerOrder);
    const topicLine = topicHint ? `\n# TOPIC SEED (single thread, keep it casual)\nSeed topic key: "${topicHint}"\n` : '';

    const rulesBlock = `
# TOPIC VARIETY & RULES (STRICT)
- Keep topics everyday and lightweight
- Allowed seeds (examples): kids_birthday, night_out, meet_partner, work_colleagues,
  coffee_catchup, traffic_parking, delivery_pickup, phone_battery, quick_groceries,
  school_pickup, tv_series, quick_workout
- Avoid niche hobbies, politics, or deep analysis
- No book discussions unless it naturally appears in PREVIOUS CONTEXT (then keep it to a passing mention only)
`.trim();

    return `
Create a realistic WhatsApp-style conversation between two ${languageName} speakers, use only conversation at same language include names.

${previousContext ? previousContext + '\n\n' : ''}Participants:
1. ${a.name} (${a.phoneNumber})
   - Gender: ${a.gender}, Age: ${a.age}
   - Marital Status: ${a.maritalStatus}
   - Children: ${formatChildren(a.children)}
   - Job: ${a.jobTitle}, Location: ${a.location}
   - Hobbies: ${a.hobbies?.join(', ')}

2. ${b.name} (${b.phoneNumber})
   - Gender: ${b.gender}, Age: ${b.age}
   - Marital Status: ${b.maritalStatus}
   - Children: ${formatChildren(b.children)}
   - Job: ${b.jobTitle}, Location: ${b.location}
   - Hobbies: ${b.hobbies?.join(', ')}

🎯 Language: ${languageName}
${topicLine}${rulesBlock}

# NAME & PROPER NOUN LOCALIZATION (STRICT)
- Convert ALL proper nouns from the persona details into ${languageName} script before using them in messages.
- This includes: participant names, children's names, family members, city/country names, venues, and book titles (use local title if it exists, else transliterate).
- Keep the SAME localized form consistently across all messages.
- Do NOT mix scripts: no Latin letters anywhere in "text".

# GLOBAL STYLE (must follow)
- Messages are short and chatty: ~3–12 words, one sentence each.
- Minimal punctuation; **do not end messages with "!" or "."**. "?" is allowed.
- Variety: do NOT make every message a question; never two questions in a row.
- Emojis optional (≤1), only if they fit the tone.
- Names only when natural.
- No links/media/system notes.
- If talking about kids/family/work, add a tiny human detail (not robotic).

# SENDER ORDER (STRICT)
Follow this exact sequence of senders (runs already embedded). Each object is a message:
SPEAKER_ORDER = ${orderJson}

Produce exactly ${messageCount} messages, one per entry in SPEAKER_ORDER, with matching from/to.

📤 Output format (JSON only):
{ "messages": [ { "fromNumber": "...", "toNumber": "...", "text": "..." }, ... ] }

⚠️ Strict:
- Return ONLY a valid JSON object with "messages" of length ${messageCount}.
- Each "text" is ${languageName} only, one sentence, **no trailing "!" or "."**.
- **NEVER return empty strings for "text" - each message must have meaningful content.**
- If you cannot generate valid content for a message, omit that message entirely from the response.
`.trim();
  }

  async generateConversation(
    profileA: WAPersona,
    profileB: WAPersona,
    minMessages = 8,
    maxMessages = 14,
    lastConversation?: WAConversation[]
  ): Promise<Omit<WAConversation, 'sentAt'>[] | null> {
    // Validate input personas
    if (!profileA?.phoneNumber || !profileB?.phoneNumber) {
      return null;
    }

    const totalMessages = this.getRandomInt(minMessages, maxMessages);

    // Build the concrete sender order using the 70/20/10 run distribution
    const aNum = String(profileA.phoneNumber || '');
    const bNum = String(profileB.phoneNumber || '');

    const speakerOrder = this.buildSpeakerOrder(totalMessages, aNum, bNum);

    // If speaker order is empty, return null
    if (speakerOrder.length === 0) {
      return null;
    }

    const topicHint = this.buildTopicHint(profileA, profileB, lastConversation);
    const prompt = this.buildConversationPrompt(profileA, profileB, totalMessages, lastConversation, speakerOrder, topicHint);

    // Schema: keep from/to flexible (we enforce after parsing),
    // and forbid trailing "!" or "." on text
    const convoSchema: JsonSchema = {
      type: 'object',
      name: 'ConversationResponse',
      additionalProperties: false,
      required: ['messages'],
      properties: {
        messages: {
          type: 'array',
          minItems: totalMessages,
          maxItems: totalMessages,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['fromNumber', 'toNumber', 'text'],
            properties: {
              fromNumber: { type: 'string', minLength: 1 },
              toNumber: { type: 'string', minLength: 1 },
              text: { type: 'string', minLength: 1, maxLength: 140, pattern: '^.+[^!.]$' },
            },
          },
        },
      },
    };

    const parsed = await this.ai.requestWithJsonSchema<{ messages: WAConversation[] }>([this.ai.createUserMessage(prompt)], convoSchema, {
      temperature: 0.4,
    });

    if (!parsed) {
      console.error('[AI Error] Failed to parse AI response');
      return null;
    }

    // Validate that no messages have empty text
    if (parsed.messages) {
      for (let i = 0; i < parsed.messages.length; i++) {
        const msg = parsed.messages[i];

        if (!msg.text || msg.text.trim() === '') {
          console.error(`[AI Error] Empty text in message ${i}:`, msg);

          return null;
        }
      }
    }

    try {
      const enforcedMessages = this.enforceSpeakerOrder(parsed.messages, speakerOrder);

      // If no valid messages were produced, return null instead of empty array
      if (enforcedMessages.length === 0) {
        console.error('[AI Error] No valid messages produced after enforcing speaker order');
        return null;
      }

      return enforcedMessages;
    } catch (error) {
      console.error('Failed to enforce speaker order:', error);

      return null;
    }
  }

  // Persona
  private choosePersonaTargets(history: Omit<WAPersona, 'phoneNumber'>[]) {
    const lastGenders = this.recent(
      history.map((h) => h.gender as 'male' | 'female' | 'other'),
      12
    );

    const lastJobs = this.recent(
      history.map((h) => (h.jobTitle || '').toLowerCase()),
      40
    );

    // Gender rotation: keep roughly 50/50, sprinkle "other" rarely
    const genderCounts = { male: 0, female: 0, other: 0 };
    lastGenders.forEach((g) => (genderCounts[g] = (genderCounts[g] ?? 0) + 1));

    const needMale = genderCounts.male <= genderCounts.female;
    const needOther = Math.random() < 0.05; // ~5%
    const gender = needOther ? 'other' : needMale ? 'male' : 'female';

    const TECH = ['Software Engineer', 'Data Analyst', 'Product Manager', 'QA Engineer', 'DevOps Engineer'];
    const HEALTH = ['Physiotherapist', 'Nurse', 'Pharmacist', 'Dietitian', 'Medical Lab Technician'];
    const BUSINESS = ['Accountant', 'Financial Analyst', 'Operations Manager', 'HR Specialist', 'Sales Manager'];
    const EDUCATION = ['Teacher', 'School Counselor', 'Librarian', 'Lecturer', 'Education Coordinator'];
    const SERVICES = ['Electrician', 'Plumber', 'Logistics Coordinator', 'Chef', 'Restaurant Manager'];
    const ART = ['Photographer', 'Interior Designer', 'Copywriter', 'UX Researcher', 'Event Planner'];

    // Curated jobs by sector (no "graphic designer" at all)
    const JOBS: string[] = [...TECH, ...HEALTH, ...BUSINESS, ...EDUCATION, ...SERVICES, ...ART];

    // Ban most frequent recent jobs (top-5 by frequency)
    const freq = new Map<string, number>();
    lastJobs.forEach((j) => freq.set(j, (freq.get(j) || 0) + 1));

    const banned = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([j]) => j);

    const pool = JOBS.filter((j) => !banned.includes(j.toLowerCase()));
    const jobTitle = pool[Math.floor(Math.random() * pool.length)];

    // Light marital/children variety
    const maritalRoll = Math.random();
    const maritalStatus = maritalRoll < 0.6 ? 'married' : maritalRoll < 0.85 ? 'single' : 'divorced';
    const childrenCount = maritalStatus === 'married' ? (Math.random() < 0.7 ? 2 : Math.random() < 0.6 ? 3 : 1) : Math.random() < 0.2 ? 1 : 0;

    return { gender, jobTitle, maritalStatus, childrenCount };
  }

  private buildPersonaPrompt(
    name: string,
    lang: Language,
    history: Omit<WAPersona, 'phoneNumber'>[],
    targets: { gender: string; jobTitle: string; maritalStatus: string; childrenCount: number }
  ): string {
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 10000);
    const randomAge = Math.floor(Math.random() * 30) + 25; // 25–54

    const bannedJobs = this.recent(
      history.map((h) => h.jobTitle || ''),
      25
    );

    return `
You are generating exactly ONE fictional WhatsApp persona (seed ${randomSeed} @ ${timestamp}).

# Hard constraints
- "gender" MUST be exactly "${targets.gender}".
- "jobTitle" MUST be exactly "${targets.jobTitle}" (do not vary wording, seniority, or add prefixes/suffixes).
- "maritalStatus" SHOULD be "${targets.maritalStatus}" unless contradictory with age (then choose the closest realistic option).
- "children" array length MUST equal ${targets.childrenCount}.
- Do NOT use any job title in this banned list: ${JSON.stringify(bannedJobs)}.

# Language & naming
- Output MUST be ASCII only (English letters, digits, spaces, commas, hyphens).
- Use English transliteration for names from ${this.langMap[lang]} culture.
- If "${name}" is a culturally valid first name in ${this.langMap[lang]}, use it; otherwise pick a realistic culturally-aligned first name.
- "name" MUST be ONE word (first name only). No punctuation, no emojis.

# Realism rules
- "age" MUST be an integer between 25 and 54 (suggested: ${randomAge}).
- If children exist:
  - each child "age" MUST be an integer between 0 and 22.
  - max(child.age) + 18 <= parent age.
  - child "name" MUST be a single given name in English letters.
- "location" should be realistic for ${this.langMap[lang]} speakers (City, Country).
- "hobbies" and "interests": 2–4 items each, concise nouns/gerunds (e.g., "running", "street photography"), no emojis.
- "personality": a short, natural phrase (max 6 words), not a sentence.
- Do NOT invent sensitive identifiers (IDs, phone, email).

# Output format (STRICT)
- Return ONLY valid JSON.
- No comments, no trailing commas, no backticks, no explanations.
- Use double quotes for all keys and string values.

{
  "name": "FirstName",
  "age": ${randomAge},
  "gender": "${targets.gender}",
  "jobTitle": "${targets.jobTitle}",
  "hobbies": ["...", "..."],
  "interests": ["...", "..."],
  "personality": "short natural phrase",
  "location": "City, Country",
  "maritalStatus": "${targets.maritalStatus}",
  "children": ${targets.childrenCount === 0 ? '[]' : '[{"name":"...","age":...} /* exactly ' + targets.childrenCount + ' items */]'}
}
`.trim();
  }

  async generatePersona(name: string, language: Language = 'he'): Promise<Omit<WAPersona, 'phoneNumber'> | null> {
    const history = Array.from(this.personaCache.values()).slice(-40);
    const targets = this.choosePersonaTargets(history);
    const prompt = this.buildPersonaPrompt(name, language, history, targets);

    const personaSchema: JsonSchema = {
      type: 'object',
      name: 'PersonaResponse',
      additionalProperties: false,
      required: ['name', 'age', 'gender', 'jobTitle', 'hobbies', 'interests', 'personality', 'location', 'maritalStatus', 'children'],
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'integer', minimum: 18, maximum: 75 },
        gender: { type: 'string', enum: ['male', 'female', 'other'] },
        jobTitle: { type: 'string', minLength: 2 },
        hobbies: {
          type: 'array',
          minItems: 2,
          maxItems: 5,
          items: { type: 'string', minLength: 2 },
        },
        interests: {
          type: 'array',
          minItems: 2,
          maxItems: 5,
          items: { type: 'string', minLength: 2 },
        },
        personality: { type: 'string', minLength: 3, maxLength: 120 },
        location: { type: 'string', minLength: 3 },
        maritalStatus: { type: 'string', enum: ['single', 'married', 'divorced', 'widowed', 'separated'] },
        children: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'age'],
            properties: {
              name: { type: 'string', minLength: 1 },
              age: { type: 'integer', minimum: 0, maximum: 25 },
            },
          },
        },
      },
    };

    const parsed = await this.ai.requestWithJsonSchema<Omit<WAPersona, 'language' | 'phoneNumber'>>(
      [this.ai.createUserMessage(prompt)],
      personaSchema,
      { temperature: 0.7, top_p: 0.9, presence_penalty: 0.3, frequency_penalty: 0.5 }
    );

    if (!parsed) {
      return null;
    }

    const persona: Omit<WAPersona, 'phoneNumber'> = { ...parsed, language };
    this.personaCache.set(Date.now(), persona);

    return persona;
  }
}
