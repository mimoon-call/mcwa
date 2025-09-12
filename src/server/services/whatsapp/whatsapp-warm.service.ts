import { WAMessageIncoming, WAMessageIncomingCallback, WAMessageIncomingRaw, WAMessageOutgoingCallback } from './whatsapp-instance.type';
import type { WAConversation, WAPersona, WAServiceConfig } from './whatsapp.type';
import { WhatsappAiService } from './whatsapp.ai';
import { WAInstance, WhatsappService } from './whatsapp.service';
import { WhatsAppMessage } from './whatsapp.db';
import { clearTimeout } from 'node:timers';

import getLocalTime from '@server/helpers/get-local-time';
import { WAActiveWarm, WAWarmUpdate } from '@server/services/whatsapp/whatsapp-warm.types';

type Config<T extends object> = WAServiceConfig<T> & { isEmulation?: boolean; warmUpOnReady?: boolean };

export class WhatsappWarmService extends WhatsappService<WAPersona> {
  private readonly ai = new WhatsappAiService();
  private readonly warmUpOnReady: boolean = false;
  private readonly isEmulation: boolean = false;
  private readonly activeConversation = new Map<string, WAConversation[]>();
  private readonly timeoutConversation = new Map<string, NodeJS.Timeout>();
  private readonly creatingConversation = new Set<string>(); // Track conversations being created
  private readonly maxRetryAttempt = 3;
  private dailyTimeWindow = [
    [6, 0],
    [9, 59],
  ];
  private dailyScheduleTimeHour = 9;
  private dailyScheduleTimeMinute = 0;
  private isWarming: boolean = false;
  private nextStartWarming: NodeJS.Timeout | undefined;
  private conversationEndCallback: ((data: WAWarmUpdate) => unknown) | undefined;
  private conversationStartCallback: ((data: WAWarmUpdate) => unknown) | undefined;
  private conversationActiveCallback: ((data: WAActiveWarm) => unknown) | undefined;
  private nextCheckUpdate: ((nextWarmAt: Date | null) => unknown) | undefined;
  private warmUpTimeout: NodeJS.Timeout | undefined;
  public nextWarmUp: Date | null = null;

  constructor({ isEmulation, warmUpOnReady, ...config }: Config<WAPersona>) {
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

    this.isEmulation = !!isEmulation;
    this.warmUpOnReady = !!warmUpOnReady;
  }

  private randomNextTimeWindow() {
    this.dailyScheduleTimeHour = this.randomDelayBetween(this.dailyTimeWindow[0][0], this.dailyTimeWindow[1][0]);
    this.dailyScheduleTimeMinute = this.randomDelayBetween(this.dailyTimeWindow[0][1], this.dailyTimeWindow[1][1]);
  }

  private getTodayDate(): string {
    // Get current time in Jerusalem timezone
    const now = getLocalTime();

    // If we're before the daily schedule time, consider it still "yesterday" for warm-up purposes
    if (
      now.getHours() < this.dailyScheduleTimeHour ||
      (now.getHours() === this.dailyScheduleTimeHour && now.getMinutes() < this.dailyScheduleTimeMinute)
    ) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }

    // If we're at or past the daily schedule time, return today's date
    return now.toISOString().split('T')[0];
  }

  private setWarmUpActive(value: boolean) {
    this.isWarming = value;

    if (!value) {
      this.nextWarmUp = null;
      this.nextCheckUpdate?.(null);
      clearTimeout(this.nextStartWarming);
    }
  }

  private getNextWarmingTime(): Date {
    const now = getLocalTime();
    let nextWarmingTime: Date;

    if (
      now.getHours() < this.dailyScheduleTimeHour ||
      (now.getHours() === this.dailyScheduleTimeHour && now.getMinutes() < this.dailyScheduleTimeMinute)
    ) {
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
    if (Math.random() < 0.8) return this.randomDelayBetween(min, max);

    return this.randomDelayBetween(min * 3, max * 3);
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
          },
        },
        { $project: { _id: 0, fromNumber: 1, toNumber: 1, text: 1, sentAt: '$createdAt' } },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
      ]);
    } catch (error) {
      this.log('error', 'Failed to get last messages from database:', error);

      return [];
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
    if (!personaA.phoneNumber) personaA.phoneNumber = instanceA.phoneNumber;
    if (!personaB.phoneNumber) personaB.phoneNumber = instanceB.phoneNumber;

    return await this.ai.generateConversation(personaA, personaB, minMessages, maxMessages, prevConversation);
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

    // Check if conversation is already active or being created and ensure neither phone number is involved in other conversations
    if (activeConversations.some((val) => val.includes(key1) || val.includes(key2)) || this.creatingConversation.has(conversationKey)) return;
    if (this.hasConflictingConversations(key1) || this.hasConflictingConversations(key2)) return;

    // Mark this conversation as being created to prevent race conditions
    this.creatingConversation.add(conversationKey);
    this.log('debug', `[${conversationKey}] Starting conversation creation...`);

    try {
      const [phoneNumber1, phoneNumber2] = conversationKey.split(':');
      const previousConversation = await this.getLastMessages(phoneNumber1, phoneNumber2);
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
    if (!this.isWarming) {
      this.stopWarmingUp();
    } else if (this.activeConversation.size === 0) {
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

  private async getWarmInstances(instances: WAInstance<WAPersona>[]) {
    const warmInstances: WAInstance<WAPersona>[] = [];
    const todayDate = this.getTodayDate();
    const actualToday = new Date().toISOString().split('T')[0]; // Real today's date

    for (const instance of instances) {
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

    if (!this.isWarming) {
      await this.cleanupConversation(conversationKey);

      return;
    }

    const send = (attempt: number = 0) => {
      const seconds = this.getRealisticDelay(5, 30) * (attempt + 1);
      const delay = seconds * 1000;

      this.log('debug', `[${conversationKey}]`, `schedule message in ${seconds} seconds`, attempt ? `(${attempt}/${this.maxRetryAttempt})` : '');

      return setTimeout(async () => {
        try {
          const [key1, key2] = conversationKey.split(':');
          const instance1 = this.getInstance(key1);
          const instance2 = this.getInstance(key2);

          if (!instance1?.get('isActive') || !instance2?.get('isActive')) throw new Error('One or more of the instances deactivated');

          const currentState = this.activeConversation.get(conversationKey);
          const currentMessage = currentState?.find(({ sentAt }) => !sentAt);
          const currentIndex = currentState?.findIndex(({ sentAt }) => !sentAt);

          if (!currentState || !currentMessage || currentIndex === undefined) {
            await this.cleanupConversation(conversationKey);

            return;
          }

          if (this.isEmulation) {
            this.log('debug', `[${conversationKey.split(':').join(' -> ')}] Emulator mode (${seconds}s)`, currentMessage.text);

            if (Math.random() > 0.8) throw new Error('Emulate error');

            currentMessage.sentAt = getLocalTime();
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

          const messageContent = { type: 'text' as const, text: currentMessage.text };
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

        this.setWarmUpActive(false);
        this.nextStartWarming = setTimeout(() => this.startWarmingUp(), timeUntilNextWarming);
        this.nextWarmUp = getLocalTime(nextWarmingTime);
        this.nextCheckUpdate?.(this.nextWarmUp);

        return;
      }

      this.log('debug', warmUpTodayInstances.map(({ phoneNumber }) => phoneNumber).join(','), `Start Warming Up ${warmUpTodayInstances.length}`);
      const instancesPairs = this.getAllUniquePairs('phoneNumber', warmUpTodayInstances, this.getFallbackInstance(allActiveInstances));
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

        await this.createConversation(pair);

        const setupDelay = 2000; // 2 seconds to ensure conversation is properly initialized
        await new Promise((resolve) => setTimeout(resolve, setupDelay));
      }
    } catch (error) {
      this.log('error', 'Error occurred', error);
      // Don't retry automatically - let the scheduled warming handle it
    }
  }

  public stopWarmingUp() {
    this.setWarmUpActive(false);

    Array.from([...this.timeoutConversation.values(), this.nextStartWarming]).forEach(clearTimeout);
    this.timeoutConversation.clear();
    this.activeConversation.clear();
    this.creatingConversation.clear(); // Clear conversations being created
  }

  onReady(callback: () => Promise<void> | void) {
    super.onReady(() => {
      clearTimeout(this.warmUpTimeout);
      if (this.warmUpOnReady) this.warmUpTimeout = setTimeout(() => this.startWarmingUp(), 5 * 1000);

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
