import type { WAMessageIncoming, WAMessageIncomingCallback, WAMessageIncomingRaw, WAMessageOutgoingCallback } from './whatsapp-instance.type';
import type { WAConversation, WAPersona, WAServiceConfig } from './whatsapp.type';
import type { WAActiveWarm, WAWarmUpdate } from '@server/services/whatsapp/whatsapp-warm.types';
import { WhatsappAiService } from './whatsapp.ai';
import { WAInstance, WhatsappService } from './whatsapp.service';
import { WhatsAppMessage, WhatsAppAuth } from './whatsapp.db';
import { clearTimeout } from 'node:timers';
import { MessageStatusEnum } from './whatsapp.enum';
import { LRUCache } from 'lru-cache';
import getLocalTime from '@server/helpers/get-local-time';

type Config<T extends object> = WAServiceConfig<T> & { warmUpOnReady?: boolean };

export class WhatsappWarmService extends WhatsappService<WAPersona> {
  private readonly ai = new WhatsappAiService();
  private readonly warmUpOnReady: boolean = false;
  private readonly activeConversation = new Map<string, WAConversation[]>();
  private readonly timeoutConversation = new Map<string, NodeJS.Timeout>();
  private readonly creatingConversation = new Set<string>(); // Track conversations being created
  private dailyScheduleTimeHour = 9;
  private dailyScheduleTimeMinute = 0;
  private isWarmingRunning: boolean = false;
  private nextStartWarming: NodeJS.Timeout | undefined;
  private conversationEndCallback: ((data: WAWarmUpdate) => unknown) | undefined;
  private conversationStartCallback: ((data: WAWarmUpdate) => unknown) | undefined;
  private conversationActiveCallback: ((data: WAActiveWarm) => unknown) | undefined;
  private nextCheckUpdate: ((nextWarmAt: Date | null) => unknown) | undefined;
  private warmingStatusCallback: ((isWarming: boolean) => unknown) | undefined;
  private warmUpTimeout: NodeJS.Timeout | undefined;
  private spammyBehaviorPairs = new LRUCache<string, boolean>({ max: 10000, ttl: 1000 * 60 * 60 * 24 }); // 24 hours TTL
  private dailyTimeWindow = [
    [5, 0],
    [7, 59],
  ];
  public nextWarmUp: Date | null = null;

  public get isWarming() {
    return this.isWarmingRunning;
  }

  constructor({ warmUpOnReady, ...config }: Config<WAPersona>) {
    // incoming message callback wrapper
    const onIncomingMessage: WAMessageIncomingCallback = (message, raw, messageId) => {
      const warmingFlag =
        message.internalFlag && Array.from(this.activeConversation.keys()).some((conversationKey) => conversationKey.includes(message.fromNumber));

      return config.onIncomingMessage?.({ ...message, warmingFlag }, raw, messageId);
    };

    // outgoing message callback wrapper
    const onOutgoingMessage: WAMessageOutgoingCallback = (message, raw, deliveryStatus) => {
      const instances = this.listInstanceNumbers({ onlyConnectedFlag: false });
      const internalFlag = instances.includes(message.toNumber);
      const warmingFlag =
        internalFlag && Array.from(this.activeConversation.keys()).some((conversationKey) => conversationKey.includes(message.toNumber));

      return config.onOutgoingMessage?.({ ...message, internalFlag, warmingFlag }, raw, deliveryStatus);
    };

    super({ ...config, onIncomingMessage, onOutgoingMessage });

    this.warmUpOnReady = !!warmUpOnReady;
  }

  private randomNextTimeWindow() {
    this.dailyScheduleTimeHour = this.randomDelayBetween(this.dailyTimeWindow[0][0], this.dailyTimeWindow[1][0]);
    this.dailyScheduleTimeMinute = this.randomDelayBetween(this.dailyTimeWindow[0][1], this.dailyTimeWindow[1][1]);
  }

  private getTodayDate(): string {
    // Get current time in Jerusalem timezone
    const now = getLocalTime();
    const nowHours = now.getHours();
    const nowMinutes = now.getMinutes();

    // If we're before the daily schedule time, consider it still "yesterday" for warm-up purposes
    if (nowHours < this.dailyScheduleTimeHour || (nowHours === this.dailyScheduleTimeHour && nowMinutes < this.dailyScheduleTimeMinute)) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }

    // If we're at or past the daily schedule time, return today's date
    return now.toISOString().split('T')[0];
  }

  private setWarmUpActive(value: boolean) {
    this.isWarmingRunning = value;
    this.warmingStatusCallback?.(value);

    if (!value) {
      this.nextWarmUp = null;
      this.nextCheckUpdate?.(null);
      clearTimeout(this.nextStartWarming);
    }
  }

  private getNextWarmingTime(): Date {
    const now = getLocalTime();
    const nowHours = now.getHours();
    const nowMinutes = now.getMinutes();
    let nextWarmingTime: Date;

    if (nowHours < this.dailyScheduleTimeHour || (nowHours === this.dailyScheduleTimeHour && nowMinutes < this.dailyScheduleTimeMinute)) {
      // Today
      this.randomNextTimeWindow();
      nextWarmingTime = new Date(now);
      nextWarmingTime.setHours(this.dailyScheduleTimeHour, this.dailyScheduleTimeMinute, 0, 0);
    } else {
      // Tomorrow
      this.randomNextTimeWindow();
      nextWarmingTime = new Date(now);
      nextWarmingTime.setDate(nextWarmingTime.getDate() + 1);
      nextWarmingTime.setHours(this.dailyScheduleTimeHour, this.dailyScheduleTimeMinute, 0, 0);
    }

    this.log('info', `Next warming time set to ${nextWarmingTime.toISOString()}`);

    return nextWarmingTime;
  }

  private getAllUniquePairs<T extends WAInstance<WAPersona>>(
    key: keyof T,
    arr: T[],
    fallbackInstance?: (phoneNumber: string) => T,
    allInstances?: T[]
  ): [T, T][] {
    if (arr.length === 1) {
      const fallback = this.getAvailableFallbackInstance(arr[0][key] as string, fallbackInstance, allInstances);

      if (!fallback) {
        this.log('error', 'No available fallback instance found (all pairs have failed recently)');

        return [];
      }

      this.log('debug', `[${this.getPairKey(key, arr[0], fallback)}]`, `Using fallback to warm '${arr[0][key]}' ...`);

      return fallback ? [[arr[0], fallback]] : [];
    }

    const result: [T, T][] = [];

    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key1 = arr[i][key];
        const key2 = arr[j][key];

        if (key1 === key2 || result.some((pair) => pair.some((v) => v[key] === key1 || v[key] === key2))) {
          continue;
        }

        // Check if this pair has failed recently
        const pairKey = this.getPairKey(key, arr[i], arr[j]);
        if (this.spammyBehaviorPairs.has(pairKey)) {
          this.log('debug', `[${pairKey}] Skipping pair - failed recently`);

          continue;
        }

        result.push([arr[i], arr[j]]);
      }
    }

    return result;
  }

  private getPairKey<T extends object>(key: keyof T, a: T, b: T): string {
    return [String(a[key]), String(b[key])].sort((a, b) => a.localeCompare(b)).join(':');
  }

  /**
   * Check if a pair has existing message history between them
   */
  private async hasMessageHistory(phoneNumber1: string, phoneNumber2: string): Promise<boolean> {
    try {
      const messages = await WhatsAppMessage.findOne(
        {
          $or: [
            { fromNumber: phoneNumber1, toNumber: phoneNumber2 },
            { fromNumber: phoneNumber2, toNumber: phoneNumber1 },
          ],
          // Exclude internal/warming messages - only count real conversation history
          internalFlag: { $ne: true },
          warmingFlag: { $ne: true },
        },
        { _id: 1 }
      ).lean();

      return !!messages;
    } catch (error) {
      this.log('error', `Error checking message history between ${phoneNumber1} and ${phoneNumber2}:`, error);
      return false;
    }
  }

  /**
   * Get pairs with smart prioritization:
   * 1. Prefer pairs with existing message history
   * 2. Prefer pairing old instances (high warmUpDay) with new instances (low warmUpDay)
   */
  private async getSmartPairs<T extends WAInstance<WAPersona>>(
    key: keyof T,
    arr: T[],
    fallbackInstance?: (phoneNumber: string) => T,
    allInstances?: T[]
  ): Promise<[T, T][]> {
    if (arr.length === 1) {
      const fallback = this.getAvailableFallbackInstance(arr[0][key] as string, fallbackInstance, allInstances);

      if (!fallback) {
        this.log('error', 'No available fallback instance found (all pairs have failed recently)');
        return [];
      }

      this.log('debug', `[${this.getPairKey(key, arr[0], fallback)}]`, `Using fallback to warm '${arr[0][key]}' ...`);
      return fallback ? [[arr[0], fallback]] : [];
    }

    // Collect all valid pairs with their metadata
    const allPairs: Array<{
      pair: [T, T];
      phoneNumber1: string;
      phoneNumber2: string;
      warmUpDay1: number;
      warmUpDay2: number;
      hasHistory: boolean;
    }> = [];

    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key1 = arr[i][key];
        const key2 = arr[j][key];

        if (key1 === key2) continue;

        const pairKey = this.getPairKey(key, arr[i], arr[j]);

        // Skip pairs that have failed recently
        if (this.spammyBehaviorPairs.has(pairKey)) {
          this.log('debug', `[${pairKey}] Skipping pair - failed recently`);
          continue;
        }

        const phoneNumber1 = String(key1);
        const phoneNumber2 = String(key2);
        const warmUpDay1 = arr[i].get('warmUpDay') || 0;
        const warmUpDay2 = arr[j].get('warmUpDay') || 0;

        // Check for existing message history
        const hasHistory = await this.hasMessageHistory(phoneNumber1, phoneNumber2);

        allPairs.push({
          pair: [arr[i], arr[j]],
          phoneNumber1,
          phoneNumber2,
          warmUpDay1,
          warmUpDay2,
          hasHistory,
        });
      }
    }

    // Sort pairs by priority:
    // 1. Pairs with history first (hasHistory = true gets priority)
    // 2. Then by warmUpDay difference (prefer pairing old with new - larger difference = better)
    // 3. Break ties by preferring higher total warmup days (at least one well-warmed instance)
    allPairs.sort((a, b) => {
      // Priority 1: History (has history = higher priority)
      if (a.hasHistory !== b.hasHistory) {
        return a.hasHistory ? -1 : 1;
      }

      // Priority 2: Warmup day difference - prefer pairing old (high days) with new (low days)
      const diffA = Math.abs(a.warmUpDay1 - a.warmUpDay2);
      const diffB = Math.abs(b.warmUpDay1 - b.warmUpDay2);

      // Higher difference = better (old with new)
      if (diffA !== diffB) {
        return diffB - diffA;
      }

      // Priority 3: Total warmup days - prefer pairs with at least one well-warmed instance
      const totalA = a.warmUpDay1 + a.warmUpDay2;
      const totalB = b.warmUpDay1 + b.warmUpDay2;

      return totalB - totalA;
    });

    // Extract pairs in priority order and ensure no overlaps
    const result: [T, T][] = [];
    const usedInstances = new Set<string>();

    for (const { pair, phoneNumber1, phoneNumber2, hasHistory } of allPairs) {
      // Skip if either instance is already used in another pair
      if (usedInstances.has(phoneNumber1) || usedInstances.has(phoneNumber2)) {
        continue;
      }

      usedInstances.add(phoneNumber1);
      usedInstances.add(phoneNumber2);
      result.push(pair);

      const pairKey = this.getPairKey(key, pair[0], pair[1]);
      const historyNote = hasHistory ? ' (has history)' : ' (new conversation)';
      const minWarmup = Math.min(pair[0].get('warmUpDay') || 0, pair[1].get('warmUpDay') || 0);
      const maxWarmup = Math.max(pair[0].get('warmUpDay') || 0, pair[1].get('warmUpDay') || 0);
      const warmupNote = `warmup: ${minWarmup}d + ${maxWarmup}d`;
      this.log('debug', `[${pairKey}] Selected pair${historyNote}, ${warmupNote}`);
    }

    return result;
  }

  private markPairAsFailed(conversationKey: string): void {
    this.spammyBehaviorPairs.set(conversationKey, true);
    this.log('debug', `[${conversationKey}] Marked pair as failed - will avoid for 24 hours`);
  }

  private async getLastMessages(fromNumber: string, toNumber: string, limit: number = 10): Promise<WAConversation[]> {
    try {
      return await WhatsAppMessage.aggregate<WAConversation>([
        {
          $match: {
            $or: [
              { fromNumber, toNumber },
              { fromNumber: toNumber, toNumber: fromNumber },
            ],
            text: { $exists: true, $nin: ['', null] },
            status: { $nin: [MessageStatusEnum.ERROR, MessageStatusEnum.PENDING, MessageStatusEnum.SENT] },
          },
        },
        { $project: { _id: 0, fromNumber: 1, toNumber: 1, text: 1, sentAt: '$createdAt' } },
        { $sort: { sentAt: -1 } },
        { $limit: limit },
      ]);
    } catch (error) {
      this.log('error', 'Failed to get last messages from database:', error);

      return [];
    }
  }

  private async getRandomScript(pair: [WAInstance<WAPersona>, WAInstance<WAPersona>]): Promise<Omit<WAConversation, 'sentAt'>[] | null> {
    const [instanceA, instanceB] = pair;
    const personaA = instanceA.get() as WAPersona;
    const personaB = instanceB.get() as WAPersona;

    // Ensure phone numbers are available
    if (!personaA.phoneNumber) personaA.phoneNumber = instanceA.phoneNumber;
    if (!personaB.phoneNumber) personaB.phoneNumber = instanceB.phoneNumber;

    const lastMessages = await this.getLastMessages(personaA.phoneNumber, personaB.phoneNumber);
    const script = await this.ai.generateConversation(personaA, personaB, 8, 12, lastMessages);

    this.log(
      'debug',
      `[${[personaA.phoneNumber, personaB.phoneNumber].join(':')}]`,
      '\n---- Previous Conversation ----',
      ...(lastMessages || []).map((msg) => `\n${msg.fromNumber} -> ${msg.toNumber}: ${msg.text}`),
      '\n---- AI Script ----',
      ...(script || []).map((msg) => `\n${msg.fromNumber} -> ${msg.toNumber}: ${msg.text}`)
    );

    return script;
  }

  private getDailyLimits(instance: WAInstance<WAPersona>) {
    let dailyLimit: { maxConversation: number; minMessages: number; maxMessages: number };

    const warmUpDay = instance.get('warmUpDay');

    if (warmUpDay <= 0) {
      dailyLimit = { maxConversation: 2, minMessages: 5, maxMessages: 10 };
    } else if (warmUpDay <= 3) {
      dailyLimit = { maxConversation: 4, minMessages: 10, maxMessages: 20 };
    } else if (warmUpDay <= 6) {
      dailyLimit = { maxConversation: 6, minMessages: 20, maxMessages: 30 };
    } else if (warmUpDay <= 10) {
      dailyLimit = { maxConversation: 8, minMessages: 30, maxMessages: 40 };
    } else if (warmUpDay <= 14) {
      dailyLimit = { maxConversation: 10, minMessages: 40, maxMessages: 50 };
    } else if (warmUpDay === 15) {
      // Final day of warm-up, mark as fully warmed up
      instance.update({ hasWarmedUp: true });
      dailyLimit = { maxConversation: 10, minMessages: 10, maxMessages: 20 };
    } else {
      dailyLimit = { maxConversation: 10, minMessages: 5, maxMessages: 10 };
    }

    return dailyLimit;
  }

  private needWarmUp(instance: WAInstance<WAPersona>): boolean {
    const conversationCount = instance.get('dailyWarmConversationCount') || 0;
    const messageCount = instance.get('dailyWarmUpCount') || 0;
    const dailyLimit = this.getDailyLimits(instance);

    return conversationCount < dailyLimit.maxConversation && messageCount < dailyLimit.minMessages;
  }

  private hasConflictingConversations(phoneNumber: string): boolean {
    // Check if this phone number is already involved in any active conversation
    return Array.from(this.activeConversation.keys()).some((conversationKey) => conversationKey.includes(phoneNumber));
  }

  private async createConversation(pair: [WAInstance<WAPersona>, WAInstance<WAPersona>]) {
    const activeConversations = [...this.activeConversation.keys()];
    const conversationKey = this.getPairKey('phoneNumber', ...pair);
    const [key1, key2] = conversationKey.split(':');
    const [instance1, instance2] = pair;

    if (!instance1.get('isActive') || !instance2.get('isActive')) return;

    // Check if conversation is already active or being created and ensure neither phone number is involved in other conversations
    if (activeConversations.some((val) => val.includes(key1) || val.includes(key2)) || this.creatingConversation.has(conversationKey)) return;
    if (this.hasConflictingConversations(key1) || this.hasConflictingConversations(key2)) return;

    // Mark this conversation as being created to prevent race conditions
    this.creatingConversation.add(conversationKey);
    this.log('debug', `[${conversationKey}] Starting conversation creation...`);

    try {
      const script = await this.getRandomScript(pair);

      if (script?.length) {
        // Validate script has proper phone numbers
        const validScript = script.filter((msg) => msg.fromNumber && msg.toNumber && msg.fromNumber !== msg.toNumber);

        if (validScript.length === 0) {
          this.log('error', `[${conversationKey}]`, 'Generated script has no valid messages with proper phone numbers');
          return;
        }

        this.activeConversation.set(conversationKey, validScript);

        const [phoneNumber1, phoneNumber2] = conversationKey.split(':');
        this.conversationStartCallback?.({ phoneNumber1, phoneNumber2, totalMessages: script.length });
        this.log('debug', `[${conversationKey}] Conversation created successfully (messages: ${script.length})`);
        await this.handleConversationMessage(conversationKey);
      } else {
        this.log('error', `[${conversationKey}]`, 'creating script failed', script);
      }
    } finally {
      this.creatingConversation.delete(conversationKey); // Always remove from creating set, whether successful or not
      this.log('debug', `[${conversationKey}] Conversation creation process completed`);
    }
  }

  private async cleanupConversation(conversationKey: string) {
    const conversation = this.activeConversation.get(conversationKey) || [];
    const totalMessages = conversation.length;

    if (totalMessages === 0) return;
    const sentMessages = conversation.filter(({ sentAt }) => sentAt).length;
    const unsentMessages = conversation.filter(({ sentAt }) => !sentAt).length;
    const isUpdateNeeded = sentMessages > 0;

    const [phoneNumber1, phoneNumber2] = conversationKey.split(':');
    this.conversationEndCallback?.({ phoneNumber1, phoneNumber2, totalMessages, sentMessages, unsentMessages });

    if (totalMessages > 0 && sentMessages === 0) this.markPairAsFailed(conversationKey);

    this.log('debug', `[${conversationKey}]`, `total messages: ${totalMessages}, sent: ${sentMessages}, unsent: ${unsentMessages}`);

    // Update counters when conversation is complete (all messages sent) or has sent messages
    if (isUpdateNeeded) {
      const [phoneNumber1, phoneNumber2] = conversationKey.split(':');
      const instance1 = this.getInstance(phoneNumber1);
      const instance2 = this.getInstance(phoneNumber2);

      await instance1?.update({
        dailyWarmConversationCount: (instance1?.get('dailyWarmConversationCount') || 0) + 1,
        dailyWarmUpCount: (instance1?.get('dailyWarmUpCount') || 0) + sentMessages,
        totalWarmUpCount: (instance1?.get('totalWarmUpCount') || 0) + sentMessages,
        lastWarmedUpDay: this.getTodayDate(),
      });

      await instance2?.update({
        dailyWarmConversationCount: (instance2?.get('dailyWarmConversationCount') || 0) + 1,
        dailyWarmUpCount: (instance2?.get('dailyWarmUpCount') || 0) + sentMessages,
        totalWarmUpCount: (instance2?.get('totalWarmUpCount') || 0) + sentMessages,
        lastWarmedUpDay: this.getTodayDate(),
      });
    }

    this.activeConversation.delete(conversationKey);
    const stillNeededWarm = this.listInstanceNumbers({ hasWarmedUp: false });

    // Only start new warming if we're still in warming mode and no active conversations
    if (!this.isWarmingRunning) {
      this.stopWarmingUp();
    } else if (this.activeConversation.size === 0) {
      // All conversations finished, stop warming and set up next session
      this.setWarmUpActive(false);
      clearTimeout(this.nextStartWarming);
      this.nextCheckUpdate?.(null);

      if (stillNeededWarm.length > 0) {
        const delay = this.randomDelayBetween(30, 90) * 1000 * 60;
        this.nextWarmUp = new Date(new Date().valueOf() + delay);
        this.nextCheckUpdate?.(this.nextWarmUp);

        this.nextStartWarming = setTimeout(() => this.startWarmingUp(), delay);
      }
    }
  }

  private getFallbackInstance(instances: WAInstance<WAPersona>[]) {
    return (phoneNumber: string) => {
      const availableInstance = instances.filter((instance) => instance.phoneNumber !== phoneNumber && instance.connected);
      const warmedAvailable = availableInstance.filter((instance) => instance.get('hasWarmedUp') && instance.connected);

      const sortedInstances = (warmedAvailable.length ? warmedAvailable : availableInstance).sort((a, b) => {
        const aDailyCount = a.get('dailyMessageCount');
        const bDailyCount = b.get('dailyMessageCount');

        const { maxMessages: aMaxMessages } = this.getDailyLimits(a);
        const { maxMessages: bMaxMessages } = this.getDailyLimits(b);

        const aDiff = aMaxMessages - aDailyCount;
        const bDiff = bMaxMessages - bDailyCount;

        return bDiff - aDiff;
      });

      return sortedInstances[0];
    };
  }

  private getAvailableFallbackInstance<T extends WAInstance<WAPersona>>(
    phoneNumber: string,
    fallbackInstance?: (phoneNumber: string) => T,
    allInstances?: T[]
  ): T | null {
    if (!fallbackInstance || !allInstances) return null;

    const availableInstances = allInstances.filter((instance) => instance.phoneNumber !== phoneNumber && instance.connected);
    const warmedAvailable = availableInstances.filter((instance) => instance.get('hasWarmedUp') && instance.connected);

    const sortedInstances = (warmedAvailable.length ? warmedAvailable : availableInstances).sort((a, b) => {
      const aDailyCount = a.get('dailyMessageCount');
      const bDailyCount = b.get('dailyMessageCount');

      const { maxMessages: aMaxMessages } = this.getDailyLimits(a);
      const { maxMessages: bMaxMessages } = this.getDailyLimits(b);

      const aDiff = aMaxMessages - aDailyCount;
      const bDiff = bMaxMessages - bDailyCount;

      return bDiff - aDiff;
    });

    // Find the first instance that hasn't failed with this phone number
    for (const instance of sortedInstances) {
      const pairKey = this.getPairKey<{ phoneNumber: string }>('phoneNumber', { phoneNumber }, instance);

      if (!this.spammyBehaviorPairs.has(pairKey)) return instance;
    }

    return null;
  }

  /**
   * Check if an instance is old enough to start warm-up.
   * WhatsApp may flag accounts that start sending messages immediately after registration.
   * Wait at least 24 hours after registration before starting warm-up.
   */
  private async isInstanceReadyForWarmUp(instance: WAInstance<WAPersona>): Promise<boolean> {
    try {
      // Query database for createdAt as it's not in the instance state
      const authDoc = await WhatsAppAuth.findOne({ phoneNumber: instance.phoneNumber }, { createdAt: 1 }).lean();
      const createdAt = authDoc?.createdAt;

      if (!createdAt) {
        // If no creation date, allow warm-up (legacy instances)
        return true;
      }

      const now = getLocalTime();
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      const MIN_WAIT_HOURS = 24; // Wait at least 24 hours after registration

      if (hoursSinceCreation < MIN_WAIT_HOURS) {
        this.log(
          'info',
          `Instance ${instance.phoneNumber} is too new (${Math.round(hoursSinceCreation)} hours old). Waiting ${Math.round(MIN_WAIT_HOURS - hoursSinceCreation)} more hours before warm-up to avoid WhatsApp restrictions.`
        );
        return false;
      }

      return true;
    } catch (error) {
      this.log('error', `Error checking if instance ${instance.phoneNumber} is ready for warm-up:`, error);
      // On error, allow warm-up to avoid blocking legitimate instances
      return true;
    }
  }

  private async getWarmInstances(instances: WAInstance<WAPersona>[]) {
    const warmInstances: WAInstance<WAPersona>[] = [];
    const todayDate = this.getTodayDate();
    const actualToday = new Date().toISOString().split('T')[0]; // Real today's date

    for (const instance of instances) {
      // CRITICAL: Don't warm up instances that are too new to avoid WhatsApp restrictions
      if (!(await this.isInstanceReadyForWarmUp(instance))) {
        continue;
      }

      const lastWarmedUpDay = instance.get('lastWarmedUpDay');
      const dailyWarmUpCount = instance.get('dailyWarmUpCount') || 0;
      const dailyWarmConversationCount = instance.get('dailyWarmConversationCount') || 0;

      // Only reset daily counters if this is a new day AND the instance hasn't warmed up today
      // Check if the instance has already warmed up today by looking at lastWarmedUpDay and counters
      const hasWarmedUpToday = lastWarmedUpDay === actualToday && (dailyWarmUpCount > 0 || dailyWarmConversationCount > 0);

      if (lastWarmedUpDay !== todayDate && !hasWarmedUpToday) {
        await instance.update({
          lastWarmedUpDay: todayDate,
          warmUpDay: (instance.get('warmUpDay') || 0) + 1,
          dailyWarmUpCount: 0,
          dailyWarmConversationCount: 0,
        });
      }

      if (this.needWarmUp(instance)) warmInstances.push(instance);
    }

    if (warmInstances.length) {
      this.log('debug', `Final warm instances: ${warmInstances.map((inst) => inst.phoneNumber).join(', ')}`);
    }

    return warmInstances;
  }

  private async handleConversationMessage(conversationKey: string): Promise<void> {
    clearTimeout(this.timeoutConversation.get(conversationKey));

    if (!this.isWarmingRunning) {
      await this.cleanupConversation(conversationKey);

      return;
    }

    const sendTimeout = () => {
      const randomSeconds = this.getRealisticDelay(5, 30);
      const sendingDelay = randomSeconds * 1000;
      const currentState = this.activeConversation.get(conversationKey);
      const currentMessage = currentState?.find(({ sentAt }) => !sentAt);
      const currentIndex = currentState?.findIndex(({ sentAt }) => !sentAt);

      this.log('debug', `[${conversationKey}]`, `schedule message in ${randomSeconds} seconds`);

      return setTimeout(async () => {
        if (!currentState || !currentMessage || currentIndex === undefined) {
          await this.cleanupConversation(conversationKey);

          return;
        }

        const messageContent = { type: 'text' as const, text: currentMessage.text };

        try {
          const [key1, key2] = conversationKey.split(':');
          const instance1 = this.getInstance(key1);
          const instance2 = this.getInstance(key2);

          if (!instance1?.get('isActive') || !instance2?.get('isActive')) throw new Error('One or more of the instances deactivated');

          const instance = this.getInstance(currentMessage.fromNumber);

          if (instance) {
            const isConnected = instance.connected;
            const isActive = instance.get('isActive');
            this.log('debug', `[${conversationKey}] Instance status - Connected: ${isConnected}, Active: ${isActive}`);

            if (!isActive) throw new Error(`Instance ${currentMessage.fromNumber} is not active`);
            if (!isConnected) throw new Error(`Instance ${currentMessage.fromNumber} is not connected`);

            const targetInstance = this.getInstance(currentMessage.toNumber);
            const targetConnected = targetInstance?.connected;
            const targetActive = targetInstance?.get('isActive');

            if (!targetInstance) throw new Error(`Target instance ${currentMessage.toNumber} not found`);
            if (!targetConnected) throw new Error(`Target instance ${currentMessage.toNumber} is not connected`);
            if (!targetActive) throw new Error(`Target instance ${currentMessage.toNumber} is not active`);

            this.log('debug', `[${conversationKey}] Sending message from ${currentMessage.fromNumber} to ${currentMessage.toNumber}`);

            await instance.send(currentMessage.toNumber, messageContent, {
              trackDelivery: true, // Enable delivery tracking
              waitForDelivery: true, // Wait for delivery confirmation
              waitTimeout: 60000, // 1 minute timeout
              throwOnDeliveryError: true, // Throw to see the actual error
              maxRetries: 1,
            });
          } else {
            throw new Error(`Instance ${currentMessage.fromNumber} not found`);
          }

          currentMessage.sentAt = getLocalTime();

          try {
            const client = this.getInstance(currentMessage.fromNumber);
            await client?.refresh();
          } catch (error) {
            this.log('error', `[${currentMessage.fromNumber}] Failed to refresh session:`, error);
          }

          const remainingMessages = currentState.filter((msg) => !msg.sentAt);

          if (remainingMessages.length === 0) {
            this.log('debug', `[${conversationKey}]`, 'Conversation completed, cleaning up...');
            await this.cleanupConversation(conversationKey);

            return;
          }

          const [phoneNumber1, phoneNumber2] = conversationKey.split(':');
          this.conversationActiveCallback?.({ phoneNumber1, phoneNumber2 });
          await this.handleConversationMessage(conversationKey);
        } catch {
          this.log(
            'error',
            `[${conversationKey}] Sending message from ${currentMessage.fromNumber} to ${currentMessage.toNumber} failed, aborting conversation`
          );

          await this.cleanupConversation(conversationKey);
        }
      }, sendingDelay);
    };

    this.timeoutConversation.set(conversationKey, sendTimeout());
  }

  public isWarmingUp(phoneNumber: string): boolean {
    return Array.from(this.activeConversation.keys()).some((key) => {
      const [from, to] = key.split(':');

      return from === phoneNumber || to === phoneNumber;
    });
  }

  public setStartWindow = (fromTime: [number, number], toTime: [number, number]) => {
    this.dailyTimeWindow = [fromTime, toTime];
  };

  public async startWarmingUp() {
    try {
      const allActiveInstances = this.getAllInstances();
      const warmUpTodayInstances: WAInstance<WAPersona>[] = await this.getWarmInstances(allActiveInstances);

      this.log('debug', `Warm-up today: ${warmUpTodayInstances.length}`);

      if (warmUpTodayInstances.length === 0) {
        this.log('debug', 'No instances need warming up, stopping warm-up process');
        this.setWarmUpActive(false);

        const nextWarmingTime = this.getNextWarmingTime();
        const timeUntilNextWarming = nextWarmingTime.getTime() - Date.now();

        this.nextStartWarming = setTimeout(() => this.startWarmingUp(), timeUntilNextWarming);
        this.nextWarmUp = getLocalTime(nextWarmingTime);
        this.nextCheckUpdate?.(this.nextWarmUp);

        return;
      }

      this.log('debug', warmUpTodayInstances.map(({ phoneNumber }) => phoneNumber).join(','), `Start Warming Up ${warmUpTodayInstances.length}`);
      const instancesPairs = await this.getSmartPairs(
        'phoneNumber',
        warmUpTodayInstances,
        this.getFallbackInstance(allActiveInstances),
        allActiveInstances
      );
      this.setWarmUpActive(true);

      // Process conversations sequentially with delays to prevent simultaneous creation
      for (const pair of instancesPairs) {
        if (pair.length < 2) return;

        // Add a delay between conversation creations to prevent simultaneous processing
        if (this.activeConversation.size > 0) {
          const delay = this.randomDelayBetween(3, 8) * 1000; // 3-8 seconds delay
          this.log('debug', `Waiting ${delay / 1000}s before creating next conversation to prevent simultaneous processing`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        try {
          await this.createConversation(pair);

          const setupDelay = 2000; // 2 seconds to ensure conversation is properly initialized
          await new Promise((resolve) => setTimeout(resolve, setupDelay));
        } catch (conversationError) {
          // Mark this pair as failed
          const conversationKey = this.getPairKey('phoneNumber', pair[0], pair[1]);

          this.log('error', `[${conversationKey}] Conversation failed, marking pair as failed:`, conversationError);
          // Continue with next pair instead of stopping the entire warming process
        }
      }
    } catch (error) {
      this.log('error', 'Error occurred in warming process', error);
      // Stop warming on error and let the scheduled warming handle it
      this.setWarmUpActive(false);
    }
  }

  public stopWarmingUp() {
    this.setWarmUpActive(false);

    Array.from([...this.timeoutConversation.values(), this.nextStartWarming]).forEach(clearTimeout);
    this.timeoutConversation.clear();
    this.activeConversation.clear();
    this.creatingConversation.clear(); // Clear conversations being created
  }

  public async addInstanceQR(phoneNumber: string) {
    const { qrCode, instance } = await super.addInstanceQR(phoneNumber);
    await instance.update({ warmUpDay: 0, dailyWarmUpCount: 0, dailyWarmConversationCount: 0, hasWarmedUp: false });

    return { qrCode, instance };
  }

  onReady(callback: () => Promise<void> | void) {
    super.onReady(async () => {
      clearTimeout(this.warmUpTimeout);

      // Only auto-start warm-up if enabled
      if (this.warmUpOnReady) {
        // Delay 30 seconds to ensure instance is fully ready, then start warm-up
        // The startWarmingUp method will check if instances are ready via getWarmInstances
        this.warmUpTimeout = setTimeout(async () => {
          await this.startWarmingUp();
        }, 30 * 1000);
      }

      callback?.();
    });
  }

  onSchedule(callback?: (nextWarmAt: Date | null) => unknown) {
    this.nextCheckUpdate = callback;
  }

  onConversationEnd(callback?: (data: WAWarmUpdate) => unknown) {
    this.conversationEndCallback = callback;
  }

  onConversationStart(callback?: (data: WAWarmUpdate) => unknown) {
    this.conversationStartCallback = callback;
  }

  onConversationActive(callback?: (data: WAActiveWarm) => unknown) {
    this.conversationActiveCallback = callback;
  }

  onWarmingStatusChange(callback?: (isWarming: boolean) => unknown) {
    this.warmingStatusCallback = callback;
  }

  onMessage(callback?: WAMessageIncomingCallback) {
    super.onMessage(async (message: WAMessageIncoming, raw: WAMessageIncomingRaw, messageId: string) => {
      const { fromNumber, toNumber, text } = message;
      const instances = this.listInstanceNumbers({ onlyConnectedFlag: false });
      const isInternal = instances.includes(fromNumber);

      if (isInternal) {
        // Check if there's an active conversation between these numbers
        const conversationKey = this.getPairKey(
          'phoneNumber',
          { phoneNumber: fromNumber } as WAInstance<WAPersona>,
          { phoneNumber: toNumber } as WAInstance<WAPersona>
        );

        if (this.activeConversation.has(conversationKey)) {
          await this.handleConversationMessage(conversationKey);
        } else {
          this.log('info', 'whatsappService:onMessage', `INTERNAL [${fromNumber}] ${toNumber}: ${text}`);
        }

        return;
      }

      await callback?.(message, raw, messageId);
    });
  }
}
