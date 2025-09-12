import type { WAConversation, WAPersona } from './whatsapp.type';
import type { JsonSchema } from '../open-ai/open-ai.types';
import { OpenAiService } from '../open-ai/open-ai.service';
import { WhatsAppAuth } from '@server/services/whatsapp/whatsapp.db';

export type Language = 'en' | 'he' | 'ar' | 'ru';

export class WhatsappAiService {
  private ai: OpenAiService;
  private langMap: Record<Language, string> = { en: 'English', he: 'Hebrew', ar: 'Arabic', ru: 'Russian' };

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

  /**
   * Generate real, localized links based on persona location and topic using AI
   */
  private async getLocalizedLinksAI(topic: string, location?: string): Promise<string[]> {
    if (!location) {
      return this.getDefaultLinks(topic);
    }

    try {
      const prompt = `Generate 3-5 real, current, and relevant URLs for ${topic} in ${location}. 
      Focus on popular, well-known websites and services that locals would actually use.
      For ${topic}, consider:
      - Travel: YouTube travel videos, booking sites, local attraction websites
      - Books: Online bookstores, review sites, local libraries
      - Music: Music streaming services, YouTube music, local radio
      - Restaurants: Food delivery apps, review sites, local restaurant chains
      - Movies: Streaming services, local cinema websites, review sites
      - Shopping: Popular e-commerce sites, local stores, comparison platforms
      
      Return only valid URLs, REAL LINK IF CLICK ON LINK REFER TO REAL PAGE WITH CONTENT AND NOT 404, one per line, no explanations.`;

      const response = await this.ai.request([this.ai.createUserMessage(prompt)], {
        max_tokens: 200,
        temperature: 0.7,
      });

      if (response?.choices?.[0]?.message?.content) {
        const content = response.choices[0].message.content;
        const urls = content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('http') && line.length > 10)
          .slice(0, 5);

        return urls.length > 0 ? urls : this.getDefaultLinks(topic);
      }
    } catch (error) {
      console.warn('Failed to generate AI links, falling back to defaults:', error);
    }

    return this.getDefaultLinks(topic);
  }

  /**
   * Get default fallback links for when AI generation fails
   */
  private getDefaultLinks(topic: string): string[] {
    const defaultLinks: Record<string, string[]> = {
      travel: ['https://www.youtube.com/results?search_query=travel+guide', 'https://www.booking.com/', 'https://www.tripadvisor.com/'],
      books: ['https://www.amazon.com/', 'https://www.goodreads.com/', 'https://www.bookdepository.com/'],
      music: ['https://open.spotify.com/', 'https://www.youtube.com/music', 'https://music.apple.com/'],
      restaurants: ['https://www.tripadvisor.com/Restaurants', 'https://www.yelp.com/', 'https://www.opentable.com/'],
      movies: ['https://www.imdb.com/', 'https://www.netflix.com/', 'https://www.rottentomatoes.com/'],
      shopping: ['https://www.amazon.com/', 'https://www.ebay.com/', 'https://www.walmart.com/'],
    };

    const topicKey = Object.keys(defaultLinks).find((key) => topic.includes(key)) || 'travel';
    return defaultLinks[topicKey];
  }

  // Conversation
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
    const seeds: string[] = [];

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

    // New advanced topics with link potential
    if (!mentioned('travel') && !mentioned('trip')) seeds.push('travel_planning');
    if (!mentioned('book') && !mentioned('read')) seeds.push('book_recommendation');
    if (!mentioned('music') && !mentioned('song')) seeds.push('music_discovery');
    if (!mentioned('youtube') && !mentioned('video')) seeds.push('youtube_video');
    if (!mentioned('website') && !mentioned('app')) seeds.push('website_review');
    if (!mentioned('movie') && !mentioned('film')) seeds.push('movie_recommendation');
    if (!mentioned('restaurant') && !mentioned('food')) seeds.push('restaurant_review');

    // If nothing suitable, leave empty so base prompt handles "small talk"
    if (!seeds.length) return '';

    // light randomization
    return seeds[Math.floor(Math.random() * seeds.length)];
  }

  private weightedChoice(weights: [len: number, weight: number][]): number {
    if (!weights || weights.length === 0) {
      return 1; // fallback to 1 if no weights provided
    }

    const total = weights.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) {
      return 1; // fallback to 1 if total weight is 0 or negative
    }

    let r = Math.random() * total;
    for (const [len, w] of weights) {
      r -= w;
      if (r <= 0) return len;
    }

    // This should never happen, but if it does, return the first weight's length
    return weights[0][0];
  }

  private buildRunPlan(total: number): number[] {
    // 1 → 70%, 2 → 20%, 3 → 10%
    const weights: [number, number][] = [
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

  private buildSpeakerOrder(total: number, aNumber: string, bNumber: string): { from: string; to: string }[] {
    // Validate input phone numbers
    if (!aNumber || !bNumber) {
      console.error(`[AI Error] Invalid phone numbers: aNumber=${aNumber}, bNumber=${bNumber}`);
      return [];
    }

    const plan = this.buildRunPlan(total);
    const startWithA = Math.random() < 0.5;
    let currentFrom = startWithA ? aNumber : bNumber;
    let currentTo = startWithA ? bNumber : aNumber;

    const order: { from: string; to: string }[] = [];
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
    // Handle emoji-only messages (don't strip if it's just emojis)
    if (/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(s)) {
      return s; // Return emoji-only messages as-is
    }
    return s.replace(/\s*[!.]+$/u, ''); // no trailing ! or . for regular text
  }

  private enforceSpeakerOrder(
    items: { fromNumber: string; toNumber: string; text: string }[],
    order: { from: string; to: string }[]
  ): { fromNumber: string; toNumber: string; text: string }[] {
    // Validate that we have items
    if (!items || items.length === 0) {
      console.error(`[AI Error] No messages received from AI`);
      return [];
    }

    // If we have fewer items than expected, adjust the order to match what we have
    const actualCount = items.length;
    const expectedCount = order.length;

    if (actualCount < expectedCount) {
      console.warn(`[AI Warning] Incomplete response: got ${actualCount} messages, expected ${expectedCount}. Using available messages.`);
      // Truncate the order to match what we actually have
      order = order.slice(0, actualCount);
    } else if (actualCount > expectedCount) {
      console.warn(`[AI Warning] Extra messages: got ${actualCount} messages, expected ${expectedCount}. Using first ${expectedCount} messages.`);
      // Truncate the items to match what we expected
      items = items.slice(0, expectedCount);
    }

    // force sender/receiver by index, keep text; also clean punctuation
    const out: { fromNumber: string; toNumber: string; text: string }[] = [];

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
    speakerOrder: { from: string; to: string }[],
    topicHint?: string,
    localizedLinks: Record<string, string[]> = {}
  ): string {
    const languageName = this.langMap[a.language] || 'Hebrew';
    const formatChildren = (children: { name: string; age: number }[]) =>
      children?.length > 0 ? children.map((c) => `${c.name} (${c.age})`).join(', ') : 'none';

    let previousContext = '';
    if (previousConversation?.length) {
      previousContext = `
📱 PREVIOUS CONTEXT (newest first):
${previousConversation.map((msg) => `${msg.fromNumber === a.phoneNumber ? a.name : b.name}: "${msg.text}"`).join('\n')}

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
  school_pickup, tv_series, quick_workout, travel_planning, book_recommendation, 
  music_discovery, youtube_video, website_review
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
- **Use casual, friend-like language - avoid formal phrases like "Check out this" or "Please review"**
- **Natural link sharing**: "Take a look at this", "Found it here", "Listen to this", "Menu here"
- Minimal punctuation; **do not end messages with "!" or "."**. "?" is allowed.
- Variety: do NOT make every message a question; never two questions in a row.
- **MANDATORY: Include 2-3 emojis throughout the conversation (mix of emoji-only messages and emojis within text)**
- **Include 1-2 messages with relevant links to websites, YouTube videos, or music when discussing related topics**
- Names only when natural.
- No system notes.

# LINK INTEGRATION (AI-POWERED & LOCALIZED)
When discussing these topics, naturally include relevant links generated by AI based on persona location:
- **Travel/Location**: AI-generated YouTube travel vlogs, local booking websites, regional attraction sites
- **Books**: AI-generated local online bookstores, regional review sites, location-specific libraries
- **Music**: AI-generated local music streaming services, regional YouTube music, location-based radio
- **Movies/TV**: AI-generated local streaming services, regional cinema websites, location-specific review sites
- **Food**: AI-generated local food delivery apps, regional review sites, location-specific restaurant chains
- **Shopping**: AI-generated local e-commerce sites, regional stores, location-based comparison platforms
- **Technology**: AI-generated local product websites, regional review sites, location-specific comparison tools

**CRITICAL**: Use the pre-generated localized links below. These are real, current URLs specific to the persona's location.
Never use hardcoded or generic links - always use the provided localized links.

# PRE-GENERATED LOCALIZED LINKS (USE THESE EXACTLY)
${Object.entries(localizedLinks)
  .map(([topic, links]) => `**${topic.toUpperCase()}**: ${links.join(', ')}`)
  .join('\n')}

# CONVERSATION FLOW EXAMPLES (with required emojis)
- **Travel**: "Take a look at this video [USE-TRAVEL-LINK-FROM-ABOVE]" → "🔥🔥🔥" → "I'm so excited to go! 😍"
- **Books**: "Found it here [USE-BOOKS-LINK-FROM-ABOVE]" → "👍 thanks!" → "Can't wait to read it! 📚"
- **Music**: "Listen to this [USE-MUSIC-LINK-FROM-ABOVE]" → "❤️ love it!" → "This song is amazing! 🎵"
- **Restaurants**: "Menu here [USE-RESTAURANTS-LINK-FROM-ABOVE]" → "😋 looks delicious" → "Let's go there! 🍕"

**IMPORTANT**: Use the exact links from the PRE-GENERATED LOCALIZED LINKS section above. 
Copy and paste the URLs exactly as they appear - do not modify or create new ones.

# EMOJI RESPONSES (CONTEXTUAL) - MANDATORY 2-3 PER CONVERSATION
**REQUIRED: Every conversation MUST include 2-3 emojis total, distributed as:**
- **1-2 emoji-only messages** (e.g., "👍", "❤️", "😂", "🔥")
- **1-2 emojis within regular text messages** (e.g., "That's amazing! 😍", "I'm so tired 😴")

**Emoji categories to use contextually:**
- Agreement: 👍, 👌, ✅
- Love/Appreciation: ❤️, 😍, 🥰
- Laughter: 😂, 🤣, 😆
- Excitement: 🔥, ⚡, 🚀
- Surprise: 😱, 😲, 🤯
- Sadness: 😢, 😭, 😔
- Anger: 😠, 😡, 🤬
- Other emotions: 😴 (tired), 🤔 (thinking), 🎉 (celebration), 🌟 (amazing)

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
- **MANDATORY: Include 2-3 emojis total (mix of emoji-only messages and emojis within text)**
- **Include 1-2 messages with relevant links when discussing related topics**
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
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        // Build the concrete sender order using the 70/20/10 run distribution
        const aNum = String(profileA.phoneNumber || '');
        const bNum = String(profileB.phoneNumber || '');

        const speakerOrder = this.buildSpeakerOrder(totalMessages, aNum, bNum);

        // If speaker order is empty, return null
        if (speakerOrder.length === 0) {
          return null;
        }

        const topicHint = await this.buildTopicHint(profileA, profileB, lastConversation);

        // Pre-generate localized links for potential topics
        const potentialTopics = ['travel', 'books', 'music', 'restaurants', 'movies', 'shopping'];
        const localizedLinks: Record<string, string[]> = {};

        for (const topic of potentialTopics) {
          try {
            localizedLinks[topic] = await this.getLocalizedLinksAI(topic, profileA.location || profileB.location);
          } catch (error) {
            console.warn(`Failed to generate links for ${topic}:`, error);
            localizedLinks[topic] = this.getDefaultLinks(topic);
          }
        }

        const prompt = this.buildConversationPrompt(profileA, profileB, totalMessages, lastConversation, speakerOrder, topicHint, localizedLinks);

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
              minItems: Math.max(1, totalMessages - 2), // Allow some flexibility in minimum count
              maxItems: totalMessages + 2, // Allow some flexibility in maximum count
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['fromNumber', 'toNumber', 'text'],
                properties: {
                  fromNumber: { type: 'string', minLength: 1 },
                  toNumber: { type: 'string', minLength: 1 },
                  text: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 200,
                    // Allow emoji-only messages and links, but still prevent trailing ! or .
                    pattern: '^.+[^!.]$',
                  },
                },
              },
            },
          },
        };

        const parsed = await this.ai.requestWithJsonSchema<{ messages: WAConversation[] }>([this.ai.createUserMessage(prompt)], convoSchema, {
          temperature: 0.4,
        });

        if (!parsed) {
          console.error(`[AI Error] Failed to parse AI response (attempt ${retryCount + 1}/${maxRetries})`);
          retryCount++;
          continue;
        }

        // Validate that no messages have empty text
        if (parsed.messages) {
          let hasInvalidMessages = false;
          for (let i = 0; i < parsed.messages.length; i++) {
            const msg = parsed.messages[i];

            if (!msg.text || msg.text.trim() === '') {
              console.error(`[AI Error] Empty text in message ${i} (attempt ${retryCount + 1}/${maxRetries}):`, msg);
              hasInvalidMessages = true;
              break;
            }

            // Validate emoji-only messages are reasonable length
            if (
              /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(
                msg.text.trim()
              )
            ) {
              if (msg.text.trim().length > 10) {
                console.error(`[AI Error] Emoji-only message too long at index ${i} (attempt ${retryCount + 1}/${maxRetries}):`, msg.text);
                hasInvalidMessages = true;
                break;
              }
            }
          }

          if (hasInvalidMessages) {
            retryCount++;
            continue;
          }
        }

        const enforcedMessages = this.enforceSpeakerOrder(parsed.messages, speakerOrder);

        // If we have valid messages (even if fewer than expected), return them
        if (enforcedMessages.length > 0) {
          return enforcedMessages;
        }

        // If no valid messages were produced, retry
        console.error(`[AI Error] No valid messages produced after enforcing speaker order (attempt ${retryCount + 1}/${maxRetries})`);
        retryCount++;
      } catch (error) {
        console.error(`[AI Error] Failed to generate conversation (attempt ${retryCount + 1}/${maxRetries}):`, error);
        retryCount++;
      }
    }

    // If all retries failed, return null
    console.error(`[AI Error] Failed to generate conversation after ${maxRetries} attempts`);
    return null;
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

  async loadPersonaFromDb(): Promise<WAPersona[]> {
    return WhatsAppAuth.find<WAPersona>(
      { statusCode: 200 },
      {
        _id: 0,
        phoneNumber: 1,
        name: 1,
        language: 1,
        age: 1,
        gender: 1,
        jobTitle: 1,
        hobbies: 1,
        interests: 1,
        personality: 1,
        location: 1,
        maritalStatus: 1,
        children: 1,
      }
    );
  }

  async generatePersona(name: string, language: Language = 'he'): Promise<Omit<WAPersona, 'phoneNumber'> | null> {
    const history = await this.loadPersonaFromDb();
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

    return { ...parsed, language };
  }
}
