// whatsapp.service.ts
import type {
  WAAppAuth,
  WAInstanceConfig,
  WAMessageIncoming,
  WAMessageIncomingCallback,
  WAMessageIncomingRaw,
  WAOutgoingContent,
  WASendOptions,
} from './whatsapp-instance.type';
import type { WAServiceConfig } from './whatsapp.type';
import { WhatsappInstance } from './whatsapp-instance.service';
import getLocalTime from '@server/helpers/get-local-time';

// Re-export types for convenience
export { WAServiceConfig, WAInstanceConfig };

export type WAInstance<T extends object> = WhatsappInstance<T>;

export class WhatsappService<T extends object = Record<never, never>> {
  private lastUsedNumbers: string[] = [];
  private readonly debugMode: WAServiceConfig<T>['debugMode'];

  // Callbacks for message events
  private readonly outgoingMessageCallback: WAServiceConfig<T>['onOutgoingMessage'] | undefined;
  private readonly incomingMessageCallback: WAServiceConfig<T>['onIncomingMessage'] | undefined;
  private readonly messageUpdateCallback: WAServiceConfig<T>['onMessageUpdate'] | undefined;
  private readonly sendingMessageCallback: WAServiceConfig<T>['onSendingMessage'] | undefined;

  // Callbacks for auth key management
  protected readonly getAppAuth: WAServiceConfig<T>['getAppAuth'];
  protected readonly updateAppAuth: WAServiceConfig<T>['updateAppAuth'];
  protected readonly deleteAppAuth: WAServiceConfig<T>['deleteAppAuth'];
  protected readonly listAppAuth: WAServiceConfig<T>['listAppAuth'];

  // Callbacks for app key management
  protected readonly getAppKeys: WAServiceConfig<T>['getAppKeys'];
  protected readonly updateAppKey: WAServiceConfig<T>['updateAppKey'];

  // Instance management
  private readonly instances: Map<string, WAInstance<T>> = new Map();

  // Global callbacks
  private readonly messageCallback: WAMessageIncomingCallback[] = [];
  private readonly updateCallback: WAServiceConfig<T>['onUpdate'][] = [];
  private disconnectCallback?: WAServiceConfig<T>['onDisconnect'] | undefined;
  private registeredCallback?: WAServiceConfig<T>['onRegistered'];
  private readyCallback?: () => Promise<void> | void;

  // Constants
  private readonly MAX_DECRYPTION_RETRIES: number = 3;
  private readonly DECRYPTION_RETRY_DELAY: number = 1000;

  private suppressBaileysNoise() {
    // Define noise patterns to filter out
    const noisePatterns = [
      'Closing session: SessionEntry',
      'Closing open session in favor of incoming prekey bundle',
      'SessionEntry',
      'Closing stale open session',
      'Closing open session for new outgoing prekey bundle',
      'No matching sessions found for message',
      'SessionError',
      'Session error',
    ];

    // Override console.log to filter out Baileys noise
    const consoleLog = console.log;
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      if (noisePatterns.some((pattern: string) => message.includes(pattern))) return; // Suppress these messages

      consoleLog.apply(console, args);
    };

    // Also filter console.error for noise messages
    const consoleError = console.error;
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      if (noisePatterns.some((pattern: string) => message.includes(pattern))) return; // Suppress these messages

      consoleError.apply(console, args);
    };
  }

  constructor(config: WAServiceConfig<T>) {
    this.getAppAuth = config.getAppAuth;
    this.updateAppAuth = config.updateAppAuth;
    this.deleteAppAuth = config.deleteAppAuth;
    this.listAppAuth = config.listAppAuth;
    this.updateAppKey = config.updateAppKey;

    // Setup error handlers
    this.setupErrorHandlers();
    this.getAppKeys = config.getAppKeys;
    this.debugMode = config.debugMode;

    this.outgoingMessageCallback = (...arg) => {
      return config.onOutgoingMessage?.(...arg);
    };

    this.incomingMessageCallback = async (message, raw, ...arg) => {
      const internalPhoneNumber = (await this.listAppAuth()).map(({ phoneNumber }) => phoneNumber);
      const internalFlag = internalPhoneNumber.includes(message.fromNumber);

      setTimeout(
        () => {
          const fromInstance = this.instances.get(message.fromNumber);
          if (raw.key) {
            fromInstance?.read(raw.key);
          }
        },
        this.getRealisticDelay(500, 2000)
      );

      return Promise.allSettled([
        config.onIncomingMessage?.({ ...message, internalFlag }, raw, ...arg),
        ...this.messageCallback.map((cb) => cb?.({ ...message, internalFlag }, raw, ...arg)),
      ]);
    };

    this.messageUpdateCallback = (...arg) => config.onMessageUpdate?.(...arg);
    this.sendingMessageCallback = config.onSendingMessage;
    if (config.onUpdate) this.updateCallback.push(config.onUpdate);

    // Initialize the service immediately
    this.suppressBaileysNoise();
    this.setupGracefulShutdown();
    this.load();
  }

  protected randomDelayBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  protected getRealisticDelay(min: number, max: number): number {
    if (Math.random() < 0.8) return this.randomDelayBetween(min, max);

    return this.randomDelayBetween(min * 3, max * 3);
  }

  protected log(type: 'info' | 'warn' | 'error' | 'debug', name: string, ...args: any[]) {
    const isValid = Array.isArray(this.debugMode) ? this.debugMode.includes(type) : this.debugMode === type;

    if (this.debugMode === true || isValid) {
      const now = getLocalTime();
      const time = now.toTimeString().split(' ')[0];

      console[type](time, name, ...args);
    }
  }

  private async load() {
    const appAuths = await this.listAppAuth();
    const sessions = appAuths.map((auth) => auth.phoneNumber);
    this.log('info', 'Sessions:', sessions.join(', '));

    // Stagger connection attempts to prevent conflicts
    const connectionPromises = sessions.map((phoneNumber, index) => {
      const delay = index * this.getRealisticDelay(2000, 3000); // 2-3 second delay between each connection attempt

      return new Promise<void>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const instance = await this.createInstance(phoneNumber);
            await instance.connect();

            resolve();
          } catch (error: any) {
            reject(error.message);
          }
        }, delay);
      });
    });

    // Wait for all connections to complete (with timeout)
    Promise.allSettled(connectionPromises).then((results) => {
      // Log details of failed connections
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const phoneNumber = sessions[index];

          this.log('info', `[${phoneNumber}]`, result.reason);
        }
      });
    });
  }

  private setupGracefulShutdown() {
    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      this.log('info', 'whatsappService', 'Received SIGINT, shutting down gracefully...');
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.log('info', 'whatsappService', 'Received SIGTERM, shutting down gracefully...');
      this.cleanup();
      process.exit(0);
    });

    // Error handlers moved to setupErrorHandlers method for better control
  }

  private setupErrorHandlers() {
    process.on('SIGINT', () => {
      this.log('info', 'Received SIGINT, cleaning up...');
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('info', 'Received SIGTERM, cleaning up...');
      this.cleanup();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      this.log('error', 'whatsappService', 'Uncaught Exception:', error);

      // Log the error but don't exit immediately
      // Give the application a chance to recover
      this.log('error', 'whatsappService', 'Attempting to recover from uncaught exception...');

      try {
        this.cleanup();
      } catch (cleanupError) {
        this.log('error', 'whatsappService', 'Error during cleanup:', cleanupError);
      }

      // Only exit if this is a critical error that can't be recovered from
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('EADDRINUSE') || error.message?.includes('ENOTFOUND')) {
        this.log('error', 'whatsappService', 'Critical error detected, exiting...');
        process.exit(1);
      }
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.log('error', 'whatsappService', 'Unhandled Rejection at:', promise, 'reason:', reason);

      // Only exit for critical promise rejections that affect the entire service
      if (reason instanceof Error) {
        if (reason.message?.includes('ECONNREFUSED') || reason.message?.includes('EADDRINUSE') || reason.message?.includes('ENOTFOUND')) {
          this.log('error', 'whatsappService', 'Critical promise rejection detected, exiting...');
          process.exit(1);
        }
      }

      // For other rejections, just log and continue - let individual instances handle their own errors
      this.log('warn', 'whatsappService', 'Non-critical promise rejection, continuing...');
    });
  }

  private async createInstance(phoneNumber: string): Promise<WhatsappInstance<T>> {
    const config: WAInstanceConfig<T> = {
      debugMode: this.debugMode,
      getAppAuth: this.getAppAuth,
      updateAppAuth: this.updateAppAuth,
      deleteAppAuth: this.deleteAppAuth,
      getAppKeys: this.getAppKeys,
      updateAppKey: this.updateAppKey,
      onIncomingMessage: this.incomingMessageCallback,
      onOutgoingMessage: this.outgoingMessageCallback,
      onSendingMessage: this.sendingMessageCallback,
      onMessageUpdate: this.messageUpdateCallback,
      onReady: this.readyCallback,
      onRegistered: this.registeredCallback,
      onUpdate: (state: Partial<WAAppAuth<T>>) => Promise.allSettled(this.updateCallback.map((cb) => cb?.(state))),
      onRemove: (phoneNumber) => this.instances.delete(phoneNumber),
      onDisconnect: (phoneNumber, reason) => this.disconnectCallback?.(phoneNumber, reason),
    };

    const instance = new WhatsappInstance(phoneNumber, config);

    // Store the instance immediately when created
    this.instances.set(phoneNumber, instance);

    return instance;
  }

  async addInstanceQR(phoneNumber: string): Promise<{ qrCode: string; instance: WAInstance<T> }> {
    const instance = this.instances.get(phoneNumber);

    if (instance?.connected) {
      throw new Error(`Number [${phoneNumber}] is already registered and connected.`);
    } else if (instance?.get('statusCode') === 200) {
      throw new Error(`Number [${phoneNumber}] is already authenticated. Please restart the server or use it directly.`);
    }

    // Create new instance
    const newInstance = await this.createInstance(phoneNumber);
    const qrCode = await newInstance.register();
    await newInstance.update({ lastErrorAt: null, errorMessage: null, lastIpAddress: null } as WAAppAuth<T>);

    this.log('info', `[${phoneNumber}]`, '✅', 'Successfully added to active numbers list');

    return { qrCode, instance: newInstance };
  }

  listInstanceNumbers(data?: Partial<{ onlyConnectedFlag: boolean; activeFlag: boolean; hasWarmedUp: boolean; shuffleFlag: boolean }>): string[] {
    const { onlyConnectedFlag = true, hasWarmedUp, shuffleFlag, activeFlag } = data || {};

    const bulk = Array.from(this.instances.keys()).filter((phoneNumber) => {
      const instance = this.instances.get(phoneNumber);

      if (activeFlag && instance?.get('statusCode') !== 200) return false;
      if (onlyConnectedFlag && !instance?.connected) return false;
      if (hasWarmedUp && !instance?.get('hasWarmedUp')) return false;

      return true;
    });

    if (shuffleFlag) return bulk.shuffle();

    return bulk;
  }

  async sendMessage(fromNumber: string | null, toNumber: string, content: WAOutgoingContent, options?: WASendOptions) {
    const instance = (() => {
      if (fromNumber) {
        const selectedInstance = this.instances.get(fromNumber);

        if (!selectedInstance?.connected) {
          throw new Error(`Number [${fromNumber}] is already registered and connected.`);
        }

        return selectedInstance;
      }

      const warmedNumbers = this.listInstanceNumbers({ onlyConnectedFlag: true, hasWarmedUp: true });
      let availableNumbers: string[];
      availableNumbers = warmedNumbers.filter((num) => !this.lastUsedNumbers.includes(num));

      if (!availableNumbers.length) {
        this.lastUsedNumbers = [];

        availableNumbers = this.listInstanceNumbers({ onlyConnectedFlag: true, hasWarmedUp: true });
      }

      const randomSelected = availableNumbers.shuffle()?.[0];
      if (!randomSelected) throw new Error(`Instance not available to send message to ${toNumber}`);

      const selectedInstance = this.instances.get(randomSelected);
      if (!selectedInstance?.connected) throw new Error(`Number [${randomSelected}] is not connected.`);

      return selectedInstance;
    })();

    this.lastUsedNumbers.push(instance.phoneNumber);

    const result = await instance.send(toNumber, content, {
      maxRetries: this.MAX_DECRYPTION_RETRIES,
      retryDelay: this.DECRYPTION_RETRY_DELAY,
      trackDelivery: true,
      waitForDelivery: true,
      waitTimeout: 30000,
      ...(options || {}),
    });

    return { ...result, instanceNumber: instance.phoneNumber };
  }

  onMessage(callback: WAMessageIncomingCallback) {
    this.messageCallback.push(({ fromNumber, toNumber, ...message }: WAMessageIncoming, raw: WAMessageIncomingRaw, messageId: string) => {
      this.log('info', `[${fromNumber}]`, `Received message from ${fromNumber} to ${toNumber}:`, message.text);

      callback({ fromNumber, toNumber, ...message }, raw, messageId);
    });
  }

  onUpdate(callback: (state: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown) {
    this.updateCallback.push(callback);
  }

  onReady(callback: () => Promise<void> | void) {
    this.readyCallback = () => callback?.();
  }

  onDisconnect(callback: () => void) {
    this.disconnectCallback = callback;
  }

  onRegister(callback: (phoneNumber: string) => Promise<void> | void) {
    this.registeredCallback = callback;
  }

  // Get instance methods
  getInstance(phoneNumber: string): WAInstance<T> | undefined {
    return this.instances.get(phoneNumber);
  }

  getAllInstances(options?: Partial<{ shuffleFlag: boolean; activeFlag: boolean }>): WAInstance<T>[] {
    const { shuffleFlag = false, activeFlag = true } = options || {};
    const list = this.listInstanceNumbers({ activeFlag, onlyConnectedFlag: false });
    let instances = Array.from(this.instances.values());

    if (activeFlag) instances = instances.filter(({ phoneNumber }) => list.includes(phoneNumber));
    if (shuffleFlag) instances = instances.shuffle();

    return instances;
  }

  cleanup() {
    this.instances.clear();
  }
}
