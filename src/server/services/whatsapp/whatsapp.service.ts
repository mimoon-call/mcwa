// whatsapp.service.ts
import type {
  WAAppAuth,
  WAInstanceConfig,
  WAMessageIncoming,
  WAMessageIncomingCallback,
  WAMessageIncomingRaw,
  WAMessageOutgoing,
  WAMessageOutgoingRaw,
  WAOutgoingContent,
  WebMessageInfo,
} from './whatsapp-instance.type';
import type { WAServiceConfig } from './whatsapp.type';
import { WhatsappInstance } from './whatsapp-instance.service';
import { clearTimeout } from 'node:timers';

// Re-export types for convenience
export { WAServiceConfig, WAInstanceConfig };

export type WAInstance<T extends object> = WhatsappInstance<T>;

export class WhatsappService<T extends object = Record<never, never>> {
  private lastUsedNumbers: string[] = [];
  private readonly debugMode: WAServiceConfig<T>['debugMode'];

  // Callbacks for message events
  private readonly outgoingMessageCallback: WAServiceConfig<T>['onOutgoingMessage'] | undefined;
  private readonly incomingMessageCallback: WAServiceConfig<T>['onIncomingMessage'] | undefined;

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
  private registeredCallback?: WAServiceConfig<T>['onRegistered'];
  private readyCallback?: () => Promise<void> | void;
  private clientRemovalCallback?: (phoneNumber: string) => void;

  // Timeout
  private readyTimeout: NodeJS.Timeout | undefined = undefined;

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

      if (noisePatterns.some((pattern: string) => message.includes(pattern))) {
        return; // Suppress these messages
      }

      consoleLog.apply(console, args);
    };

    // Also filter console.error for noise messages
    const consoleError = console.error;
    console.error = (...args: any[]) => {
      const message = args.join(' ');

      if (noisePatterns.some((pattern: string) => message.includes(pattern))) {
        return; // Suppress these messages
      }

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

    this.outgoingMessageCallback = (data: WAMessageOutgoing, raw: WAMessageOutgoingRaw, info?: WebMessageInfo) => {
      return config.onOutgoingMessage?.(data, raw, info);
    };

    this.incomingMessageCallback = async (data: WAMessageIncoming, raw: WAMessageIncomingRaw) => {
      return Promise.allSettled([config.onIncomingMessage?.(data, raw), ...this.messageCallback.map((cb) => cb?.(data, raw))]);
    };

    if (config.onUpdate) {
      this.updateCallback.push(config.onUpdate);
    }

    // Initialize the service immediately
    this.suppressBaileysNoise();
    this.setupGracefulShutdown();
    this.load();
  }

  protected log(type: 'info' | 'warn' | 'error' | 'debug', name: string, ...args: any[]) {
    const isValid = Array.isArray(this.debugMode) ? this.debugMode.includes(type) : this.debugMode === type;

    if (this.debugMode === true || isValid) {
      const now = new Date();
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
      const delay = index * 2000; // 2 second delay between each connection attempt

      return new Promise<void>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const instance = await this.createInstance(phoneNumber);

            if (!instance.connected) {
              await instance.connect();
            }

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

          this.log('warn', `[${phoneNumber}]`, result.reason);
        }
      });
    });
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
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
      onReady: this.readyCallback,
      onRegistered: this.registeredCallback,
      onUpdate: (state: Partial<WAAppAuth<T>>) => Promise.allSettled(this.updateCallback.map((cb) => cb?.(state))),
      onRemove: (phoneNumber) => this.instances.delete(phoneNumber),
    };

    const instance = new WhatsappInstance(phoneNumber, config);

    // Store the instance immediately when created
    this.instances.set(phoneNumber, instance);

    return instance;
  }

  async addInstanceQR(phoneNumber: string): Promise<string> {
    const instance = this.instances.get(phoneNumber);

    if (instance?.connected) {
      throw new Error(`Number [${phoneNumber}] is already registered and connected.`);
    } else if (instance?.get('statusCode') === 200) {
      throw new Error(`Number [${phoneNumber}] is already authenticated. Please restart the server or use it directly.`);
    }

    // Create new instance
    const newInstance = await this.createInstance(phoneNumber);

    // Register the instance (this will generate QR code)
    const qrCode = await newInstance.register();

    this.log('info', `[${phoneNumber}]`, '✅', 'Successfully added to active numbers list');

    return qrCode;
  }

  listInstanceNumbers(data?: Partial<{ onlyConnectedFlag: boolean; activeFlag: boolean; hasWarmedUp: boolean; shuffleFlag: boolean }>): string[] {
    const { onlyConnectedFlag = true, hasWarmedUp, shuffleFlag, activeFlag } = data || {};

    const bulk = Array.from(this.instances.keys()).filter((phoneNumber) => {
      const instance = this.instances.get(phoneNumber);

      if (activeFlag && instance?.get('statusCode') !== 200) {
        return false;
      }

      if (onlyConnectedFlag && !instance?.connected) {
        return false;
      }

      if (hasWarmedUp && !instance?.get('hasWarmedUp')) {
        return false;
      }

      return true;
    });

    if (shuffleFlag) {
      return this.shuffleArray(bulk);
    }

    return bulk;
  }

  async sendMessage(fromNumber: string | null, toNumber: string, content: WAOutgoingContent) {
    const instance = (() => {
      if (fromNumber) {
        const selectedInstance = this.instances.get(fromNumber);

        if (!selectedInstance?.connected) {
          throw new Error(`Number [${fromNumber}] is already registered and connected.`);
        }

        return selectedInstance;
      }

      let availableNumbers: string[];
      availableNumbers = this.listInstanceNumbers({ onlyConnectedFlag: true, hasWarmedUp: true }).filter(
        (num) => !this.lastUsedNumbers.includes(num)
      );

      if (!availableNumbers.length) {
        this.lastUsedNumbers = [];
      }

      availableNumbers = this.listInstanceNumbers({ onlyConnectedFlag: true, hasWarmedUp: true }).filter(
        (num) => !this.lastUsedNumbers.includes(num)
      );

      if (!availableNumbers[0]) {
        throw new Error(`Instance not available to send message to ${toNumber}`);
      }

      const selectedInstance = this.instances.get(availableNumbers[0]);

      if (!selectedInstance?.connected) {
        throw new Error(`Number [${availableNumbers[0]}] is not connected.`);
      }

      return selectedInstance;
    })();

    // Use the enhanced send method with built-in retry logic and callbacks
    await instance.send(toNumber, content, { maxRetries: this.MAX_DECRYPTION_RETRIES, retryDelay: this.DECRYPTION_RETRY_DELAY });
    this.lastUsedNumbers.push(instance.phoneNumber);

    return { instanceNumber: instance.phoneNumber, toNumber, content };
  }

  onMessage(callback: WAMessageIncomingCallback) {
    this.messageCallback.push(({ fromNumber, toNumber, ...message }: WAMessageIncoming, raw: WAMessageIncomingRaw) => {
      this.log('info', `[${fromNumber}]`, `Received message from ${fromNumber} to ${toNumber}:`, message.text);

      callback({ fromNumber, toNumber, ...message }, raw);
    });
  }

  onUpdate(callback: (state: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown) {
    this.updateCallback.push(callback);
  }

  onReady(callback: () => Promise<void> | void) {
    this.readyCallback = () => {
      clearTimeout(this.readyTimeout);

      this.readyTimeout = setTimeout(() => {
        const allInstances = this.getAllInstances({ activeFlag: false });
        const allActiveInstances = this.getAllInstances({ activeFlag: true });

        this.log('debug', `Active instances: ${allActiveInstances.length}/${allInstances.length}`);
        callback?.();
      }, 5000);
    };
  }

  onRegister(callback: (phoneNumber: string) => Promise<void> | void) {
    this.registeredCallback = callback;
  }

  onClientRemoval(callback: (number: string) => void) {
    this.clientRemovalCallback = callback;
  }

  // Get instance methods
  getInstance(phoneNumber: string): WAInstance<T> | undefined {
    return this.instances.get(phoneNumber);
  }

  getAllInstances(options?: Partial<{ shuffleFlag: boolean; activeFlag: boolean }>): WAInstance<T>[] {
    const { shuffleFlag = false, activeFlag = true } = options || {};
    const list = this.listInstanceNumbers({ activeFlag, onlyConnectedFlag: false });
    let instances = Array.from(this.instances.values());

    if (activeFlag) {
      instances = instances.filter(({ phoneNumber }) => list.includes(phoneNumber));
    }

    if (shuffleFlag) {
      instances = this.shuffleArray(instances);
    }

    return instances;
  }

  cleanup() {
    this.log('info', 'Cleaning up WhatsApp service...');

    // Clear all tracking
    this.instances.clear();

    this.log('info', 'WhatsApp service cleanup completed');
  }
}
