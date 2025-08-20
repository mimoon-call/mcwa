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

  // Callbacks
  private readonly getAppAuth: () => Promise<WAAppAuth<T> | null>;
  private readonly updateAppAuth: (data: Partial<WAAppAuth<T>>, clientName: string | null) => Promise<WAAppAuth<T>>;
  private readonly deleteAppAuth: () => Promise<void>;
  private readonly updateAppKey: (keyType: string, keyId: string, data: Partial<any>) => Promise<void>;
  private readonly getAppKeys: () => Promise<any[]>;
  private readonly onRemove: () => Promise<unknown> | unknown;
  private readonly onIncomingMessage: (data: Omit<WAMessageIncoming, 'toNumber'>, raw: WAMessageIncomingRaw) => Promise<unknown> | unknown;
  private readonly onOutgoingMessage: (data: Omit<WAMessageOutgoing, 'fromNumber'>, raw: WAMessageOutgoingRaw) => Promise<unknown> | unknown;
  private readonly onMessageBlocked: WAMessageBlockCallback;
  private readonly onReady: (instance: WhatsappInstance<T>) => Promise<unknown> | unknown;
  private readonly onDisconnect: (reason: string) => Promise<unknown> | unknown;
  private readonly onError: (error: any) => Promise<unknown> | unknown;
  private readonly onUpdate: (data: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown;

  public readonly phoneNumber: string;
  public connected: boolean = false;
  private recovering: boolean = false;

  constructor(phoneNumber: string, config: WAInstanceConfig<T>) {
    this.TEMP_DIR = path.join(process.cwd(), config.tempDir || '.wa-auth-temp', phoneNumber);
    this.phoneNumber = phoneNumber;
    this.debugMode = config.debugMode;

    // Store callbacks
    this.getAppAuth = () => config.getAppAuth(phoneNumber);
    this.updateAppAuth = (data: Partial<WAAppAuth<T>>, clientName: string | null) => config.updateAppAuth(phoneNumber, data, clientName);
    this.deleteAppAuth = () => config.deleteAppAuth(phoneNumber);
    this.updateAppKey = (keyType: string, keyId: string, data: Partial<any>) => config.updateAppKey(phoneNumber, keyType, keyId, data);
    this.getAppKeys = () => config.getAppKeys(phoneNumber);

    // Event callbacks
    this.onRemove = () => config.onRemove?.(phoneNumber);
    this.onDisconnect = (reason: string) => config.onDisconnect?.(phoneNumber, reason);
    this.onIncomingMessage = (data, raw) => config.onIncomingMessage?.({ ...data, toNumber: phoneNumber }, raw);
    this.onOutgoingMessage = (data, raw) => config.onOutgoingMessage?.({ ...data, fromNumber: phoneNumber }, raw);
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

      // Check if this is a MAC/decryption error and attempt recovery
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Bad MAC') || errorMessage.includes('decrypt')) {
        this.log('warn', '🔐 MAC/decryption error detected in onError, attempting recovery...');

        try {
          const recovered = await this.handleDecryptionError(error);
          if (recovered) {
            this.log('info', '✅ MAC error recovery successful via onError');
          } else {
            this.log('error', '❌ MAC error recovery failed via onError');
          }
        } catch (recoveryError) {
          this.log('error', '❌ Error during MAC error recovery via onError:', recoveryError);
        }
      }

      return config.onError?.(phoneNumber, error);
    };
    this.onReady = () => {
      this.log('info', '✅ Instance is ready');

      return config.onReady?.(this);
    };
  }

  protected log(type: 'info' | 'warn' | 'error' | 'debug', ...args: any[]) {
    const isValid = Array.isArray(this.debugMode) ? this.debugMode.includes(type) : this.debugMode === type;

    if (this.debugMode === true || isValid) {
      const now = new Date();
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

  private handleOutgoingMessage(
    fromNumber: string,
    toNumber: string,
    payload: WAOutgoingContent
  ): { jid: string; content: AnyMessageContent; record: WAMessageOutgoing } {
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
    // Clean up temp directory
    try {
      const files = await readdir(this.TEMP_DIR);
      for (const file of files) {
        await unlink(path.join(this.TEMP_DIR, file));
      }
      try {
        await fs.promises.rmdir(this.TEMP_DIR);
      } catch (_error) {
        // Ignore cleanup errors
      }
    } catch (_error) {
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
        // Try to clean the JSON data if it's corrupted
        let cleanedData = jsonString.trim();

        // Remove any trailing characters that might cause JSON parse errors
        if (cleanedData.endsWith(',')) {
          cleanedData = cleanedData.slice(0, -1);
        }

        // Try to parse the JSON
        try {
          return JSON.parse(cleanedData);
        } catch (_parseError) {
          // Try to extract valid JSON from the corrupted data
          try {
            // Find the last valid JSON object by looking for balanced braces
            let braceCount = 0;
            let lastValidIndex = -1;

            for (let i = 0; i < cleanedData.length; i++) {
              if (cleanedData[i] === '{') {
                braceCount++;
              } else if (cleanedData[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                  lastValidIndex = i;
                }
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

      const handleFileChange = async (newSessionFlag: boolean) => {
        const fileList = await readdir(this.TEMP_DIR);

        // Save creds.json
        if (fileList.includes('creds.json')) {
          try {
            // Try to recover corrupted JSON data
            const creds = await readJsonFile<AuthenticationCreds>('creds.json');
            const clientName = !newSessionFlag ? null : creds.me?.verifiedName || creds.me?.name || this.phoneNumber;
            const credsForStorage = convertBufferToPlain(creds);

            await this.updateAppAuth(
              { creds: credsForStorage, ...(this.connected ? { statusCode: 200, errorMessage: null } : {}) } as WAAppAuth<T>,
              clientName
            );

            this.log('info', 'creds.json has been updated');
          } catch (error) {
            this.log('error', 'Error saving creds.json:', error);
          }
        }

        // Save keys
        for (const fileName of fileList) {
          if (fileName === 'creds.json') {
            continue;
          }

          try {
            const data = await readJsonFile<any>(fileName);

            const filenameWithoutExt = fileName.replace('.json', '');
            const [keyType, ...idParts] = filenameWithoutExt.split('-');
            const keyId = idParts.join('-');
            const dataForStorage = convertBufferToPlain(data);

            await this.updateAppKey(keyType, keyId, { keyType, keyId, data: dataForStorage, updatedAt: new Date() });
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

            await handleFileChange(true);
            hasBeenSavedToDatabase = true;
          } else {
            this.log('info', 'Registration not complete yet, skipping database save');
          }
        } else if (!isNewSession) {
          this.log('info', 'Updating session data');

          await handleFileChange(false);
        }
      } catch (_error) {
        this.log('error', 'Error in saveCreds');

        await originalSaveCreds();
      }
    };

    return { state, saveCreds };
  }

  private numberToJid(phoneOrJid: string) {
    if (phoneOrJid.endsWith('@s.whatsapp.net')) {
      return phoneOrJid;
    }
    return `${phoneOrJid}@s.whatsapp.net`;
  }

  private jidToNumber(jidOrPhone: string) {
    if (jidOrPhone.endsWith('@s.whatsapp.net')) {
      return jidOrPhone.split('@')[0];
    }
    return jidOrPhone;
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private shouldSkipRetry(errorCode?: number, reason?: string): boolean {
    // Skip retry for authentication/authorization errors or disabled
    if (errorCode === 401 || errorCode === 403 || errorCode === 408 || this.appState?.isActive === false || this.hasManualDisconnected) {
      return true;
    }

    // Also check reason string for these error types
    if (reason) {
      const lowerReason = reason.toLowerCase();
      return (
        lowerReason.includes('401') ||
        lowerReason.includes('403') ||
        lowerReason.includes('408') ||
        lowerReason.includes('unauthorized') ||
        lowerReason.includes('forbidden')
      );
    }

    return false;
  }

  private createSocketConfig(
    version: any,
    state: any,
    options: { connectTimeoutMs?: number; keepAliveIntervalMs?: number; retryRequestDelayMs?: number } = {}
  ) {
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

  private async updateProfile(sock: WASocket): Promise<void> {
    try {
      const name = (this.appState as any).name;
      await sock.updateProfileName(name);
      this.log('info', `Name: Profile name set to ${name}`);

      await this.update({ profileName: name } as WAAppAuth<T>);
    } catch (_error) {
      this.log('warn', 'Failed to set profile settings');
    }
  }

  private async updatePrivacy(sock: WASocket): Promise<void> {
    // Set privacy settings immediately after connection
    try {
      // Set last seen to "nobody" (invisible)
      await sock.updateLastSeenPrivacy('none');
      this.log('info', 'Privacy: Last seen set to invisible');

      // Set online status to invisible
      await sock.updateOnlinePrivacy('match_last_seen');
      this.log('info', 'Privacy: Online status set to invisible');

      await sock.updateGroupsAddPrivacy('contacts');
      this.log('info', 'Privacy: Add to groups enabled by contacts only');

      await this.update({ hasPrivacyUpdated: true } as WAAppAuth<T>);
    } catch (_error) {
      this.log('warn', 'Failed to set privacy settings');
    }
  }

  private setupEventHandlers(sock: WASocket) {
    // Credentials update handler
    sock.ev.on('creds.update', () => this.saveCreds?.());

    // Connection update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        this.log('info', 'Connected successfully');
        this.connected = true;

        if (!this.appState?.hasPrivacyUpdated) {
          await this.updatePrivacy(sock);
        }

        if (!this.appState?.profileName) {
          await this.updateProfile(sock);
        }

        // Start keep-alive and health check
        this.startKeepAlive();
        this.startHealthCheck();

        // Only trigger ready callback if session is actually ready (has valid credentials)
        if (this.appState?.creds?.me || this.appState?.creds?.registered) {
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

        // Check if this was due to MAC/decryption errors
        if (reason) {
          this.log('warn', '🔐 Disconnection due to MAC/decryption error detected');

          // Attempt to recover from MAC errors
          try {
            const recovered = await this.handleDecryptionError({ message: reason });
            if (recovered) {
              this.log('info', '✅ MAC error recovery successful after disconnect');
            }
          } catch (recoveryError) {
            this.log('error', '❌ MAC error recovery failed after disconnect:', recoveryError);
          }
        }
      }
    });

    // Consolidated messages handler with comprehensive error handling
    sock.ev.on('messages.upsert', async (msg) => {
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
          if (msgText.includes('Bad MAC') || msgText.includes('decrypt') || msgText.includes('MAC')) {
            this.log('warn', '🔐 MAC/decryption error during processing, attempting recovery…');
            try {
              const recovered = await this.handleDecryptionError({
                message: msgText,
                details: { messageId: message.key?.id, from: message.key?.remoteJid },
              });
              if (recovered) this.log('info', '✅ MAC error recovery successful');
              else this.log('error', '❌ MAC error recovery failed');
            } catch (reErr) {
              this.log('error', '❌ Error during MAC error recovery:', reErr);
            }
          }
        }
      }
    });

    // Add message status tracking
    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        const { key, update: updateData } = update;

        // Check for blocked/error statuses
        if (updateData.status && String(updateData.status) === 'ERROR') {
          const errorCode = (updateData as any).statusCode;
          const toNumber = this.jidToNumber(key.remoteJid!);

          // Detect specific block scenarios
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
        }

        // Track successful deliveries
        if (updateData.status && ['SENT', 'DELIVERED', 'READ'].includes(String(updateData.status))) {
          const toNumber = this.jidToNumber(key.remoteJid!);
          const status = String(updateData.status);
          this.log('info', `✅ Message ${status.toLowerCase()} to ${toNumber}`);
        }
      }
    });
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
          if (this.connected) {
            await this.update({ statusCode: 200, errorMessage: null } as WAAppAuth<T>);
          }
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

  // Public methods

  /**
   * Register the instance (equivalent to addInstanceQR)
   * @returns Promise<string> - QR code data URL
   */
  async register(): Promise<string> {
    if (this.connected) {
      throw new Error(`Number [${this.phoneNumber}] is already registered and connected.`);
    }

    this.log('info', 'Starting registration process...');

    const { state, saveCreds } = await this.state(true);
    this.saveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion();
    this.log('info', `Using Baileys version: ${version}`);

    await saveCreds();
    this.log('info', 'Initial credentials saved');

    return new Promise((resolve) => {
      this.log('info', 'Creating instance socket...');
      const socketConfig = this.createSocketConfig(version, state);
      const sock = makeWASocket(socketConfig);
      this.socket = sock;
      this.log('info', 'Socket created successfully');

      sock.ev.on('creds.update', () => this.saveCreds?.());

      sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
          const qrImage = await qrcode.toDataURL(qr);

          resolve(qrImage);
        }

        if (connection === 'open') {
          this.log('info', 'Connected');

          // Set privacy settings immediately after connection
          try {
            // Set last seen to "nobody" (invisible)
            await sock.updateLastSeenPrivacy('none');
            this.log('info', 'Privacy: Last seen set to invisible');

            // Set online status to invisible
            await sock.updateOnlinePrivacy('match_last_seen');
            this.log('info', 'Privacy: Online status set to invisible');
          } catch (error) {
            this.log('warn', 'Failed to set privacy settings:', error);
          }

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

            try {
              await this.connect();

              this.log('info', 'Connection restored successfully after registration');
            } catch (error) {
              this.log('warn', 'Failed to restore connection after registration:', error);
            }
          }
        }
      });
    });
  }

  /**
   * Restore existing instance
   */
  async connect(): Promise<void> {
    this.appState ??= await this.getAppAuth();

    if (this.connected) {
      throw new Error('Already connected, skipping restore');
    }

    if (this.appState?.isActive === false) {
      throw new Error('🚫 Instance is not active');
    }

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
        if (!connectionEstablished) {
          this.log('warn', 'Connection timeout, checking if session is valid...');
        }
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
            // Check again in 1 second
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
      // If restoration fails, check if this is a new/incomplete session
      this.appState = await this.getAppAuth();

      if (!this.appState || !this.appState.creds || !this.appState.creds.me) {
        this.log('info', 'Session appears to be incomplete or new, removing from active instances');
        // Clean up incomplete session and remove from active instances
        await this.handleIncompleteSession();
        return; // Don't throw error, just return
      }

      // Also check if the current temp files indicate incomplete registration
      try {
        const credsPath = path.join(this.TEMP_DIR, 'creds.json');
        const credsData = await readFile(credsPath, 'utf8');
        const creds = JSON.parse(credsData);

        if (!creds.registered && !creds.me) {
          this.log('info', 'Current session files indicate incomplete registration');
          await this.handleIncompleteSession();
          return; // Don't throw error, just return
        }
      } catch (_error) {
        this.log('info', 'Could not read current session files, assuming incomplete');
        await this.handleIncompleteSession();
        return; // Don't throw error, just return
      }

      // If we get here, it's a different type of error, re-throw it
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
   * Send a message
   */
  async send(toNumber: string, payload: WAOutgoingContent, options?: WASendOptions): Promise<any> {
    if (!this.connected || !this.socket) {
      throw new Error(`Instance is not connected`);
    }

    if (this.appState?.isActive === false) {
      throw new Error('Instance is not active');
    }

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

        const result = await (async () => {
          if (!this.connected || !this.socket) {
            throw new Error(`Instance is not connected`);
          }

          const typingSpeed = 50;
          const typingDuration = Math.min(record.text.length * typingSpeed, 5000);

          this.socket.sendPresenceUpdate('composing', toNumber);
          await new Promise((resolve) => setTimeout(resolve, typingDuration));

          this.log('info', `Sending message to ${jid} (attempt ${attempt}/${maxRetries})`);
          this.socket.sendPresenceUpdate('paused', toNumber);
          return await this.socket.sendMessage(jid, content);
        })();

        this.log('info', `Message sent successfully to ${jid}`);

        this.update({
          lastSentMessage: this.getTodayDate(),
          dailyMessageCount: this.appState?.lastSentMessage !== this.getTodayDate() ? 1 : (this.appState?.dailyMessageCount || 0) + 1,
          outgoingMessageCount: (this.appState?.outgoingMessageCount || 0) + 1,
        } as WAAppAuth<T>);

        // Trigger outgoing message callback
        try {
          await this.onOutgoingMessage?.(record, content);
        } catch (error) {
          this.log('error', 'Error in outgoing message callback:', error);
        }

        onSuccess?.(result);
        return result;
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

  /**
   * Handle MAC/decryption errors by attempting to refresh the session
   * This method is called when we encounter "Bad MAC" or decryption failures
   */
  private async handleDecryptionError(error: any): Promise<boolean> {
    const errorMessage = error?.message || '';
    const isMacError = errorMessage.includes('Bad MAC') || errorMessage.includes('decrypt') || errorMessage.includes('MAC');

    if (!isMacError) {
      this.log('debug', 'Not a MAC error, skipping recovery:', errorMessage);
      return false;
    }

    this.log('warn', '🔐 Detected MAC/decryption error, attempting session refresh...');

    try {
      // First try a simple refresh
      this.log('info', '🔄 Attempting simple session refresh...');
      const refreshSuccess = await this.refresh();

      if (refreshSuccess) {
        this.log('info', '✅ Session refresh successful, MAC error resolved');

        return true;
      }

      // If simple refresh fails, try a more aggressive approach
      this.log('warn', '🔄 Simple refresh failed, attempting session reconnection...');

      // Disconnect and reconnect the socket
      if (this.socket) {
        try {
          this.log('debug', 'Logging out socket for reconnection...');
          await this.socket.logout();
        } catch (logoutError: any) {
          if (logoutError?.output?.payload?.message !== 'Connection Closed') {
            this.log('debug', 'Logout during refresh failed:', logoutError);
          }
        }
      }

      // Clear socket and attempt restore
      this.socket = null;
      this.connected = false;

      // Wait a bit before attempting restore
      this.log('debug', 'Waiting 2 seconds before restore attempt...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        this.log('info', '🔄 Attempting session restore...');
        await this.connect();
        this.log('info', '✅ Session reconnection successful after MAC error');
        return true;
      } catch (restoreError) {
        this.log('error', '❌ Session reconnection failed after MAC error:', restoreError);

        // If restore fails, this might indicate corrupted session data
        // Log this for manual intervention
        this.log('error', '🚨 Session appears to be corrupted, may require re-registration');

        // Update status to indicate session issues
        await this.update({
          statusCode: 500,
          errorMessage: `MAC/Decryption error - session corrupted: ${errorMessage}`,
        } as Partial<WAAppAuth<T>>);

        return false;
      }
    } catch (refreshError) {
      this.log('error', '❌ Failed to handle decryption error:', refreshError);

      // Update status to indicate recovery failure
      await this.update({
        statusCode: 500,
        errorMessage: `MAC error recovery failed: ${(refreshError as any)?.message || 'Unknown error'}`,
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
    await this.disconnect();
  }

  async update(data: Partial<WAAppAuth<T>>): Promise<void> {
    if (Object.entries(data).some(([key, value]) => this.appState?.[key as keyof typeof this.appState] !== value)) {
      this.set(data);

      this.set((await this.updateAppAuth(data, null)) || this.appState);
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
    this.connected = false;
    this.socket = null;
    this.saveCreds = null;
    this.log('info', 'Instance cleanup completed');
  }
}
