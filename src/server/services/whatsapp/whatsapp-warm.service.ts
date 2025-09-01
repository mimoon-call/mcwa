import type { WAMessageIncoming, WAMessageIncomingCallback, WAMessageIncomingRaw, WAMessageOutgoingCallback } from './whatsapp-instance.type';
import type { WAConversation, WAPersona, WAServiceConfig } from './whatsapp.type';
import { WhatsappAiService } from './whatsapp.ai';
import { LRUCache } from 'lru-cache';
import { WAInstance, WhatsappService } from './whatsapp.service';
import { clearTimeout } from 'node:timers';
import dayjs from 'dayjs';
import getLocalTime from '@server/helpers/get-local-time';
import { WAActiveWarm, WAWarmUpdate } from '@server/services/whatsapp/whatsapp-warm.types';

type Config<T extends object> = WAServiceConfig<T> & { isEmulation?: boolean };

export class WhatsappWarmService extends WhatsappService<WAPersona> {
  private isWarming: boolean = false;
  private nextStartWarming: NodeJS.Timeout | undefined;
  private readonly ai = new WhatsappAiService();
  private readonly isEmulation: boolean = false;
  private readonly activeConversation = new Map<string, WAConversation[]>();
  private readonly timeoutConversation = new Map<string, NodeJS.Timeout>();
  private readonly creatingConversation = new Set<string>(); // Track conversations being created
  private readonly lastConversation = new LRUCache<string, WAConversation[]>({ max: 1000, ttl: 1000 * 60 * 60 * 24 });
  private readonly maxRetryAttempt = 3;
  private readonly dailyScheduleTimeHour = 9;
  private conversationEndCallback: ((data: WAWarmUpdate) => unknown) | undefined;
  private conversationStartCallback: ((data: WAWarmUpdate) => unknown) | undefined;
  private conversationActiveCallback: ((data: WAActiveWarm) => unknown) | undefined;
  private nextCheckUpdate: ((nextWarmAt: Date | null) => unknown) | undefined;
  public nextWarmUp: Date | null = null;

  constructor({ isEmulation, ...config }: Config<WAPersona>) {
    // incoming message callback wrapper
    const onIncomingMessage: WAMessageIncomingCallback = (message, raw) => {
      const instances = this.listInstanceNumbers({ onlyConnectedFlag: false });
      const internalFlag = instances.includes(message.fromNumber);
      const warmingFlag =
        internalFlag && Array.from(this.activeConversation.keys()).some((conversationKey) => conversationKey.includes(message.fromNumber));

      return config.onIncomingMessage?.({ ...message, internalFlag, warmingFlag }, raw);
    };

    // outgoing message callback wrapper
    const onOutgoingMessage: WAMessageOutgoingCallback = (message, raw, info) => {
      const instances = this.listInstanceNumbers({ onlyConnectedFlag: false });
      const internalFlag = instances.includes(message.toNumber);
      const warmingFlag =
        internalFlag && Array.from(this.activeConversation.keys()).some((conversationKey) => conversationKey.includes(message.toNumber));

      return config.onOutgoingMessage?.({ ...message, internalFlag, warmingFlag }, raw, info);
    };

    super({ ...config, onIncomingMessage, onOutgoingMessage });

    this.isEmulation = !!isEmulation;
  }

  private getTodayDate(): string {
    // Get current time in Jerusalem timezone
    const timezone = process.env.TIMEZONE || 'Asia/Jerusalem';
    const now = dayjs().tz(timezone);

    if (now.hour() < this.dailyScheduleTimeHour) {
      return now.subtract(1, 'day').format('YYYY-MM-DD');
    }

    return now.format('YYYY-MM-DD');
  }

  private getNextWarmingTime(): Date {
    // Get current time in Jerusalem timezone
    const timezone = process.env.TIMEZONE || 'Asia/Jerusalem';
    const now = dayjs().tz(timezone);
    let nextWarmingTime: dayjs.Dayjs;

    if (now.hour() < this.dailyScheduleTimeHour) {
      // Today
      nextWarmingTime = now.hour(this.dailyScheduleTimeHour).minute(0).second(0).millisecond(0);
    } else {
      // Tomorrow
      const tomorrow = now.add(1, 'day');
      nextWarmingTime = tomorrow.hour(this.dailyScheduleTimeHour).minute(0).second(0).millisecond(0);
    }

    // Add phone-specific jitter for better distribution
    // Since this is a global warming time, we'll use a consistent but distributed offset
    const baseJitter = 5 + Math.floor(Math.random() * 55); // 5-60 minutes
    nextWarmingTime = nextWarmingTime.add(baseJitter, 'minute');

    return nextWarmingTime.toDate();
  }

  private getHoursAndMinutes(milliseconds: number): { hours: number; minutes: number } {
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  }

  private getAllUniquePairs<T extends object>(key: keyof T, arr: T[], fallbackInstance?: (phoneNumber: string) => T): [T, T][] {
    if (arr.length === 1) {
      const fallback = fallbackInstance?.(arr[0][key] as string);

      if (!fallback) {
        this.log('warn', 'Fallback instance not found');

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

        result.push([arr[i], arr[j]]);
      }
    }

    return result;
  }

  private getPairKey<T extends object>(key: keyof T, a: T, b: T): string {
    return [String(a[key]), String(b[key])].sort((a, b) => a.localeCompare(b)).join(':');
  }

  private randomDelayBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getRealisticDelay(min: number, max: number): number {
    const random = Math.random();

    if (random < 0.8) {
      return this.randomDelayBetween(min, max);
    } else {
      // 3 times slower
      return this.randomDelayBetween(min * 3, max * 3);
    }
  }

  private async getRandomScript(
    instanceA: WAInstance<WAPersona>,
    instanceB: WAInstance<WAPersona>,
    prevConversation: WAConversation[] | undefined,
    minMessages = 6,
    maxMessages = 12
  ): Promise<Omit<WAConversation, 'sentAt'>[] | null> {
    const personaA = instanceA.get() as WAPersona;
    const personaB = instanceB.get() as WAPersona;

    // Ensure phone numbers are available
    if (!personaA.phoneNumber) {
      personaA.phoneNumber = instanceA.phoneNumber;
    }
    if (!personaB.phoneNumber) {
      personaB.phoneNumber = instanceB.phoneNumber;
    }

    const script = await this.ai.generateConversation(personaA, personaB, minMessages, maxMessages, prevConversation);

    return script || null;
  }

  private getDailyLimits(instance: WAInstance<WAPersona>) {
    let dailyLimit: { maxConversation: number; minMessages: number; maxMessages: number };

    const warmUpDay = instance.get('warmUpDay');

    if (warmUpDay <= 0) {
      dailyLimit = { maxConversation: 10, minMessages: 20, maxMessages: 30 };
    } else if (warmUpDay <= 3) {
      dailyLimit = { maxConversation: 10, minMessages: 20, maxMessages: 30 };
    } else if (warmUpDay <= 6) {
      dailyLimit = { maxConversation: 20, minMessages: 50, maxMessages: 100 };
    } else if (warmUpDay <= 10) {
      dailyLimit = { maxConversation: 30, minMessages: 100, maxMessages: 150 };
    } else if (warmUpDay <= 14) {
      dailyLimit = { maxConversation: 50, minMessages: 100, maxMessages: 200 };
    } else {
      dailyLimit = { maxConversation: 100, minMessages: 30, maxMessages: 200 };
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

    if (!instance1.get('isActive') || !instance2.get('isActive')) {
      return;
    }

    // Check if conversation is already active or being created
    if (activeConversations.some((val) => val.includes(key1) || val.includes(key2)) || this.creatingConversation.has(conversationKey)) {
      this.log('debug', `[${conversationKey}] Skipping - conversation already active or being created`);
      return;
    }

    // Additional check: ensure neither phone number is involved in other conversations
    if (this.hasConflictingConversations(key1) || this.hasConflictingConversations(key2)) {
      this.log('debug', `[${conversationKey}] Skipping - one or both phone numbers already in other conversations`);
      return;
    }

    // Mark this conversation as being created to prevent race conditions
    this.creatingConversation.add(conversationKey);
    this.log('debug', `[${conversationKey}] Starting conversation creation...`);

    try {
      const previousConversation = this.lastConversation.get(conversationKey);
      const script = await this.getRandomScript(pair[0], pair[1], previousConversation);

      if (script?.length) {
        // Validate script has proper phone numbers
        const validScript = script.filter((msg) => msg.fromNumber && msg.toNumber && msg.fromNumber !== msg.toNumber);

        if (validScript.length === 0) {
          this.log('error', `[${conversationKey}]`, 'Generated script has no valid messages with proper phone numbers');
          return;
        }

        this.activeConversation.set(conversationKey, validScript);
        const delay = this.randomDelayBetween(10, 30) * 1000;

        this.timeoutConversation.set(
          conversationKey,
          setTimeout(async () => await this.handleConversationMessage(conversationKey), delay)
        );

        const [phoneNumber1, phoneNumber2] = conversationKey.split(':');
        this.conversationStartCallback?.({ phoneNumber1, phoneNumber2, totalMessages: script.length, startInSeconds: delay / 1000 });
        this.log('debug', `[${conversationKey}] Conversation created successfully (messages: ${script.length}, delay: ${delay / 1000}s)`);
      } else {
        this.log('error', `[${conversationKey}]`, 'creating script failed', script);
      }
    } finally {
      // Always remove from creating set, whether successful or not
      this.creatingConversation.delete(conversationKey);
      this.log('debug', `[${conversationKey}] Conversation creation process completed`);
    }
  }

  private async cleanupConversation(conversationKey: string) {
    const conversation = this.activeConversation.get(conversationKey) || [];
    const totalMessages = conversation.length;

    if (totalMessages === 0) {
      return;
    }

    const sentMessages = conversation.filter(({ sentAt }) => sentAt).length;
    const unsentMessages = conversation.filter(({ sentAt }) => !sentAt).length;
    const isUpdateNeeded = sentMessages > 0;

    const [phoneNumber1, phoneNumber2] = conversationKey.split(':');
    this.conversationEndCallback?.({ phoneNumber1, phoneNumber2, totalMessages, sentMessages, unsentMessages });

    this.log('debug', `[${conversationKey}]`, `total messages: ${totalMessages}, sent: ${sentMessages}, unsent: ${unsentMessages}`);

    const prevConversation = this.lastConversation.get(conversationKey) || [];
    this.lastConversation.set(conversationKey, [...prevConversation, ...conversation].slice(-10));

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
    if (!this.isWarming) {
      clearTimeout(this.nextStartWarming);
      this.nextCheckUpdate?.(null);
      this.stopWarmingUp();
    } else if (this.activeConversation.size === 0) {
      clearTimeout(this.nextStartWarming);
      this.nextCheckUpdate?.(null);

      if (stillNeededWarm.length > 0) {
        const delay = this.randomDelayBetween(30, 90) * 1000 * 60;
        const { hours, minutes } = this.getHoursAndMinutes(delay);
        const totalMinutes = hours * 60 + minutes;
        this.nextWarmUp = new Date(getLocalTime().valueOf() + delay);
        this.nextCheckUpdate?.(this.nextWarmUp);
        this.log('debug', `[${conversationKey}]`, `Will check again in ${totalMinutes} minutes`);

        this.nextStartWarming = setTimeout(() => this.startWarmingUp(), delay);
      }
    }
  }

  private getFallbackInstance(instances: Array<WAInstance<WAPersona>>) {
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

  private async getWarmInstances(instances: Array<WAInstance<WAPersona>>) {
    const warmInstances: WAInstance<WAPersona>[] = [];

    for (const instance of instances) {
      // Reset counters if day changed
      if (instance.get('hasWarmedUp')) {
        this.log('debug', `[${instance.phoneNumber}]`, `Instance has already warmed up, skipping`);
        continue;
      } else if ((instance.get('warmUpDay') || 0) > 14) {
        this.log('debug', `[${instance.phoneNumber}]`, `Instance exceeded 14 days, marking as warmed up`);
        await instance.update({ hasWarmedUp: true });
        continue;
      }

      if (instance.get('lastWarmedUpDay') !== this.getTodayDate()) {
        await instance.update({
          lastWarmedUpDay: this.getTodayDate(),
          warmUpDay: (instance.get('warmUpDay') || 0) + 1,
          dailyWarmUpCount: 0,
          dailyWarmConversationCount: 0,
        });
      }

      if (this.needWarmUp(instance)) {
        warmInstances.push(instance);
      }
    }

    if (warmInstances.length) {
      this.log('debug', `Final warm instances: ${warmInstances.map((inst) => inst.phoneNumber).join(', ')}`);
    }

    return warmInstances;
  }

  public async startWarmingUp() {
    try {
      const allActiveInstances = this.getAllInstances();
      const warmUpTodayInstances: WAInstance<WAPersona>[] = await this.getWarmInstances(allActiveInstances);

      this.log('debug', `Warm-up today: ${warmUpTodayInstances.length}`);

      // const stillNeededWarm = this.listInstanceNumbers({ hasWarmedUp: false });
      const stillNeededWarm = this.listInstanceNumbers();

      if (warmUpTodayInstances.length === 0) {
        this.log('debug', 'No instances need warming up, stopping warm-up process');
        clearTimeout(this.nextStartWarming);
        this.nextCheckUpdate?.(null);

        if (stillNeededWarm.length > 0) {
          const nextWarmingTime = this.getNextWarmingTime();
          const timeUntilNextWarming = nextWarmingTime.getTime() - Date.now();

          this.nextStartWarming = setTimeout(() => this.startWarmingUp(), timeUntilNextWarming);
          this.nextWarmUp = getLocalTime(nextWarmingTime);
          this.nextCheckUpdate?.(this.nextWarmUp);

          const { hours, minutes } = this.getHoursAndMinutes(timeUntilNextWarming);

          this.log('debug', `Next warming session scheduled in ${hours}h ${minutes}m`);
        }

        return;
      }

      this.log('debug', warmUpTodayInstances.map(({ phoneNumber }) => phoneNumber).join(','), `Start Warming Up ${warmUpTodayInstances.length}`);
      const instancesPairs = this.getAllUniquePairs('phoneNumber', warmUpTodayInstances, this.getFallbackInstance(allActiveInstances));
      this.isWarming = true;

      // Process conversations sequentially with delays to prevent simultaneous creation
      for (const pair of instancesPairs) {
        if (pair.length < 2) {
          return;
        }

        // Add a delay between conversation creations to prevent simultaneous processing
        if (this.activeConversation.size > 0) {
          const delay = this.randomDelayBetween(3, 8) * 1000; // 3-8 seconds delay
          this.log('debug', `Waiting ${delay / 1000}s before creating next conversation to prevent simultaneous processing`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        await this.createConversation(pair);

        // Wait for conversation to be fully set up before proceeding
        const setupDelay = 2000; // 2 seconds to ensure conversation is properly initialized
        await new Promise((resolve) => setTimeout(resolve, setupDelay));
      }
    } catch (error) {
      this.log('error', 'Error occurred', error);
      // Schedule retry in 5 minutes if there's an error
      this.nextStartWarming = setTimeout(() => this.startWarmingUp(), 5 * 60 * 1000);
    }
  }

  public stopWarmingUp() {
    this.isWarming = false;

    // Clear all timeouts properly
    for (const timerId of this.timeoutConversation.values()) {
      clearTimeout(timerId);
    }

    clearTimeout(this.nextStartWarming);
    this.timeoutConversation.clear();
    this.activeConversation.clear();
    this.creatingConversation.clear(); // Clear conversations being created
  }

  private async handleConversationMessage(conversationKey: string): Promise<void> {
    clearTimeout(this.timeoutConversation.get(conversationKey));

    if (!this.isWarming) {
      await this.cleanupConversation(conversationKey);

      return;
    }

    const send = (attempt: number = 0) => {
      const delaySeconds = this.getRealisticDelay(1, 15);
      const delay = delaySeconds * 1000;
      const seconds = Math.round(delaySeconds * 100) / 100;

      this.log('debug', `[${conversationKey}]`, `schedule message in ${seconds} seconds`, attempt ? `(${attempt}/${this.maxRetryAttempt})` : '');

      return setTimeout(async () => {
        try {
          const [key1, key2] = conversationKey.split(':');
          const instance1 = this.getInstance(key1);
          const instance2 = this.getInstance(key2);

          if (!instance1?.get('isActive') || !instance2?.get('isActive')) {
            throw new Error('One or more of the instances deactivated');
          }

          const currentState = this.activeConversation.get(conversationKey);
          const currentMessage = currentState?.find(({ sentAt }) => !sentAt);
          const currentIndex = currentState?.findIndex(({ sentAt }) => !sentAt);

          if (!currentState || !currentMessage || currentIndex === undefined) {
            await this.cleanupConversation(conversationKey);

            return;
          }

          if (this.isEmulation) {
            this.log('info', `[${conversationKey.split(':').join(' -> ')}] Emulator mode (${seconds}s)`, currentMessage.text);

            if (Math.random() > 0.8) {
              throw new Error('Emulate error');
            }

            currentMessage.sentAt = new Date();

            const remainingMessages = currentState.filter((msg) => !msg.sentAt);
            if (remainingMessages.length === 0) {
              this.log('debug', `[${conversationKey}]`, 'Conversation completed, cleaning up...');
              await this.cleanupConversation(conversationKey);

              return;
            }

            await new Promise((resolve) => setTimeout(resolve, delay + 1000));
            await this.handleConversationMessage(conversationKey);

            return;
          }

          // Format message properly for WhatsApp
          const messageContent = {
            type: 'text' as const,
            text: currentMessage.text,
          };
          // Send message using the now-humanized send method
          const instance = this.getInstance(currentMessage.fromNumber);
          if (instance) {
            await instance.send(currentMessage.toNumber, messageContent);
          } else {
            throw new Error(`Instance ${currentMessage.fromNumber} not found`);
          }
          currentMessage.sentAt = new Date();

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
        } catch (error) {
          if (attempt < this.maxRetryAttempt) {
            this.log('error', `[${conversationKey}]`, 'Retrying...');

            clearTimeout(this.timeoutConversation.get(conversationKey));
            this.timeoutConversation.set(conversationKey, send(attempt + 1));
          } else {
            this.log('error', `Failed to send message in conversation ${conversationKey}:`, error);

            await this.cleanupConversation(conversationKey);
          }
        }
      }, delay);
    };

    this.timeoutConversation.set(conversationKey, send());
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

  onMessage(callback?: WAMessageIncomingCallback) {
    super.onMessage(async (message: WAMessageIncoming, raw: WAMessageIncomingRaw) => {
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

      await callback?.(message, raw);
    });
  }
}
