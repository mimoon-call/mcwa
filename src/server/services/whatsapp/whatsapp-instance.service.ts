// whatsapp-instance.service.ts
import type {
  IMessage,
  IWebMessageInfo,
  WAAppAuth,
  WAInstanceConfig,
  WAMessageBlockCallback,
  WAMessageIncoming,
  WAMessageIncomingRaw,
  WAMessageOutgoing,
  WAMessageOutgoingRaw,
  WAOutgoingContent,
  WASendOptions,
  AuthenticationCreds,
  WebMessageInfo,
  WAMessageDelivery,
  WAMessageStatus,
} from './whatsapp-instance.type';
import {
  AnyMessageContent,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  makeWASocket,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import { pino } from 'pino';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { clearTimeout } from 'node:timers';
import getLocalTime from '@server/helpers/get-local-time';

type HandleOutgoingMessage = { jid: string; content: AnyMessageContent; record: WAMessageOutgoing };
type CreateSocketOptions = Partial<{ connectTimeoutMs: number; keepAliveIntervalMs: number; retryRequestDelayMs: number }>;

const silentLogger = pino({ level: 'silent', enabled: false });

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);

export class WhatsappInstance<T extends object = Record<never, never>> {
  private readonly TEMP_DIR: string;
  private readonly debugMode: WAInstanceConfig<T>['debugMode'];

  protected socket: WASocket | null = null;
  private saveCreds: (() => Promise<void>) | null = null;
  private appState: WAAppAuth<T> | null = null;
  private hasManualDisconnected: boolean = false;

  // Intervals
  private keepAliveInterval: NodeJS.Timeout | undefined = undefined;
  private healthCheckInterval: NodeJS.Timeout | undefined = undefined;

  // Message delivery tracking
  private messageDeliveries: Map<string, WAMessageDelivery> = new Map();
  private deliveryTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // Callbacks
  private readonly getAppAuth: () => Promise<WAAppAuth<T> | null>;
  private readonly updateAppAuth: (data: Partial<WAAppAuth<T>>) => Promise<WAAppAuth<T>>;
  private readonly deleteAppAuth: () => Promise<void>;
  private readonly updateAppKey: (keyType: string, keyId: string, data: Partial<any>) => Promise<void>;
  private readonly getAppKeys: () => Promise<any[]>;
  private readonly onRemove: () => Promise<unknown> | unknown;
  private readonly onIncomingMessage: (data: Omit<WAMessageIncoming, 'toNumber'>, raw: WAMessageIncomingRaw) => Promise<unknown> | unknown;
  private readonly onOutgoingMessage: (
    data: Omit<WAMessageOutgoing, 'fromNumber'>,
    raw: WAMessageOutgoingRaw,
    info?: WebMessageInfo,
    deliveryStatus?: WAMessageDelivery
  ) => Promise<unknown> | unknown;
  private readonly onMessageBlocked: WAMessageBlockCallback;
  private readonly onReady: (instance: WhatsappInstance<T>) => Promise<unknown> | unknown;
  private readonly onDisconnect: (reason: string) => Promise<unknown> | unknown;
  private readonly onError: (error: any) => Promise<unknown> | unknown;
  private readonly onUpdate: (data: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown;
  private readonly onRegister: () => Promise<unknown> | unknown;

  public readonly phoneNumber: string;
  public connected: boolean = false;
  private recovering: boolean = false;

  private humanDelayFor(text: string): number {
    const words = Math.max(1, text.split(/\s+/).length);
    const base = 800 + words * 220; // base typing time
    const jitter = Math.floor(Math.random() * 1200);
    return base + jitter; // 1–5s typical
  }

  private randomIdle(min = 800, max = 3500): number {
    return min + Math.floor(Math.random() * (max - min));
  }

  constructor(phoneNumber: string, config: WAInstanceConfig<T>) {
    this.TEMP_DIR = path.join(process.cwd(), config.tempDir || '.wa-auth-temp', phoneNumber);
    this.phoneNumber = phoneNumber;
    this.debugMode = config.debugMode;

    // Store callbacks
    this.getAppAuth = () => config.getAppAuth(phoneNumber);
    this.updateAppAuth = (data: Partial<WAAppAuth<T>>) => config.updateAppAuth(phoneNumber, data);
    this.deleteAppAuth = () => config.deleteAppAuth(phoneNumber);
    this.updateAppKey = (keyType: string, keyId: string, data: Partial<any>) => config.updateAppKey(phoneNumber, keyType, keyId, data);
    this.getAppKeys = () => config.getAppKeys(phoneNumber);

    // Event callbacks
    this.onRemove = () => config.onRemove?.(phoneNumber);
    this.onDisconnect = (reason: string) => config.onDisconnect?.(phoneNumber, reason);
    this.onIncomingMessage = (data, raw) => config.onIncomingMessage?.({ ...data, toNumber: phoneNumber }, raw);
    this.onOutgoingMessage = (data, raw, info, deliveryStatus) =>
      config.onOutgoingMessage?.({ ...data, fromNumber: phoneNumber }, raw, info, deliveryStatus);
    this.onMessageBlocked = async (fromNumber: string, toNumber: string, blockReason: string) => {
      await this.update({ blockedCount: (this.appState?.blockedCount || 0) + 1 } as WAAppAuth<T>);

      return config.onMessageBlocked?.(fromNumber, toNumber, blockReason);
    };
    this.onUpdate = (data: Partial<WAAppAuth<T>>) => {
      if (!data || !this.appState || !config.onUpdate) {
        return;
      }

      const updateKeys = Object.keys(data);
      const updateState = Object.entries(this.appState).reduce((acc: Partial<WAAppAuth<T>>, [key, value]) => {
        if (updateKeys.includes(key) || key === 'phoneNumber') {
          return { ...acc, [key]: value };
        }

        return acc;
      }, {});

      return config.onUpdate(updateState);
    };
    this.onError = async (error: any) => {
      this.log('error', 'Instance error', error);

      // Check if this is a MAC/decryption error, unsupported state error, or decrypt message error and attempt recovery
      const errorMessage = error?.message || '';
      if (
        errorMessage.includes('Bad MAC') ||
        errorMessage.includes('decrypt') ||
        errorMessage.includes('Unsupported state') ||
        errorMessage.includes('unable to authenticate data') ||
        errorMessage.includes('Failed to decrypt message')
      ) {
        this.log('warn', '🔐 MAC/decryption, unsupported state, or decrypt message error detected in onError, attempting recovery...');

        try {
          const recovered = await this.handleDecryptionError(error);
          if (recovered) {
            this.log('info', '✅ Error recovery successful via onError');
          } else {
            this.log('error', '❌ Error recovery failed via onError');
          }
        } catch (recoveryError) {
          this.log('error', '❌ Error during recovery via onError:', recoveryError);
        }
      }

      return config.onError?.(phoneNumber, error);
    };
    this.onReady = () => {
      this.log('info', '✅ Instance is ready');

      return config.onReady?.(this);
    };
    this.onRegister = () => config.onRegistered?.(this.phoneNumber);
  }

  protected log(type: 'info' | 'warn' | 'error' | 'debug', ...args: any[]) {
    const isValid = Array.isArray(this.debugMode) ? this.debugMode.includes(type) : this.debugMode === type;

    if (this.debugMode === true || isValid) {
      const now = getLocalTime();
      const time = now.toTimeString().split(' ')[0];
      console[type](time, `[${this.phoneNumber}]`, ...args);
    }
  }

  private unwrapMessage(msg?: IMessage): IMessage | null {
    let cur: IMessage | undefined | null = msg;

    while (cur?.ephemeralMessage?.message || cur?.viewOnceMessage?.message) {
      cur = cur.ephemeralMessage?.message ?? cur.viewOnceMessage?.message;
    }

    return cur || null;
  }

  private extractText(msg?: IMessage | null): string | null {
    if (!msg) return null;

    const m = this.unwrapMessage(msg);
    if (!m) return null;

    return (
      m.conversation ??
      m.extendedTextMessage?.text ??
      m.imageMessage?.caption ??
      m.videoMessage?.caption ??
      m.documentMessage?.caption ??
      // interactive replies:
      m.buttonsResponseMessage?.selectedDisplayText ??
      m.buttonsResponseMessage?.selectedButtonId ??
      m.listResponseMessage?.singleSelectReply?.selectedRowId ??
      m.reactionMessage?.text ??
      null
    );
  }

  private extractQuotedText(msg?: IMessage): string | null {
    const m = this.unwrapMessage(msg);
    const ctx = m?.extendedTextMessage?.contextInfo ?? m?.imageMessage?.contextInfo ?? m?.videoMessage?.contextInfo;
    const quoted = this.unwrapMessage(ctx?.quotedMessage as IMessage | undefined);

    return quoted ? this.extractText(quoted) : null;
  }

  private normalizeIncomingMessage(info: IWebMessageInfo, sock: WASocket): [WAMessageIncoming, WAMessageIncomingRaw] {
    const text = this.extractText(info.message) || '';
    const fromJid = info.key.remoteJid!;
    const toJid = sock.user!.id!;

    return [{ fromNumber: this.jidToNumber(fromJid), toNumber: this.jidToNumber(toJid), text }, info];
  }

  private handleOutgoingMessage(fromNumber: string, toNumber: string, payload: WAOutgoingContent): HandleOutgoingMessage {
    const jid = this.numberToJid(toNumber);

    let content: AnyMessageContent;
    let textForRecord = '';

    if (typeof payload === 'string') {
      const content = { type: 'text', text: payload };
      const record: WAMessageOutgoing = { fromNumber, toNumber, ...content };

      return { jid, record, content };
    }

    switch (payload.type) {
      case 'text':
        textForRecord = payload.text;
        content = { text: payload.text };
        break;

      case 'image':
      case 'video':
      case 'audio':
        textForRecord = payload.caption ?? '';
        content = { image: payload.data, caption: payload.caption, mimetype: payload.mimetype } as AnyMessageContent;
        break;

      case 'document':
        textForRecord = payload.caption ?? payload.fileName;
        content = { document: payload.data, fileName: payload.fileName, mimetype: payload.mimetype, caption: payload.caption } as AnyMessageContent;
        break;
    }

    const record: WAMessageOutgoing = { fromNumber, toNumber, text: textForRecord, ...content };

    return { jid, content, record };
  }

  private async cleanupAndRemoveTempDir(includeRecreateDirFlag: boolean = false) {
    try {
      const files = await readdir(this.TEMP_DIR);

      for (const file of files) {
        await unlink(path.join(this.TEMP_DIR, file));
      }

      await fs.promises.rmdir(this.TEMP_DIR);
    } catch {
      // Ignore cleanup errors
    }

    if (!includeRecreateDirFlag) {
      return;
    }

    try {
      await mkdir(this.TEMP_DIR, { recursive: true });
    } catch (_error) {
      // Directory might already exist
    }
  }

  private async state(forceReset: boolean = false): Promise<ReturnType<typeof useMultiFileAuthState>> {
    this.log('debug', 'Setting up authentication state...');

    // Convert Binary objects back to Buffer
    const convertBinaryToBuffer = (obj: any): any => {
      if (obj && typeof obj === 'object') {
        if (obj._bsontype === 'Binary') {
          return Buffer.from(obj.buffer);
        } else if (obj._type === 'Buffer' && obj.data) {
          return Buffer.from(obj.data, 'base64');
        } else if (Array.isArray(obj)) {
          return obj.map(convertBinaryToBuffer);
        }

        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = convertBinaryToBuffer(value);
        }

        return result;
      }
      return obj;
    };

    // Convert Buffer to a plain object for storage
    const convertBufferToPlain = (obj: any): any => {
      if (obj && typeof obj === 'object') {
        if (Buffer.isBuffer(obj)) {
          return { _type: 'Buffer', data: obj.toString('base64') };
        } else if (Array.isArray(obj)) {
          return obj.map(convertBufferToPlain);
        }

        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = convertBufferToPlain(value);
        }

        return result;
      }
      return obj;
    };

    // Cleanup temp dir
    await this.cleanupAndRemoveTempDir(true);

    // Check if we have existing data in database
    this.appState = await this.getAppAuth();

    if (forceReset) {
      await this.cleanupAndRemoveTempDir(true);
      await this.update({ isActive: true } as WAAppAuth<T>);
    }

    if (this.appState?.creds && !forceReset) {
      this.log('info', 'Restoring files from database');

      try {
        // Restore creds.json
        const creds = convertBinaryToBuffer(this.appState.creds);

        if (creds) {
          await writeFile(path.join(this.TEMP_DIR, 'creds.json'), JSON.stringify(creds, null, 2));

          // Restore all keys
          const keyDocs = await this.getAppKeys();

          for (const keyDoc of keyDocs) {
            const data = convertBinaryToBuffer(keyDoc.data);

            if (data) {
              const filename = `${keyDoc.keyType}-${keyDoc.keyId}.json`;
              await writeFile(path.join(this.TEMP_DIR, filename), JSON.stringify(data, null, 2));
            }
          }

          this.log('info', `✅ Restored ${keyDocs.length + 1} files`);
        } else {
          await this.deleteAppAuth();
          await this.cleanupAndRemoveTempDir();
          this.onRemove();

          this.log('warn', '⭕ Instance data was removed');
        }
      } catch (_error) {
        await this.cleanupAndRemoveTempDir(true);
        const creds = initAuthCreds();
        await writeFile(path.join(this.TEMP_DIR, 'creds.json'), JSON.stringify(creds, null, 2));
        this.log('info', 'Started fresh session due to restoration error');
      }
    } else {
      // Initialize new session
      this.log('info', 'Initializing new session');
      const creds = initAuthCreds();

      await writeFile(path.join(this.TEMP_DIR, 'creds.json'), JSON.stringify(creds, null, 2));
    }

    // Use the standard useMultiFileAuthState with our temp directory
    const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState(this.TEMP_DIR);

    // Track if this is a new session (not from database)
    const isNewSession = !this.appState;
    let hasBeenSavedToDatabase = false;

    const saveCreds = async () => {
      // Recover corrupted json
      const recoverCorruptedJson = <T>(jsonString: string): T | null => {
        let cleanedData = jsonString.trim();
        if (cleanedData.endsWith(',')) cleanedData = cleanedData.slice(0, -1);

        try {
          return JSON.parse(cleanedData);
        } catch (_parseError) {
          try {
            let braceCount = 0;
            let lastValidIndex = -1;

            for (let i = 0; i < cleanedData.length; i++) {
              if (cleanedData[i] === '{') {
                braceCount++;
              } else if (cleanedData[i] === '}') {
                braceCount--;

                if (braceCount === 0) lastValidIndex = i;
              }
            }

            if (lastValidIndex > 0) {
              const validJson = cleanedData.substring(0, lastValidIndex + 1);
              return JSON.parse(validJson);
            } else {
              throw new Error('Could not recover valid JSON structure');
            }
          } catch (_recoveryError) {
            throw new Error('Could not recover valid JSON structure');
          }
        }
      };

      // Read validate and recover json file
      const readJsonFile = async <T>(fileName: string = 'creds.json'): Promise<T> => {
        try {
          const filePath = path.join(this.TEMP_DIR, fileName);
          const fileData = await readFile(filePath, 'utf8');
          const json = recoverCorruptedJson<T>(fileData);

          if (!json) {
            throw new Error(`${fileName} file is broken`);
          }

          return json;
        } catch (_parseError) {
          this.log('warn', `Invalid JSON in ${fileName}, skipping registration check...`);

          throw new Error(`Invalid JSON in ${fileName}`);
        }
      };

      const handleFileChange = async () => {
        const fileList = await readdir(this.TEMP_DIR);

        // Save creds.json
        if (fileList.includes('creds.json')) {
          try {
            const creds = await readJsonFile<AuthenticationCreds>('creds.json');
            const credsForStorage = convertBufferToPlain(creds);

            await this.updateAppAuth({ creds: credsForStorage, ...(this.connected ? { statusCode: 200, errorMessage: null } : {}) } as WAAppAuth<T>);

            this.log('info', 'creds.json has been updated');
          } catch (error) {
            this.log('error', 'Error saving creds.json:', error);
          }
        }

        // Save keys
        for (const fileName of fileList) {
          if (fileName === 'creds.json') continue;

          try {
            const data = await readJsonFile<any>(fileName);

            const filenameWithoutExt = fileName.replace('.json', '');
            const [keyType, ...idParts] = filenameWithoutExt.split('-');
            const keyId = idParts.join('-');
            const dataForStorage = convertBufferToPlain(data);

            await this.updateAppKey(keyType, keyId, { keyType, keyId, data: dataForStorage, updatedAt: getLocalTime() });
          } catch (error) {
            this.log('error', `Error saving key file ${fileName}:`, error);
          }
        }
      };

      try {
        // Always call original saveCreds first to ensure temp files are updated
        await originalSaveCreds();

        // Only save to database if this is a new session and we haven't saved yet
        if (isNewSession && !hasBeenSavedToDatabase) {
          this.log('info', 'Checking if registration is complete...');

          const creds = await readJsonFile<AuthenticationCreds>('creds.json');

          // Check if registration is complete (has registered: true or me object) - EXACTLY like old version
          if (creds.registered || creds.me) {
            this.log('info', 'Registration complete, saving to database');
            this.onRegister();

            await handleFileChange();
            hasBeenSavedToDatabase = true;
          } else {
            this.log('info', 'Registration not complete yet, skipping database save');
          }
        } else if (!isNewSession) {
          this.log('info', 'Updating session data');

          await handleFileChange();
        }
      } catch (_error) {
        this.log('error', 'Error in saveCreds');

        await originalSaveCreds();
      }
    };

    return { state, saveCreds };
  }

  private numberToJid(phoneOrJid: string) {
    if (phoneOrJid.endsWith('@s.whatsapp.net')) return phoneOrJid;

    return `${phoneOrJid}@s.whatsapp.net`;
  }

  private jidToNumber(jidOrPhone: string) {
    if (jidOrPhone.endsWith('@s.whatsapp.net')) return jidOrPhone.split('@')[0];

    return jidOrPhone;
  }

  private getTodayDate(): string {
    return getLocalTime().toISOString().split('T')[0];
  }

  private shouldSkipRetry(errorCode?: number, reason?: string): boolean {
    // Skip retry for authentication/authorization errors or disabled
    if (errorCode === 401 || errorCode === 403 || this.appState?.isActive === false || this.hasManualDisconnected) return true;

    if (reason) {
      const lowerReason = reason.toLowerCase();
      return lowerReason.includes('401') || lowerReason.includes('403') || lowerReason.includes('unauthorized') || lowerReason.includes('forbidden');
    }

    return false;
  }

  private createSocketConfig(version: any, state: any, options: CreateSocketOptions = {}) {
    return {
      version,
      auth: state,
      logger: silentLogger,
      connectTimeoutMs: options.connectTimeoutMs || 30000,
      keepAliveIntervalMs: options.keepAliveIntervalMs || 25000,
      retryRequestDelayMs: options.retryRequestDelayMs || 1000,
      emitOwnEvents: false,
      shouldIgnoreJid: (jid: string) => (jid && jid.includes && jid.includes('@broadcast')) || false,
      patchMessageBeforeSending: (msg: any) => {
        const requiresPatch = !!(msg.buttonsMessage || msg.templateMessage || msg.listMessage);
        if (requiresPatch) {
          msg = { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} }, ...msg } } };
        }

        return msg;
      },
      // Reduce noise from Baileys internal operations
      printQRInTerminal: false,
    };
  }

  private async updateProfileUrl() {
    if (!this.socket || !this.socket.user?.id) return;

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const profilePictureUrl = await this.socket.profilePictureUrl(this.socket.user.id, 'image');
      await this.update({ profilePictureUrl } as WAAppAuth<T>);
      this.log('debug', 'Profile picture URL updated successfully');
    } catch {
      return;
    }
  }

  private async updateProfile(): Promise<void> {
    await this.updateProfileUrl();
    const name = (this.appState as any).name;
    const userName = this.socket?.user?.name;

    if (!this.socket || userName === name) return;

    try {
      await this.socket?.updateProfileName(name);
      this.log('info', `Name: Profile name set to ${name}`);
    } catch (_error) {
      this.log('warn', 'Failed to set profile settings');
    }
  }

  private async updatePrivacy(): Promise<void> {
    if (!this.socket || this.appState?.hasPrivacyUpdated) return;

    // Set privacy settings immediately after connection
    try {
      // Set last seen to "nobody" (invisible)
      await this.socket.updateLastSeenPrivacy('none');
      this.log('info', 'Privacy: Last seen set to invisible');

      // Set online status to invisible
      await this.socket.updateOnlinePrivacy('match_last_seen');
      this.log('info', 'Privacy: Online status set to invisible');

      await this.socket.updateGroupsAddPrivacy('contacts');
      this.log('info', 'Privacy: Add to groups enabled by contacts only');

      await this.update({ hasPrivacyUpdated: true } as WAAppAuth<T>);
    } catch (_error) {
      this.log('warn', 'Failed to set privacy settings');
    }
  }

  private setupEventHandlers(sock: WASocket) {
    const connectionUpdateHandler = async (update: any) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        this.log('info', 'Connected successfully');
        this.connected = true;

        // Start keep-alive and health check
        this.startKeepAlive();
        this.startHealthCheck();

        // Only trigger ready callback if session is actually ready (has valid credentials)
        if (this.appState?.creds?.me || this.appState?.creds?.registered) {
          await this.updatePrivacy();
          await this.updateProfile();

          // Trigger ready callback
          await this.onReady(this);
        } else {
          this.log('warn', 'Connection open but session not ready (no valid credentials)');
        }
      }

      if (connection === 'close') {
        this.connected = false;
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = (lastDisconnect?.error as Boom)?.message || 'Unknown';

        // Create a more descriptive reason that includes the error code
        const disconnectReason = code ? `${code}: ${reason}` : reason;

        this.update({ statusCode: code, errorMessage: reason } as WAAppAuth<T>);

        this.log('info', `Disconnected (${disconnectReason})`);

        // Log specific error types for better debugging
        if (code === 401) {
          this.log('error', '🚫 Unauthorized (401) - Authentication failed, this usually means invalid credentials');
        } else if (code === 403) {
          this.log('error', '🚫 Forbidden (403) - Access denied, this usually means insufficient permissions');
        }

        // Stop intervals
        this.stopKeepAlive();
        this.stopHealthCheck();

        // Trigger disconnect callback
        await this.handleInstanceDisconnect(disconnectReason);

        // Handle specific disconnect reasons
        if (code === DisconnectReason.loggedOut) {
          this.log('info', 'Logged out');
        }

        // Check if this was due to MAC/decryption errors, unsupported state errors, or decrypt message errors
        if (reason) {
          const isMacOrStateError =
            reason.includes('Bad MAC') ||
            reason.includes('decrypt') ||
            reason.includes('Unsupported state') ||
            reason.includes('unable to authenticate data') ||
            reason.includes('Failed to decrypt message');

          if (isMacOrStateError) {
            this.log('warn', '🔐 Disconnection due to MAC/decryption, unsupported state, or decrypt message error detected');

            // Attempt to recover from these errors
            try {
              const recovered = await this.handleDecryptionError({ message: reason });
              if (recovered) {
                this.log('info', '✅ Error recovery successful after disconnect');
              }
            } catch (recoveryError) {
              this.log('error', '❌ Error recovery failed after disconnect:', recoveryError);
            }
          }
        }
      }
    };
    const messagesUpsertHandler = async (msg: any) => {
      if (msg.type !== 'notify' || !msg.messages?.length) return;

      // optional: simple mutex to avoid overlapping recoveries
      if (!this.recovering) this.recovering = false;

      for (const message of msg.messages) {
        // Fast exits
        if (!message?.key || message.key.fromMe) continue;

        // Detect missing payload (common decryption symptom)
        const hasPayload = !!message.message;

        if (!hasPayload) {
          this.log('warn', '🔐 Detected null/undefined message, attempting recovery...');

          // Prevent recovery stampede
          if (this.recovering) {
            this.log('warn', '⏳ Recovery already in progress; skipping duplicate recovery for this batch');
            continue;
          }

          this.recovering = true;
          try {
            const refreshed = await this.refresh();

            if (refreshed) {
              this.log('info', '✅ Session synchronized due to decryption issues');
            } else {
              this.log('warn', '❌ Session sync failed, attempting aggressive recovery…');
              const recovered = await this.handleDecryptionError({
                message: 'Null/undefined message detected',
                details: { messageId: message.key?.id, from: message.key?.remoteJid },
              });
              if (recovered) this.log('info', '✅ Aggressive recovery successful');
            }
          } catch (err) {
            this.log('error', '❌ Error during decryption recovery:', err);
          } finally {
            this.recovering = false;
          }

          // Skip further processing for this specific message (can’t parse it anyway)
          continue;
        }

        // Update inbound counters only
        try {
          this.update({ incomingMessageCount: (this.appState?.incomingMessageCount || 0) + 1 } as WAAppAuth<T>);
        } catch (error) {
          this.log('error', '❌ Failed to update inbound counters:', error);
        }

        // Normalize & dispatch
        try {
          const [data, raw] = this.normalizeIncomingMessage(message, sock);
          this.onIncomingMessage(data, raw);
        } catch (error: any) {
          this.log('error', 'onIncomingMessage failed:', error);

          const msgText = String(error?.message || '');
          if (
            msgText.includes('Bad MAC') ||
            msgText.includes('decrypt') ||
            msgText.includes('MAC') ||
            msgText.includes('Unsupported state') ||
            msgText.includes('unable to authenticate data') ||
            msgText.includes('Failed to decrypt message')
          ) {
            this.log('warn', '🔐 MAC/decryption, unsupported state, or decrypt message error during processing, attempting recovery…');
            try {
              const recovered = await this.handleDecryptionError({
                message: msgText,
                details: { messageId: message.key?.id, from: message.key?.remoteJid },
              });
              if (recovered) this.log('info', '✅ Error recovery successful');
              else this.log('error', '❌ Error recovery failed');
            } catch (reErr) {
              this.log('error', '❌ Error during recovery:', reErr);
            }
          }
        }
      }
    };
    const messageUpdateHandler = async (updates: any) => {
      for (const update of updates) {
        const { key, update: updateData } = update;
        this.log('debug', `📱 Message update: ID=${key.id}, Status=${updateData.status}, RemoteJid=${key.remoteJid}`);

        // Update delivery tracking if message ID exists
        if (key.id && updateData.status !== undefined) {
          const statusMap: { [key: number]: WAMessageStatus } = { 1: 'PENDING', 2: 'SENT', 3: 'DELIVERED', 4: 'READ', 5: 'ERROR' }; // Map numeric status codes to string statuses
          const numericStatus = Number(updateData.status);
          const status = statusMap[numericStatus] || 'ERROR';
          const timestamp = new Date();

          this.log('info', `📱 Updating message status: ${key.id} -> ${status} (numeric: ${numericStatus})`);

          switch (status) {
            case 'SENT': {
              this.updateMessageDeliveryStatus(key.id, 'SENT', timestamp);
              break;
            }
            case 'DELIVERED': {
              this.updateMessageDeliveryStatus(key.id, 'DELIVERED', timestamp);
              const delivery = this.messageDeliveries.get(key.id);
              if (delivery) this.log('info', `✅ Message delivered to ${delivery.toNumber}`);
              break;
            }
            case 'READ': {
              this.updateMessageDeliveryStatus(key.id, 'READ', timestamp);
              const readDelivery = this.messageDeliveries.get(key.id);
              if (readDelivery) this.log('info', `👁️ Message read by ${readDelivery.toNumber}`);
              break;
            }
            case 'ERROR': {
              const errorCode = (updateData as any).statusCode;
              const errorMessage = (updateData as any).message || 'Unknown error';
              this.updateMessageDeliveryStatus(key.id, 'ERROR', timestamp, errorCode, errorMessage);

              // Handle specific error scenarios
              const toNumber = this.jidToNumber(key.remoteJid!);
              if (errorCode === 403) {
                this.log('error', `🚫 Message blocked - User ${toNumber} has blocked this number`);
                await this.handleMessageBlocked(toNumber, 'USER_BLOCKED');
              } else if (errorCode === 401) {
                this.log('error', `🚫 Message blocked - Authentication failed`);
                await this.handleMessageBlocked(toNumber, 'AUTH_FAILED');
              } else if (errorCode === 429) {
                this.log('error', `🚫 Message blocked - Rate limited`);
                await this.handleMessageBlocked(toNumber, 'RATE_LIMITED');
              } else {
                this.log('error', `🚫 Message blocked - Error code: ${errorCode}`);
                await this.handleMessageBlocked(toNumber, `ERROR_${errorCode}`);
              }
              break;
            }
          }
        }

        // Legacy logging for backward compatibility
        if (updateData.status && ['SENT', 'DELIVERED', 'READ'].includes(String(updateData.status))) {
          const toNumber = this.jidToNumber(key.remoteJid!);
          const status = String(updateData.status);
          this.log('info', `✅ Message ${status.toLowerCase()} to ${toNumber}`);
        }
      }
    };

    sock.ev.on('creds.update', () => this.saveCreds?.()); // Credentials update handler
    sock.ev.on('connection.update', connectionUpdateHandler); // Connection update handler
    sock.ev.on('messages.upsert', messagesUpsertHandler); // Consolidated messages handler with comprehensive error handling
    sock.ev.on('messages.update', messageUpdateHandler); // Add message status tracking
  }

  private async handleMessageBlocked(toNumber: string, blockReason: string): Promise<void> {
    try {
      await this.onMessageBlocked?.(this.phoneNumber, toNumber, blockReason);
    } catch (error) {
      this.log('error', 'Error handling blocked message:', error);
    }
  }

  private async handleInstanceDisconnect(reason: string, attempts: number = 1, maxRetry: number = 3) {
    // Check if this is an authentication/authorization error that shouldn't be retried
    if (this.shouldSkipRetry(undefined, reason)) {
      this.onDisconnect(reason);
      return;
    }

    if (attempts < maxRetry) {
      const delay = 15000; // 15 seconds
      setTimeout(async () => {
        try {
          await this.connect();
        } catch (_error) {
          this.log('warn', '🔄 Instance reconnect attempt', `${attempts + 1}/${maxRetry}`);

          await this.handleInstanceDisconnect(reason, attempts + 1, maxRetry);
        }
      }, delay);
    } else {
      this.log('error', '🚫 Max reconnection attempts reached', `${attempts}/${maxRetry}`, reason);

      this.onDisconnect(reason);
    }
  }

  private startKeepAlive() {
    this.stopKeepAlive();

    this.keepAliveInterval = setInterval(async () => {
      try {
        if (this.socket?.user && this.socket.user.id) {
          await this.socket.sendPresenceUpdate('available', this.socket.user.id);

          // Check if socket is healthy and update status code if needed
          if (this.connected) await this.update({ statusCode: 200, errorMessage: null } as WAAppAuth<T>);
        }
      } catch (error) {
        this.log('error', `Keep-alive failed:`, error);
      }
    }, 30000); // 30 seconds
  }

  private stopKeepAlive() {
    clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = undefined;
  }

  // Message delivery tracking methods
  private trackMessageDelivery(messageId: string, fromNumber: string, toNumber: string, options?: WASendOptions): void {
    if (!options?.trackDelivery) {
      this.log('debug', `📱 Delivery tracking disabled for message ${messageId}`);
      return;
    }

    this.log('info', `📱 Starting delivery tracking for message ${messageId} from ${fromNumber} to ${toNumber}`);

    const delivery: WAMessageDelivery = { messageId, fromNumber, toNumber, status: 'PENDING', sentAt: new Date() };
    this.messageDeliveries.set(messageId, delivery);
    this.log('debug', `📱 Delivery tracking started for message ${messageId}, total tracked: ${this.messageDeliveries.size}`);

    const trackingTimeout = options.deliveryTrackingTimeout || 30000; // Set delivery tracking timeout
    const timeoutId = setTimeout(() => this.handleDeliveryTimeout(messageId), trackingTimeout);

    this.deliveryTimeouts.set(messageId, timeoutId);
  }

  private updateMessageDeliveryStatus(messageId: string, status: WAMessageStatus, timestamp?: Date, errorCode?: number, errorMessage?: string): void {
    const delivery = this.messageDeliveries.get(messageId);
    if (!delivery) {
      this.log('warn', `📱 No delivery tracking found for message ${messageId} when updating status to ${status}`);
      return;
    }

    this.log('info', `📱 Updating delivery status for message ${messageId}: ${delivery.status} -> ${status}`);
    delivery.status = status;

    switch (status) {
      case 'DELIVERED':
        delivery.deliveredAt = timestamp || new Date();
        break;
      case 'READ':
        delivery.readAt = timestamp || new Date();
        break;
      case 'ERROR':
        delivery.errorCode = errorCode;
        delivery.errorMessage = errorMessage;
        break;
    }

    // Clear timeout if message is delivered or read
    if (['DELIVERED', 'READ'].includes(status)) {
      this.clearDeliveryTimeout(messageId);
    }
  }

  private handleDeliveryTimeout(messageId: string): void {
    this.updateMessageDeliveryStatus(messageId, 'ERROR', undefined, 408, 'Delivery timeout');
    this.clearDeliveryTimeout(messageId);
  }

  private clearDeliveryTimeout(messageId: string): void {
    const timeoutId = this.deliveryTimeouts.get(messageId);

    if (timeoutId) {
      clearTimeout(timeoutId);
      this.deliveryTimeouts.delete(messageId);
    }
  }

  // Public method to check message delivery status
  public getMessageDeliveryStatus(messageId: string): WAMessageDelivery | null {
    return this.messageDeliveries.get(messageId) || null;
  }

  // Wait for message to reach specific status
  private async waitForMessageStatus(messageId: string, options: WASendOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = options.waitTimeout || 30000;
      const targetStatus = options.waitForRead ? 'READ' : 'DELIVERED';

      // Set timeout for waiting
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${targetStatus} status after ${timeout}ms`));
      }, timeout);

      // Check if already at target status
      const currentDelivery = this.messageDeliveries.get(messageId);
      if (currentDelivery) {
        if (currentDelivery.status === targetStatus) {
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        // Check if we've already passed the target status
        if (targetStatus === 'DELIVERED' && currentDelivery.status === 'READ') {
          clearTimeout(timeoutId);
          resolve();
          return;
        }
      }

      // Create a one-time status checker
      const checkStatus = () => {
        const delivery = this.messageDeliveries.get(messageId);
        if (!delivery) return;

        if (delivery.status === targetStatus) {
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        // Check if we've already passed the target status
        if (targetStatus === 'DELIVERED' && delivery.status === 'READ') {
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        // Check if there was an error
        if (delivery.status === 'ERROR') {
          clearTimeout(timeoutId);
          const errorMessage = `Message delivery failed: ${delivery.errorMessage}`;

          if (options.throwOnDeliveryError) {
            reject(new Error(errorMessage));
          } else {
            // Log error but don't throw
            this.log('warn', `Delivery failed for message ${messageId}: ${errorMessage}`);
            resolve();
          }
          return;
        }
      };

      // Set up interval to check status
      const checkInterval = setInterval(() => {
        checkStatus();
      }, 1000); // Check every second

      // Clean up interval when promise resolves/rejects
      const cleanup = () => {
        clearInterval(checkInterval);
        clearTimeout(timeoutId);
      };

      // Override resolve/reject to clean up
      const originalResolve = resolve;
      const originalReject = reject;

      resolve = ((value: void) => {
        cleanup();
        originalResolve(value);
      }) as any;

      reject = ((reason: any) => {
        cleanup();
        originalReject(reason);
      }) as any;
    });
  }

  private startHealthCheck() {
    this.stopHealthCheck();

    this.healthCheckInterval = setInterval(async () => {
      try {
        // Try to send a presence update to check if connection is still alive
        if (this.socket?.user?.id) {
          await this.socket.sendPresenceUpdate('available', this.socket.user.id);

          // Check if socket is healthy and update status code if needed
          if (this.connected) {
            await this.update({ statusCode: 200, errorMessage: null } as WAAppAuth<T>);
          }
        }
      } catch (error) {
        this.log('error', 'Health check failed, connection may be dead:', error);

        this.onError(error);
      }
    }, 60000); // 60 seconds
  }

  private stopHealthCheck() {
    clearInterval(this.healthCheckInterval);
    this.healthCheckInterval = undefined;
  }

  /**
   * Register the instance (equivalent to addInstanceQR)
   * @returns Promise<string> - QR code data URL
   */
  async register(): Promise<string> {
    if (this.connected) throw new Error(`Number [${this.phoneNumber}] is already registered and connected.`);

    this.log('info', 'Starting registration process...');
    const { state, saveCreds } = await this.state(true);
    this.saveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion();
    this.log('info', `Using Baileys version: ${version}`);

    await saveCreds();
    this.log('info', 'Initial credentials saved');

    return new Promise((resolve) => {
      const connectionUpdateHandler = async (update: any) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
          const qrImage = await qrcode.toDataURL(qr);

          resolve(qrImage);
        }

        if (connection === 'open') {
          this.log('info', 'Connected');

          await this.updatePrivacy();
          await this.updateProfile();
          this.connected = true;

          // Start keep-alive and health check
          this.startKeepAlive();
          this.startHealthCheck();

          // Only trigger ready callback if session is actually ready (has valid credentials)
          if (this.appState?.creds?.me || this.appState?.creds?.registered) {
            // Trigger ready callback
            this.appState = await this.getAppAuth();
            await this.onReady(this);
          } else {
            this.log('warn', 'Connection open but session not ready (no valid credentials)');
          }

          this.log('info', '✅ Successfully added to active numbers list');
        }

        if (connection === 'close') {
          const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const reason = (lastDisconnect?.error as Boom)?.message || 'Unknown';
          const shouldReconnect = code !== DisconnectReason.loggedOut && !this.shouldSkipRetry(code, reason);

          this.log('info', `Disconnected during QR (${reason})`);

          if (this.appState?.statusCode !== code) {
            await this.update({ statusCode: code } as WAAppAuth<T>);
          }

          if (code === DisconnectReason.loggedOut) {
            this.log('info', 'Logged out');
          }

          if (this.shouldSkipRetry(code, reason)) {
            this.log('error', '🚫 Authentication/Authorization error during registration, skipping reconnection');
          } else if (shouldReconnect) {
            this.log('info', 'Registration completed but connection closed - attempting to restore connection...');
            this.onRegister();

            try {
              await this.connect();

              this.log('info', 'Connection restored successfully after registration');
            } catch (error) {
              this.log('warn', 'Failed to restore connection after registration:', error);
            }
          }
        }
      };

      this.log('info', 'Creating instance socket...');
      const socketConfig = this.createSocketConfig(version, state);
      const sock = makeWASocket(socketConfig);
      this.socket = sock;
      this.log('info', 'Socket created successfully');
      sock.ev.on('creds.update', () => this.saveCreds?.());
      sock.ev.on('connection.update', connectionUpdateHandler);
    });
  }

  /**
   * Restore existing instance
   */
  async connect(): Promise<void> {
    this.appState ??= await this.getAppAuth();

    if (this.connected) throw new Error('Already connected, skipping restore');
    if (this.appState?.isActive === false) return;

    this.log('info', 'Restoring session...');

    try {
      const { state, saveCreds } = await this.state();
      this.saveCreds = saveCreds;

      const { version } = await fetchLatestBaileysVersion();
      const sock = makeWASocket(
        this.createSocketConfig(version, state, { connectTimeoutMs: 30000, keepAliveIntervalMs: 25000, retryRequestDelayMs: 1000 })
      );

      this.socket = sock;
      this.setupEventHandlers(sock);

      // Wait for connection to establish with better timeout handling
      let connectionEstablished = false;
      const connectionTimeout = setTimeout(() => {
        if (!connectionEstablished) this.log('warn', 'Connection timeout, checking if session is valid...');
      }, 10000);

      // Wait for connection or timeout
      await new Promise<void>((resolve, reject) => {
        const checkConnection = () => {
          if (this.connected) {
            connectionEstablished = true;
            clearTimeout(connectionTimeout);
            resolve();
          } else if (this.socket?.user?.id) {
            // Check if we have user data, which indicates successful connection
            connectionEstablished = true;
            clearTimeout(connectionTimeout);
            this.connected = true;
            resolve();
          } else {
            setTimeout(checkConnection, 1000);
          }
        };

        checkConnection();

        // Overall timeout after 15 seconds
        setTimeout(() => {
          if (!connectionEstablished) {
            clearTimeout(connectionTimeout);
            reject(new Error('Connection timeout after 15 seconds'));
          }
        }, 15000);
      });

      if (this.connected) {
        this.hasManualDisconnected = false;
        this.log('info', 'Session restored successfully');
      } else {
        throw new Error('Failed to restore session');
      }
    } catch (error) {
      this.appState = await this.getAppAuth();

      if (!this.appState || !this.appState.creds || !this.appState.creds.me) {
        this.log('info', 'Session appears to be incomplete or new, removing from active instances');
        await this.handleIncompleteSession();

        return;
      }

      try {
        const credsPath = path.join(this.TEMP_DIR, 'creds.json');
        const credsData = await readFile(credsPath, 'utf8');
        const creds = JSON.parse(credsData);

        if (!creds.registered && !creds.me) {
          this.log('info', 'Current session files indicate incomplete registration');
          await this.handleIncompleteSession();

          return;
        }
      } catch (_error) {
        this.log('info', 'Could not read current session files, assuming incomplete');
        await this.handleIncompleteSession();

        return;
      }

      throw error;
    }
  }

  /**
   * Handle incomplete session by cleaning up files and removing from active instances
   */
  private async handleIncompleteSession(): Promise<void> {
    try {
      this.log('info', '🧹 Cleaning up incomplete session files...');

      // Reset instance state
      this.connected = false;
      this.socket = null;
      this.saveCreds = null;
      this.appState = null;

      this.log('info', '✅ Incomplete session cleanup completed');

      // Trigger removal callback to notify parent service
      await this.onRemove();
    } catch (cleanupError) {
      this.log('warn', 'Error during incomplete session cleanup:', cleanupError);
      // Even if cleanup fails, we still want to reset the instance state
      this.connected = false;
      this.socket = null;
      this.saveCreds = null;
      this.appState = null;
    }
  }

  /**
   * Send a message with human-like behavior (typing indicators, delays, presence)
   */
  async send(toNumber: string, payload: WAOutgoingContent, options?: WASendOptions): Promise<WebMessageInfo & Partial<WAMessageDelivery>> {
    if (!this.connected || !this.socket) throw new Error(`Instance is not connected`);
    if (this.appState?.isActive === false) throw new Error('Instance is not active');

    const { maxRetries = 3, retryDelay = 1000, onSuccess, onFailure } = options || {};
    let lastError: any;
    let attempts = 0;
    const { jid, content, record } = this.handleOutgoingMessage(this.phoneNumber, toNumber, payload);

    if ((typeof payload === 'object' && payload.type === 'text' && !payload.text) || (typeof payload === 'string' && !payload)) {
      throw new Error('Empty message');
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attempts = attempt;
      try {
        this.log('info', `Sending message to ${jid} (attempt ${attempt}/${maxRetries})`);

        const result: WebMessageInfo | undefined = await (async () => {
          if (!this.connected || !this.socket) throw new Error(`Instance is not connected`);

          await this.socket.presenceSubscribe(jid); // Subscribe to presence updates
          await this.socket.sendPresenceUpdate('composing', jid); // Send typing indicator
          const text = typeof payload === 'string' ? payload : (payload as any)?.text || ''; // Calculate human-like typing delay
          const typingDelay = this.humanDelayFor(text);

          await new Promise((resolve) => setTimeout(resolve, typingDelay));
          await this.socket.sendPresenceUpdate('paused', jid); // Send paused indicator
          const messageResult = await this.socket.sendMessage(jid, content); // Send the actual message
          if (options?.trackDelivery && messageResult?.key?.id) this.trackMessageDelivery(messageResult.key.id, this.phoneNumber, toNumber, options); // Track message delivery if enabled

          const idleTime = this.randomIdle(); // Add random idle time after sending
          await new Promise((resolve) => setTimeout(resolve, idleTime));

          return messageResult;
        })();

        this.log('info', `Message sent successfully to ${jid}`);

        // Wait for delivery confirmation if requested
        let deliveryStatus: WAMessageDelivery | null = null;
        if (options?.waitForDelivery || options?.waitForRead) {
          const messageId = result?.key?.id;
          if (messageId) {
            this.log('info', `Waiting for delivery confirmation for message ${messageId}...`);

            try {
              await this.waitForMessageStatus(messageId, options);
              this.log('info', `Message ${messageId} delivery confirmed`);
              deliveryStatus = this.getMessageDeliveryStatus(messageId);
            } catch (error) {
              this.log('warn', `Delivery confirmation timeout for message ${messageId}:`, error);
              deliveryStatus = this.getMessageDeliveryStatus(messageId);

              // Check if we should throw on delivery error
              if (options?.throwOnDeliveryError && deliveryStatus?.status === 'ERROR') {
                throw new Error(`Message delivery failed: ${deliveryStatus.errorMessage || 'Unknown error'}`);
              }
            }
          }
        }

        this.update({
          lastSentMessage: this.getTodayDate(),
          dailyMessageCount: this.appState?.lastSentMessage !== this.getTodayDate() ? 1 : (this.appState?.dailyMessageCount || 0) + 1,
          outgoingMessageCount: (this.appState?.outgoingMessageCount || 0) + 1,
        } as WAAppAuth<T>);

        // Trigger outgoing message callback
        try {
          await this.onOutgoingMessage?.(record, content, result, deliveryStatus || undefined);
        } catch (error) {
          this.log('error', 'Error in outgoing message callback:', error);
        }

        onSuccess?.(result);

        return { ...result, ...(deliveryStatus || {}) } as unknown as WebMessageInfo & Partial<WAMessageDelivery>;
      } catch (err: unknown) {
        lastError = err;

        // Enhanced error detection for blocks
        const errorMessage = (err as any)?.message || '';
        const errorCode = (err as any)?.output?.statusCode || (err as any)?.statusCode;

        // Detect specific block scenarios
        if (errorCode === 403 || errorMessage.includes('Forbidden')) {
          this.log('error', `🚫 User ${toNumber} has blocked this number`);
          await this.handleMessageBlocked(toNumber, 'USER_BLOCKED');
          throw new Error(`Message blocked: User has blocked this number`);
        }

        if (errorCode === 401 || errorMessage.includes('Unauthorized')) {
          this.log('error', `🚫 Authentication failed - account may be blocked`);
          await this.handleMessageBlocked(toNumber, 'AUTH_FAILED');
          throw new Error(`Message blocked: Authentication failed`);
        }

        if (errorCode === 429 || errorMessage.includes('Too Many Requests')) {
          this.log('error', `🚫 Rate limited - too many messages`);
          await this.handleMessageBlocked(toNumber, 'RATE_LIMITED');
          throw new Error(`Message blocked: Rate limited`);
        }

        this.log('error', `Send attempt ${attempt} failed:`, err);

        if (attempt < maxRetries) {
          const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          onFailure?.(lastError, attempt);
        }
      }
    }

    this.log('error', `All retry attempts failed for message to ${jid}`);

    options?.onFailure?.(lastError, attempts);
    throw lastError;
  }

  // Handle MAC/decryption errors by attempting to refresh the session, called when we encounter "Bad MAC" or decryption failures
  private async handleDecryptionError(error: any): Promise<boolean> {
    const errorMessage = error?.message || '';
    const isMacError = errorMessage.includes('Bad MAC') || errorMessage.includes('decrypt') || errorMessage.includes('MAC');
    const isUnsupportedStateError = errorMessage.includes('Unsupported state') || errorMessage.includes('unable to authenticate data');
    const isDecryptError = errorMessage.includes('Failed to decrypt message') || errorMessage.includes('decrypt message');

    if (!isMacError && !isUnsupportedStateError && !isDecryptError) {
      this.log('debug', 'Not a MAC, unsupported state, or decrypt error, skipping recovery:', errorMessage);
      return false;
    }

    this.log(
      'warn',
      `🔐 Detected ${isUnsupportedStateError ? 'unsupported state' : isDecryptError ? 'decrypt' : 'MAC'} error, attempting session refresh...`
    );

    try {
      // For unsupported state errors, try a more aggressive approach first
      if (isUnsupportedStateError) {
        this.log('info', '🔄 Unsupported state error detected, attempting aggressive session reset...');

        // Clear all temporary files and start fresh
        try {
          await this.cleanupAndRemoveTempDir(true);
          this.log('info', '🧹 Temporary files cleared for unsupported state recovery');
        } catch (cleanupError) {
          this.log('warn', '⚠️ Could not clear temp files, continuing with recovery:', cleanupError);
        }
      }

      // First try a simple refresh
      this.log('info', '🔄 Attempting simple session refresh...');
      const refreshSuccess = await this.refresh();

      if (refreshSuccess) {
        this.log(
          'info',
          `✅ Session refresh successful, ${isUnsupportedStateError ? 'unsupported state' : isDecryptError ? 'decrypt' : 'MAC'} error resolved`
        );
        return true;
      }

      // If simple refresh fails, try a more aggressive approach, Try to reconnect without logging out first
      this.log('warn', '🔄 Simple refresh failed, attempting session reconnection...');
      this.log('info', '🔄 Attempting to reconnect without logout...');

      try {
        // Clear socket reference but keep credentials
        this.socket = null;
        this.connected = false;

        // Wait a bit before attempting restore
        this.log('debug', 'Waiting 2 seconds before restore attempt...');
        await new Promise((resolve) => setTimeout(resolve, 2000));

        this.log('info', '🔄 Attempting session restore...');
        await this.connect();
        this.log(
          'info',
          `✅ Session reconnection successful after ${isUnsupportedStateError ? 'unsupported state' : isDecryptError ? 'decrypt' : 'MAC'} error`
        );
        return true;
      } catch (restoreError) {
        this.log(
          'error',
          `❌ Session reconnection failed after ${isUnsupportedStateError ? 'unsupported state' : isDecryptError ? 'decrypt' : 'MAC'} error:`,
          restoreError
        );

        // If restore fails, try one more time with a fresh socket
        this.log('info', '🔄 First restore failed, trying with fresh socket...');
        try {
          this.socket = null;
          this.connected = false;

          // Wait a bit longer before second attempt
          await new Promise((resolve) => setTimeout(resolve, 3000));

          await this.connect();
          this.log('info', `✅ Session reconnection successful on second attempt`);
          return true;
        } catch (secondRestoreError) {
          this.log('error', '❌ Second restore attempt also failed:', secondRestoreError);

          // For unsupported state or decrypt errors, try to clear credentials and re-register
          if (isUnsupportedStateError || isDecryptError) {
            this.log('warn', `🔄 ${isDecryptError ? 'Decrypt' : 'Unsupported state'} error persists, attempting credential reset...`);
            try {
              // Clear credentials and force re-registration
              await this.deleteAppAuth();
              await this.cleanupAndRemoveTempDir(false);

              this.log('info', '🧹 Credentials cleared, instance will need re-registration');

              // Update status to indicate need for re-authentication
              const errorType = isDecryptError ? 'decrypt' : 'unsupported state';
              await this.update({
                statusCode: 401,
                errorMessage: `Session corrupted (${errorType}), please re-authenticate`,
              } as Partial<WAAppAuth<T>>);

              // Disable the instance
              await this.disable();

              return false;
            } catch (resetError) {
              this.log('error', '❌ Failed to reset credentials:', resetError);
            }
          }

          // Clear everything and try to register again
          this.socket = null;
          this.connected = false;

          await this.update({
            statusCode: 500,
            errorMessage: `Recovery failed: ${(secondRestoreError as any)?.message || 'Unknown error'}`,
          } as Partial<WAAppAuth<T>>);

          await this.disable();

          return false;
        }
      }
    } catch (refreshError) {
      this.log(
        'error',
        `❌ Failed to handle ${isUnsupportedStateError ? 'unsupported state' : isDecryptError ? 'decrypt' : 'MAC'} error:`,
        refreshError
      );

      // Update status to indicate recovery failure
      const errorType = isUnsupportedStateError ? 'unsupported state' : isDecryptError ? 'decrypt' : 'MAC';
      await this.update({
        statusCode: 500,
        errorMessage: `${errorType} error recovery failed: ${(refreshError as any)?.message || 'Unknown error'}`,
      } as Partial<WAAppAuth<T>>);

      return false;
    }
  }

  /**
   * Enhanced refresh method with better error handling
   */
  async refresh(): Promise<boolean> {
    try {
      if (this.socket?.user?.id) {
        // Try to send a presence update to check if connection is alive
        await this.socket.sendPresenceUpdate('available', this.socket.user.id);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (this.socket.user?.id) {
          this.log('info', '🔄 Session synchronization successful');

          return true;
        }
      }
      return false;
    } catch (error) {
      this.log('error', 'Failed to refresh session:', error);
      return false;
    }
  }

  /**
   * Public method to manually trigger MAC error recovery
   * This can be called externally to attempt recovery from MAC errors
   */
  async recoverFromMacError(): Promise<boolean> {
    this.log('info', '🔄 Manual MAC error recovery triggered');

    try {
      const recovered = await this.handleDecryptionError({ message: 'Manual recovery triggered' });

      if (recovered) {
        this.log('info', '✅ Manual MAC error recovery successful');
      } else {
        this.log('error', '❌ Manual MAC error recovery failed');
      }

      return recovered;
    } catch (error) {
      this.log('error', '❌ Error during manual MAC error recovery:', error);
      return false;
    }
  }

  /**
   * Public method to manually trigger decrypt message error recovery
   * This can be called externally to attempt recovery from decrypt errors
   */
  async recoverFromDecryptError(): Promise<boolean> {
    this.log('info', '🔄 Manual decrypt error recovery triggered');

    try {
      const recovered = await this.handleDecryptionError({ message: 'Failed to decrypt message - Manual recovery triggered' });

      if (recovered) {
        this.log('info', '✅ Manual decrypt error recovery successful');
      } else {
        this.log('error', '❌ Manual decrypt error recovery failed');
      }

      return recovered;
    } catch (error) {
      this.log('error', '❌ Error during manual decrypt error recovery:', error);
      return false;
    }
  }

  /**
   * Remove the instance
   */
  async remove(clearData: boolean = false, delay: number = 5000): Promise<void> {
    try {
      // Check if this was an incomplete registration that should be cleaned up
      try {
        const credsPath = path.join(this.TEMP_DIR, 'creds.json');
        const credsData = await readFile(credsPath, 'utf8');
        const creds = JSON.parse(credsData);

        if (!creds.registered && !creds.me) {
          this.log('info', 'Detected incomplete registration, cleaning up from database');
        }
      } catch (_error) {
        this.log('info', 'Could not check registration status, assuming incomplete');
      }

      // Stop all background processes
      this.stopKeepAlive();
      this.stopHealthCheck();

      // Logout if socket is valid
      if (this.socket && typeof this.socket.logout === 'function') {
        try {
          await this.socket.logout();
          this.log('info', 'Successfully logged out');
        } catch (logoutError: any) {
          if (logoutError?.output?.payload?.message === 'Connection Closed') {
            this.log('debug', 'Socket already closed, skipping logout');
          } else {
            this.log('warn', 'Logout failed:', logoutError);
          }
        }
      }

      // Clear data if requested
      if (clearData) {
        this.log('info', 'Clearing session data from database...');
        await this.cleanupAndRemoveTempDir();
        await this.deleteAppAuth();
        this.log('info', 'Session data cleared successfully');
      }

      this.connected = false;
      this.socket = null;
      this.saveCreds = null;

      await this.onRemove();
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      this.log('warn', 'Failed to cleanup instance:', error);
    }
  }

  /**
   * Disconnect the instance gracefully
   * @param logout - Whether to logout from WhatsApp (default: true)
   * @param clearSocket - Whether to clear the socket reference (default: false)
   * @param reason - Optional reason for disconnection
   */
  async disconnect(logout: boolean = true, clearSocket: boolean = false, reason: string = 'Manual disconnect'): Promise<void> {
    try {
      this.log('info', '🔄 Initiating manual disconnect...');

      // Stop all background processes
      this.stopKeepAlive();
      this.stopHealthCheck();
      this.hasManualDisconnected = true;

      // Logout if requested and socket is valid
      if (logout && this.socket && typeof this.socket.logout === 'function') {
        try {
          await this.socket.logout();
          this.log('info', '✅ Successfully logged out from WhatsApp');
        } catch (logoutError: any) {
          if (logoutError?.output?.payload?.message === 'Connection Closed') {
            this.log('debug', 'Socket already closed, skipping logout');
          } else {
            this.log('warn', '⚠️ Logout failed:', logoutError);
          }
        }
      } else if (!logout) {
        this.log('info', ' ℹ️Skipping logout as requested');
      }

      // Update connection state
      this.connected = false;

      // Clear socket reference if requested
      if (clearSocket) {
        this.socket = null;
        this.log('info', 'Socket reference cleared');
      }

      // Trigger disconnect callback
      await this.onDisconnect(reason);

      this.log('info', '✅ Disconnect completed successfully');
    } catch (error) {
      this.log('error', '❌ Error during disconnect:', error);
      throw error;
    }
  }

  async enable() {
    await this.update({ isActive: true } as WAAppAuth<T>);
    await this.connect();
  }

  async disable() {
    await this.update({ isActive: false } as WAAppAuth<T>);
    await this.disconnect(false);
  }

  async update(data: Partial<WAAppAuth<T>>): Promise<void> {
    if (Object.entries(data).some(([key, value]) => this.appState?.[key as keyof typeof this.appState] !== value)) {
      this.set(data);

      this.set((await this.updateAppAuth(data)) || this.appState);
      this.onUpdate(data);
    }
  }

  set(data: Partial<WAAppAuth<T>>): void {
    this.appState = { ...(this.appState || {}), ...data } as WAAppAuth<T>;
  }

  get(key?: keyof WAAppAuth<T>) {
    const appState = this.appState || ({} as WAAppAuth<T>);

    return key ? appState[key] : (appState as WAAppAuth<T>);
  }

  cleanup(): void {
    this.log('info', 'Cleaning up instance...');
    this.stopKeepAlive();
    this.stopHealthCheck();

    // Clear all delivery timeouts
    for (const timeoutId of this.deliveryTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.deliveryTimeouts.clear();
    this.messageDeliveries.clear();

    this.connected = false;
    this.socket = null;
    this.saveCreds = null;
    this.log('info', 'Instance cleanup completed');
  }
}
