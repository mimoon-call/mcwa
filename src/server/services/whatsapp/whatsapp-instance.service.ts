// whatsapp-instance.service.ts
import {
  IMessage,
  WAAppAuth,
  WAInstanceConfig,
  WAMessageBlockCallback,
  WAMessageIncoming,
  WAMessageIncomingRaw,
  WAMessageOutgoing,
  WAOutgoingContent,
  WASendOptions,
  AuthenticationCreds,
  WebMessageInfo,
  WAMessageDelivery,
  WAMessageOutgoingCallback,
  WAMessageIncomingCallback,
  WAMessageUpdateCallback,
  WAOnReadyCallback,
  WAProxyConfig,
  MediaPart,
  MediaType,
  IMessageKey,
} from './whatsapp-instance.type';
import {
  AnyMessageContent,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  makeWASocket,
  useMultiFileAuthState,
  WASocket,
  downloadMediaMessage,
  proto,
} from '@whiskeysockets/baileys';
import type { Agent } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import { pino } from 'pino';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { clearTimeout } from 'node:timers';
import getLocalTime from '@server/helpers/get-local-time';
import { MessageStatusEnum } from '@server/services/whatsapp/whatsapp.enum';
import type { Agent as HttpAgent } from 'http';
import type { Agent as HttpsAgent } from 'https';
import { getPublicIpThroughAgent } from '@server/helpers/get-public-ip-through-agent';
import { LRUCache } from 'lru-cache';

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
  private agent?: HttpAgent | HttpsAgent;

  // Intervals
  private keepAliveInterval: NodeJS.Timeout | undefined = undefined;
  private healthCheckInterval: NodeJS.Timeout | undefined = undefined;

  // Message delivery tracking
  private messageDeliveries = new LRUCache<string, WAMessageDelivery>({ max: 10000, ttl: 1000 * 60 * 30 });
  private deliveryTimeouts = new LRUCache<string, NodeJS.Timeout>({ max: 10000, ttl: 1000 * 60 * 60 * 24 }); // 24 hours max

  // Callbacks
  private readonly getAppAuth: () => Promise<WAAppAuth<T> | null>;
  private readonly updateAppAuth: (data: Partial<WAAppAuth<T>>) => Promise<WAAppAuth<T>>;
  private readonly deleteAppAuth: () => Promise<void>;
  private readonly updateAppKey: (keyType: string, keyId: string, data: Partial<any>) => Promise<void>;
  private readonly getAppKeys: () => Promise<any[]>;
  private readonly onRemove: () => Promise<unknown> | unknown;
  private readonly onIncomingMessage: WAMessageIncomingCallback;
  private readonly onOutgoingMessage: WAMessageOutgoingCallback;
  private readonly onSendingMessage: (toNumber: string) => Promise<unknown> | unknown;
  private readonly onMessageUpdate: WAMessageUpdateCallback;
  private readonly hasGlobalMessageUpdateCallback: boolean;
  private readonly onMessageBlocked: WAMessageBlockCallback;
  private readonly onReady: WAOnReadyCallback<T>;
  private readonly onDisconnect: (reason: string) => Promise<unknown> | unknown;
  private readonly onError: (error: any) => Promise<unknown> | unknown;
  private readonly onUpdate: (data: Partial<WAAppAuth<T>>) => Promise<unknown> | unknown;
  private readonly onRegister: () => Promise<unknown> | unknown;

  public readonly phoneNumber: string;
  public connected: boolean = false;
  private recovering: boolean = false;

  private delay = async (ms: number = 0) => await new Promise((resolve) => setTimeout(resolve, ms));
  private randomIdle = (min = 800, max = 3500): number => min + Math.floor(Math.random() * (max - min));

  private humanDelayFor(text: string): number {
    if (!text) return 0;

    const words = Math.max(1, text.split(/\s+/).length);
    const base = 800 + words * 220; // base typing time
    const jitter = Math.floor(Math.random() * 1200);

    return base + jitter; // 1–5s typical
  }

  protected log(type: 'info' | 'warn' | 'error' | 'debug', ...args: any[]) {
    const isValid = Array.isArray(this.debugMode) ? this.debugMode.includes(type) : this.debugMode === type;

    if (this.debugMode === true || isValid) {
      const now = getLocalTime();
      const time = now.toTimeString().split(' ')[0];
      console[type](time, `[${this.phoneNumber}]`, ...args);
    }
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
    this.onIncomingMessage = (data, ...arg) => config.onIncomingMessage?.({ ...data, toNumber: phoneNumber }, ...arg);
    this.onOutgoingMessage = (data, ...arg) => config.onOutgoingMessage?.({ ...data, fromNumber: phoneNumber }, ...arg);
    this.onSendingMessage = (toNumber: string) => config?.onSendingMessage?.(this, toNumber);
    this.onMessageUpdate = (...arg) => config.onMessageUpdate?.(...arg);
    this.hasGlobalMessageUpdateCallback = !!config.onMessageUpdate;
    this.onMessageBlocked = async (fromNumber: string, toNumber: string, blockReason: string) => {
      await this.update({ blockedCount: (this.appState?.blockedCount || 0) + 1 } as WAAppAuth<T>);

      return config.onMessageBlocked?.(fromNumber, toNumber, blockReason);
    };
    this.onUpdate = (data: Partial<WAAppAuth<T>>) => {
      if (!data || !this.appState || !config.onUpdate) return;

      const updateKeys = Object.keys(data);
      const updateState = Object.entries(this.appState).reduce((acc: Partial<WAAppAuth<T>>, [key, value]) => {
        return updateKeys.includes(key) || key === 'phoneNumber' ? { ...acc, [key]: value } : acc;
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

  private unwrapMessage<T extends proto.IMessage | undefined>(msg: T): T {
    if (!msg) return msg;
    const m: any = msg;
    if (m.ephemeralMessage?.message) return m.ephemeralMessage.message;
    if (m.viewOnceMessage?.message) return m.viewOnceMessage.message;
    if (m.viewOnceMessageV2?.message) return m.viewOnceMessageV2.message;
    return msg;
  }

  private pickMediaPart(raw: WAMessageIncomingRaw): { container?: proto.Message; key?: keyof proto.Message; part?: MediaPart } {
    const msg = raw.message as proto.Message | undefined;
    if (!msg) return {};

    const tryPick = (container?: proto.Message) => {
      if (!container) return {};
      if (container.imageMessage) return { container, key: 'imageMessage' as const, part: container.imageMessage };
      if (container.videoMessage) return { container, key: 'videoMessage' as const, part: container.videoMessage };
      if (container.audioMessage) return { container, key: 'audioMessage' as const, part: container.audioMessage };
      if (container.documentMessage) return { container, key: 'documentMessage' as const, part: container.documentMessage };
      if (container.stickerMessage) return { container, key: 'stickerMessage' as const, part: container.stickerMessage };
      return {};
    };

    // direct media
    const unwrapped = this.unwrapMessage(msg);
    const direct = tryPick(unwrapped);
    if (direct.part) return direct;

    // quoted media (when someone replies to a media message)
    const ctx =
      unwrapped?.extendedTextMessage?.contextInfo ??
      unwrapped?.imageMessage?.contextInfo ??
      unwrapped?.videoMessage?.contextInfo ??
      unwrapped?.documentMessage?.contextInfo;

    const quoted = this.unwrapMessage(ctx?.quotedMessage as proto.Message | undefined);
    const q = tryPick(quoted);
    if (q.part) return q;

    return {};
  }

  private mapMediaType(key?: keyof proto.Message, part?: MediaPart): { mediaType: MediaType; isPTT: boolean } {
    if (!key) return { mediaType: 'none', isPTT: false };
    if (key === 'imageMessage') return { mediaType: 'image', isPTT: false };
    if (key === 'videoMessage') return { mediaType: 'video', isPTT: false };
    if (key === 'documentMessage') return { mediaType: 'document', isPTT: false };
    if (key === 'stickerMessage') return { mediaType: 'sticker', isPTT: false };
    if (key === 'audioMessage') return { mediaType: (part as proto.Message.IAudioMessage)?.ptt ? 'ptt' : 'audio', isPTT: !!(part as any)?.ptt };
    return { mediaType: 'none', isPTT: false };
  }

  private async attachMediaBufferToRaw(raw: WAMessageIncomingRaw, sock: WASocket, sizeLimitBytes: number = 50 * 1024 * 1024): Promise<void> {
    try {
      const { container, key, part } = this.pickMediaPart(raw);
      if (!container || !key || !part) {
        raw.mediaType = 'none';
        return;
      }

      const { mediaType } = this.mapMediaType(key, part);
      const mimeType = (part as any)?.mimetype as string | undefined;
      const fileName = (part as proto.Message.IDocumentMessage)?.fileName || (part as any)?.fileName || undefined;

      // Baileys helper handles decrypt & reupload if required
      const buffer = (await downloadMediaMessage(
        raw as unknown as any,
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage, logger: silentLogger }
      )) as Buffer;

      // metadata
      raw.mediaType = mediaType;
      raw.mimeType = mimeType;
      raw.fileName = fileName;
      raw.seconds = (part as proto.Message.IVideoMessage)?.seconds ?? (part as proto.Message.IAudioMessage)?.seconds ?? undefined;

      // size guard
      if (buffer && buffer.length <= sizeLimitBytes) {
        raw.buffer = buffer;
      } else {
        // too large → keep meta, skip buffer to protect memory
        raw.buffer = undefined;
      }
    } catch (err) {
      this.log('warn', 'attachMediaBufferToRaw error:', err);
      raw.mediaType = 'none';
    }
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

  private handleIncomingMessage(raw: WAMessageIncomingRaw, sock: WASocket): [WAMessageIncoming, WAMessageIncomingRaw] {
    const text = this.extractText(raw.message) || '';
    const fromJid = raw.key.remoteJid!;
    const toJid = sock.user!.id!;

    return [{ fromNumber: this.jidToNumber(fromJid), toNumber: this.jidToNumber(toJid), text }, raw];
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
        textForRecord = payload.caption ?? '';
        content = { image: payload.data, caption: payload.caption, mimetype: payload.mimetype } as AnyMessageContent;
        break;
      case 'audio':
        textForRecord = payload.text ?? payload.caption ?? '';
        content = {
          audio: payload.data,
          caption: payload.caption,
          mimetype: payload.mimetype,
          ptt: payload.ptt,
          seconds: payload.duration || payload.seconds,
        } as AnyMessageContent;
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

      for (const file of files) await unlink(path.join(this.TEMP_DIR, file));
      await fs.promises.rmdir(this.TEMP_DIR);
    } catch {
      // Ignore cleanup errors
    }

    if (!includeRecreateDirFlag) return;

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
        for (const [key, value] of Object.entries(obj)) result[key] = convertBinaryToBuffer(value);

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
        for (const [key, value] of Object.entries(obj)) result[key] = convertBufferToPlain(value);

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

          if (!json) throw new Error(`${fileName} file is broken`);

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
            await this.updateAppAuth({ creds: credsForStorage } as WAAppAuth<T>);

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

  private numberToJid(phoneOrJid: string): string {
    if (phoneOrJid.includes('@')) return phoneOrJid;

    return `${phoneOrJid}@s.whatsapp.net`;
  }

  private jidToNumber(jidOrPhone: string): string {
    let phoneNumber = jidOrPhone;
    if (phoneNumber?.endsWith('@s.whatsapp.net')) phoneNumber = jidOrPhone.split('@')[0];

    return phoneNumber?.replace(/:\d+/g, '');
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

  private buildProxyAgent(proxy?: WAProxyConfig): Agent | undefined {
    // 1) per-session proxy (optional)
    if (proxy?.host && proxy?.port) {
      const user = proxy.username ? encodeURIComponent(proxy.username) : undefined;
      const pass = proxy.password ? encodeURIComponent(proxy.password || '') : undefined;
      const auth = user ? `${user}:${pass || ''}@` : '';
      const scheme = (proxy.type || 'HTTP').toUpperCase() === 'SOCKS5' ? 'socks5h' : 'http';
      const url = `${scheme}://${auth}${proxy.host}:${proxy.port}`;
      return scheme.startsWith('socks5') ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);
    }

    // 2) PacketStream fallback via env
    const psUrl =
      process.env.PS_PROXY_URL ||
      (() => {
        const scheme = (process.env.PS_SCHEME || '').toLowerCase(); // 'http' | 'socks5h'
        const host = process.env.PS_HOST;
        const port = process.env.PS_PORT;
        const user = process.env.PS_USER ? encodeURIComponent(process.env.PS_USER) : undefined;
        const key = process.env.PS_KEY ? encodeURIComponent(process.env.PS_KEY || '') : undefined;
        if (!scheme || !host || !port || !user || !key) return undefined;
        return `${scheme}://${user}:${key}@${host}:${port}`;
      })();

    if (!psUrl) return undefined;

    return psUrl.startsWith('socks5') ? new SocksProxyAgent(psUrl) : new HttpsProxyAgent(psUrl);
  }

  private createSocketConfig(version: any, state: any, options: CreateSocketOptions = {}) {
    this.agent = this.buildProxyAgent(this.appState?.proxy);

    return {
      version,
      auth: state,
      logger: silentLogger,
      connectTimeoutMs: options.connectTimeoutMs || 30000,
      keepAliveIntervalMs: options.keepAliveIntervalMs || 25000,
      retryRequestDelayMs: options.retryRequestDelayMs || 1000,
      emitOwnEvents: false,
      ...this.agent,
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

  private async updateProfileUrl(): Promise<void> {
    if (!this.socket || !this.socket.user?.id) return;

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const profilePictureUrl = await this.socket.profilePictureUrl(this.socket.user.id, 'image');
      await this.update({ profilePictureUrl: profilePictureUrl || null } as WAAppAuth<T>);
      this.log('debug', 'Profile picture URL updated successfully');
    } catch {
      await this.update({ profilePictureUrl: null } as WAAppAuth<T>);
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
      this.log('error', 'Failed to set profile settings');
    }
  }

  private async updatePrivacy(): Promise<void> {
    if (!this.socket || this.appState?.hasPrivacyUpdated) return;

    // Set privacy settings immediately after connection
    try {
      await this.socket.updateLastSeenPrivacy('none');
      this.log('info', 'Privacy: Last seen set to invisible');

      await this.socket.updateOnlinePrivacy('match_last_seen');
      this.log('info', 'Privacy: Online status set to invisible');

      await this.socket.updateGroupsAddPrivacy('contacts');
      this.log('info', 'Privacy: Add to groups enabled by contacts only');

      await this.update({ hasPrivacyUpdated: true } as WAAppAuth<T>);
    } catch (_error) {
      this.log('error', 'Failed to set privacy settings');
    }
  }

  private setupEventHandlers(sock: WASocket): void {
    const connectionUpdateHandler = async (update: any): Promise<void> => {
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

          if (this.appState?.lastSentMessage !== this.getTodayDate()) {
            await this.update({ dailyMessageCount: 0 } as WAAppAuth<T>);
          }

          const lastIpAddress = await getPublicIpThroughAgent(this.agent);
          this.log('info', 'Assigned ip address', lastIpAddress);

          await this.update({ lastIpAddress } as WAAppAuth<T>);

          if (this.appState?.creds?.me || this.appState?.creds?.registered) {
            // Trigger ready callback
            await this.onReady(this);

            // Immediately update status to 200 when connection is successful
            await this.update({ statusCode: 200, errorMessage: null, lastErrorAt: null } as WAAppAuth<T>);
          }
        } else {
          this.log('info', 'Connection open but session not ready (no valid credentials)');
        }
      }

      if (connection === 'close') {
        this.connected = false;
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = (lastDisconnect?.error as Boom)?.message || 'Unknown';

        // Create a more descriptive reason that includes the error code
        const disconnectReason = code ? `${code}: ${reason}` : reason;
        if (code !== this.appState?.statusCode) {
          this.update({ statusCode: code, errorMessage: reason, lastErrorAt: getLocalTime() } as WAAppAuth<T>);
        }

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
              if (recovered) this.log('info', '✅ Error recovery successful after disconnect');
            } catch (recoveryError) {
              this.log('error', '❌ Error recovery failed after disconnect:', recoveryError);
            }
          }
        }
      }
    };
    const messagesUpsertHandler = async (msg: any): Promise<void> => {
      if (msg.type !== 'notify' || !msg.messages?.length) return;

      // optional: simple mutex to avoid overlapping recoveries
      if (!this.recovering) this.recovering = false;

      for (const message of msg.messages) {
        if (!message?.key || message.key.fromMe) continue;
        const hasPayload = !!message.message;

        if (!hasPayload) {
          this.log('warn', '🔐 Detected null/undefined message, attempting recovery...');
          if (this.recovering) continue; // Prevent recovery stampede

          this.recovering = true;
          try {
            const refreshed = await this.refresh();

            if (refreshed) {
              this.log('info', '✅ Session synchronized due to decryption issues');
            } else {
              this.log('error', '❌ Session sync failed, attempting aggressive recovery…');
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

          continue; // Skip further processing for this specific message (can’t parse it anyway)
        }

        try {
          this.update({ incomingMessageCount: (this.appState?.incomingMessageCount || 0) + 1 } as WAAppAuth<T>);
        } catch (error) {
          this.log('error', '❌ Failed to update inbound counters:', error);
        }

        // Normalize & dispatch
        try {
          await this.attachMediaBufferToRaw(message as WAMessageIncomingRaw, sock);
          const [data, raw] = this.handleIncomingMessage(message as WAMessageIncomingRaw, sock);

          this.onIncomingMessage(data, raw, message.key.id);
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
    const messageUpdateHandler = async (updates: any): Promise<void> => {
      for (const update of updates) {
        const { key, update: updateData } = update;
        this.log('debug', `📱 Message update received: ID=${key.id}, Status=${updateData.status}, RemoteJid=${key.remoteJid}`);

        // Update delivery tracking if message ID exists
        if (key.id && updateData.status !== undefined) {
          const statusMap: { [key: number]: keyof typeof MessageStatusEnum } = {
            1: MessageStatusEnum.PENDING,
            2: MessageStatusEnum.SENT,
            3: MessageStatusEnum.DELIVERED,
            4: MessageStatusEnum.READ,
            5: MessageStatusEnum.PLAYED,
          }; // Map numeric status codes to string statuses

          const numericStatus = Number(updateData.status);
          const status = statusMap[numericStatus] || MessageStatusEnum.ERROR;
          const timestamp = new Date();

          switch (status) {
            case MessageStatusEnum.SENT: {
              this.updateMessageDeliveryStatus(key.id, MessageStatusEnum.SENT, timestamp);
              break;
            }
            case MessageStatusEnum.DELIVERED: {
              this.updateMessageDeliveryStatus(key.id, MessageStatusEnum.DELIVERED, timestamp);
              const delivery = this.messageDeliveries.get(key.id);
              if (delivery) this.log('info', `✅  Message ${key.id} delivered`);
              break;
            }
            case MessageStatusEnum.READ: {
              this.updateMessageDeliveryStatus(key.id, MessageStatusEnum.READ, timestamp);
              const readDelivery = this.messageDeliveries.get(key.id);
              if (readDelivery) this.log('info', `👁️ Message ${key.id} read`);
              break;
            }
            case MessageStatusEnum.PLAYED: {
              this.updateMessageDeliveryStatus(key.id, MessageStatusEnum.PLAYED, timestamp);
              const playedDelivery = this.messageDeliveries.get(key.id);
              if (playedDelivery) this.log('info', `🎵 Audio message ${key.id} played`);
              break;
            }
            case MessageStatusEnum.ERROR: {
              const errorCode = (updateData as any).statusCode;
              const errorMessage = (updateData as any).message || 'Unknown error';

              this.updateMessageDeliveryStatus(key.id, MessageStatusEnum.ERROR, timestamp, errorCode, errorMessage);

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
              } else if (errorCode !== undefined && errorCode !== null) {
                this.log('error', `🚫 Message blocked - Error code: ${errorCode}`);
                await this.handleMessageBlocked(toNumber, `ERROR_${errorCode}`);
              }
              break;
            }
            default:
              // Log all status codes to help determine correct mappings
              this.log('debug', `🔍 Message ${key.id} received status code ${updateData.status} (type: ${typeof updateData.status})`);
              break;
          }
        }

        // Legacy logging for backward compatibility
        if (
          updateData.status &&
          [MessageStatusEnum.SENT, MessageStatusEnum.DELIVERED, MessageStatusEnum.READ].includes(updateData.status.toString())
        ) {
          const toNumber = this.jidToNumber(key.remoteJid!);
          const status = String(updateData.status);
          this.log('info', `✅ Message ${status.toLowerCase()} to ${toNumber}`);
        }

        // Call the global message update callback to update database
        if (this.hasGlobalMessageUpdateCallback && key.id && updateData.status !== undefined) {
          try {
            const statusMap: { [key: number]: keyof typeof MessageStatusEnum } = {
              1: MessageStatusEnum.PENDING,
              2: MessageStatusEnum.SENT,
              3: MessageStatusEnum.DELIVERED,
              4: MessageStatusEnum.READ,
              5: MessageStatusEnum.PLAYED,
            };

            const numericStatus = Number(updateData.status);
            const status = statusMap[numericStatus] || MessageStatusEnum.ERROR;
            const timestamp = getLocalTime();

            // Prepare status-specific timestamps
            let sentAt = timestamp; // Default to current timestamp
            let deliveredAt, readAt, playedAt;

            switch (status) {
              case MessageStatusEnum.SENT:
                sentAt = timestamp;
                break;
              case MessageStatusEnum.DELIVERED:
                deliveredAt = timestamp;
                break;
              case MessageStatusEnum.READ:
                readAt = timestamp;
                break;
              case MessageStatusEnum.PLAYED:
                playedAt = timestamp;
                break;
            }

            // Call the global callback with proper parameters
            await this.onMessageUpdate(key.id, {
              messageId: key.id,
              status,
              sentAt,
              deliveredAt,
              readAt,
              playedAt,
              errorMessage: status === MessageStatusEnum.ERROR ? 'Unknown error' : undefined,
              errorCode: status === MessageStatusEnum.ERROR ? numericStatus : undefined,
            });
          } catch (error) {
            this.log('error', 'Error calling global message update callback:', error);
          }
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

  private async handleInstanceDisconnect(reason: string, attempts: number = 1, maxRetry: number = 3): Promise<void> {
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

  private startKeepAlive(): void {
    this.stopKeepAlive();

    this.keepAliveInterval = setInterval(async () => {
      try {
        if (this.socket?.user && this.socket.user.id) {
          await this.socket.sendPresenceUpdate('available', this.socket.user.id);
        }
      } catch (error) {
        this.log('error', `Keep-alive failed:`, error);
      }
    }, 30000); // 30 seconds
  }

  private stopKeepAlive(): void {
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

    const delivery: WAMessageDelivery = { messageId, status: MessageStatusEnum.PENDING, sentAt: getLocalTime() };
    this.messageDeliveries.set(messageId, delivery);
    this.log('debug', `📱 Delivery tracking started for message ${messageId}, total tracked: ${this.messageDeliveries.size}`);

    const trackingTimeout = options.deliveryTrackingTimeout || 30000; // Set delivery tracking timeout
    const timeoutId = setTimeout(() => this.handleDeliveryTimeout(messageId), trackingTimeout);

    this.deliveryTimeouts.set(messageId, timeoutId);
  }

  private updateMessageDeliveryStatus(
    messageId: string,
    status: keyof typeof MessageStatusEnum,
    timestamp?: Date,
    errorCode?: number,
    errorMessage?: string
  ): void {
    const delivery = this.messageDeliveries.get(messageId);

    if (!delivery) {
      this.log('warn', `📱 No delivery tracking found for message ${messageId} when updating status to ${status}`);
      return;
    }

    if (delivery.status === status) {
      this.log('debug', `📱 Same delivery status for message ${messageId}`);
      return;
    }

    delivery.status = status;
    this.log('info', `📱 Updating delivery status for message ${messageId}: ${delivery.status} -> ${status}`);

    switch (status) {
      case MessageStatusEnum.DELIVERED: {
        const currentCount = this.appState?.outgoingMessageCount || 0;
        const newCount = currentCount + 1;
        this.update({ outgoingMessageCount: newCount } as WAAppAuth<T>);
        delivery.deliveredAt = timestamp || new Date();
        break;
      }
      case MessageStatusEnum.READ: {
        this.update({ outgoingReadCount: (this.appState?.outgoingReadCount || 0) + 1 } as WAAppAuth<T>);
        delivery.readAt = timestamp || new Date();
        break;
      }
      case MessageStatusEnum.PLAYED: {
        this.update({ outgoingPlayCount: (this.appState?.outgoingPlayCount || 0) + 1 } as WAAppAuth<T>);
        delivery.playedAt = timestamp || new Date();
        break;
      }
      case MessageStatusEnum.ERROR: {
        this.update({ outgoingErrorCount: (this.appState?.outgoingErrorCount || 0) + 1 } as WAAppAuth<T>);
        delivery.errorCode = errorCode;
        delivery.errorMessage = errorMessage;
        break;
      }
    }

    // Clear timeout if message is delivered or read
    if ([MessageStatusEnum.DELIVERED, MessageStatusEnum.READ].includes(status as MessageStatusEnum)) {
      this.clearDeliveryTimeout(messageId);
    }

    // Trigger message update callbacks
    try {
      this.onMessageUpdate?.(messageId, delivery);
    } catch (error) {
      this.log('error', 'Error in message update callback:', error);
    }
  }

  private handleDeliveryTimeout(messageId: string): void {
    this.log('warn', `📱 Delivery timeout for message ${messageId} - no status updates received from WhatsApp`);
    this.updateMessageDeliveryStatus(messageId, MessageStatusEnum.ERROR, undefined, 408, 'Delivery timeout - no status updates received');
    this.clearDeliveryTimeout(messageId);
  }

  private clearDeliveryTimeout(messageId: string): void {
    const timeoutId = this.deliveryTimeouts.get(messageId);

    if (timeoutId) {
      clearTimeout(timeoutId);
      this.deliveryTimeouts.delete(messageId);
    }
  }

  // Wait for message to reach specific status
  private async waitForMessageStatus(messageId: string, options: WASendOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = options.waitTimeout || 30000;
      const targetStatus = options.waitForRead ? MessageStatusEnum.READ : MessageStatusEnum.DELIVERED;
      let callbackDebounce: NodeJS.Timeout | undefined = undefined;

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
        if (targetStatus === MessageStatusEnum.DELIVERED && currentDelivery.status === MessageStatusEnum.READ) {
          clearTimeout(timeoutId);
          resolve();
          return;
        }
      }

      // Create a one-time status checker
      const checkStatus = () => {
        const delivery = this.messageDeliveries.get(messageId);
        if (!delivery) return;

        clearTimeout(callbackDebounce);
        callbackDebounce = undefined;

        callbackDebounce = setTimeout(() => {
          // Trigger message update callbacks if provided
          try {
            // Call message-specific callback
            options.onUpdate?.(messageId, delivery);
            // Call global callback
            this.onMessageUpdate?.(messageId, delivery);
          } catch (error) {
            this.log('error', 'Error in message update callback:', error);
          }
        }, 5000);

        if (delivery.status === targetStatus) {
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        // Check if we've already passed the target status
        if (targetStatus === MessageStatusEnum.DELIVERED && delivery.status === MessageStatusEnum.READ) {
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        // Check if there was an error
        if (delivery.status === MessageStatusEnum.ERROR) {
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
      const checkInterval = setInterval(checkStatus, 1000); // Check every second

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

  // Set up message update callbacks for messages that don't use waitForDelivery/waitForRead
  private setupMessageUpdateCallbacks(messageId: string, options: WASendOptions): void {
    if (!options.onUpdate && !this.hasGlobalMessageUpdateCallback) return;

    const timeout = options.waitTimeout || 30000;
    let hasResolved = false;

    // Set up timeout for cleanup
    const timeoutId = setTimeout(() => {
      if (hasResolved) return;
      hasResolved = true;
      clearInterval(checkInterval);
    }, timeout);

    // Set up status checker
    const checkStatus = () => {
      if (hasResolved) return;

      const delivery = this.messageDeliveries.get(messageId);
      if (!delivery) return;

      // Trigger message update callbacks
      try {
        // Call message-specific callback
        options.onUpdate?.(messageId, delivery);
        // Call global callback
        this.onMessageUpdate?.(messageId, delivery);
      } catch (error) {
        this.log('error', 'Error in message update callback:', error);
      }

      // Check if we should stop tracking (message reached final state)
      if (delivery.status === MessageStatusEnum.READ || delivery.status === MessageStatusEnum.ERROR) {
        hasResolved = true;
        clearTimeout(timeoutId);
        clearInterval(checkInterval);
      }
    };

    // Set up interval to check status
    const checkInterval = setInterval(checkStatus, 1000); // Check every second

    // Clean up after timeout
    setTimeout(() => {
      clearInterval(checkInterval);
    }, timeout + 1000); // Give a bit of extra time for cleanup
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckInterval = setInterval(async () => {
      try {
        // Try to send a presence update to check if connection is still alive
        if (this.socket?.user?.id) {
          await this.socket.sendPresenceUpdate('available', this.socket.user.id);
        }
      } catch (error) {
        this.log('error', 'Health check failed, connection may be dead:', error);

        this.onError(error);
      }
    }, 60000); // 60 seconds
  }

  private stopHealthCheck(): void {
    clearInterval(this.healthCheckInterval);
    this.healthCheckInterval = undefined;
  }

  private async emulateHuman(jid: string, type: 'composing' | 'recording', ms: number = 0): Promise<void> {
    if (!ms) return;
    if (!this.connected || !this.socket) throw new Error(`Instance is not connected`);

    try {
      await this.socket.presenceSubscribe(jid);
      const keepAlive = setInterval(() => this.socket?.sendPresenceUpdate(type, jid), 4500);
      await this.delay(ms);
      clearInterval(keepAlive);
      await this.socket.sendPresenceUpdate('paused', jid);
      await this.delay(250);
    } finally {
      await this.socket.sendPresenceUpdate('available');
    }
  }

  // Handle MAC/decryption errors by attempting to refresh the session, called when we encounter "Bad MAC" or decryption failures
  private async handleDecryptionError(error: any): Promise<boolean> {
    const errorMessage = error?.message || '';
    const isMacError = errorMessage.includes('Bad MAC') || errorMessage.includes('decrypt') || errorMessage.includes('MAC');
    const isUnsupportedStateError = errorMessage.includes('Unsupported state') || errorMessage.includes('unable to authenticate data');
    const isDecryptError = errorMessage.includes('Failed to decrypt message') || errorMessage.includes('decrypt message');

    if (!isMacError && !isUnsupportedStateError && !isDecryptError) return false;

    const errorType = isUnsupportedStateError ? 'unsupported state' : isDecryptError ? 'decrypt' : 'MAC';

    this.log('warn', `🔐 Detected ${errorType} error, attempting session recovery...`);

    // Recursive recovery method with configurable strategies
    const attemptRecovery = async (errorType: string, attempt: number): Promise<boolean> => {
      const MAX_ATTEMPTS = 3;
      const strategies = [
        { name: 'simple refresh', action: () => attemptSimpleRefresh() },
        { name: 'session reconnection', action: () => attemptSessionReconnection(2000) },
        { name: 'fresh socket reconnection', action: () => attemptSessionReconnection(3000) },
      ];

      if (attempt >= MAX_ATTEMPTS) {
        this.log('error', `❌ All recovery attempts failed for ${errorType} error`);
        return await handleRecoveryFailure(errorType);
      }

      const strategy = strategies[attempt];
      this.log('info', `🔄 Attempt ${attempt + 1}/${MAX_ATTEMPTS}: ${strategy.name}...`);

      try {
        // Special handling for unsupported state errors
        if (errorType === 'unsupported state' && attempt === 0) {
          await this.cleanupAndRemoveTempDir(true);
          this.log('info', '🧹 Temporary files cleared for unsupported state recovery');
        }

        const success = await strategy.action();

        if (success) {
          this.log('info', `✅ ${strategy.name} successful, ${errorType} error resolved`);
          return true;
        }

        // If this strategy failed, try the next one
        return await attemptRecovery(errorType, attempt + 1);
      } catch (error) {
        this.log('warn', `⚠️ ${strategy.name} failed:`, error);

        // For unsupported state or decrypt errors on final attempt, try credential reset
        if (attempt === MAX_ATTEMPTS - 1 && (errorType === 'unsupported state' || errorType === 'decrypt')) {
          return await attemptCredentialReset(errorType);
        }

        // Try next strategy
        return await attemptRecovery(errorType, attempt + 1);
      }
    };

    // Simple refresh strategy
    const attemptSimpleRefresh = async (): Promise<boolean> => {
      return await this.refresh();
    };

    // Session reconnection strategy
    const attemptSessionReconnection = async (delayMs: number): Promise<boolean> => {
      this.socket = null;
      this.connected = false;

      if (delayMs > 0) {
        this.log('debug', `Waiting ${delayMs}ms before restore attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      await this.connect();
      return true;
    };

    // Credential reset strategy for persistent errors
    const attemptCredentialReset = async (errorType: string): Promise<boolean> => {
      this.log('warn', `🔄 ${errorType} error persists, attempting credential reset...`);

      try {
        await this.deleteAppAuth();
        await this.cleanupAndRemoveTempDir(false);

        this.log('info', '🧹 Credentials cleared, instance will need re-registration');

        if (this.appState?.statusCode !== 401) {
          await this.update({
            statusCode: 401,
            errorMessage: `Session corrupted (${errorType}), please re-authenticate`,
            lastErrorAt: getLocalTime(),
          } as Partial<WAAppAuth<T>>);
        }

        await this.disable();
        return false;
      } catch (resetError) {
        this.log('error', '❌ Failed to reset credentials:', resetError);
        return await handleRecoveryFailure(errorType);
      }
    };

    // Handle complete recovery failure
    const handleRecoveryFailure = async (errorType: string): Promise<boolean> => {
      this.socket = null;
      this.connected = false;

      if (this.appState?.statusCode !== 500) {
        await this.update({
          statusCode: 500,
          errorMessage: `${errorType} error recovery failed`,
          lastErrorAt: getLocalTime(),
        } as Partial<WAAppAuth<T>>);
      }

      await this.disable();
      return false;
    };

    return await attemptRecovery(errorType, 0);
  }

  // Public method to check message delivery status
  public getMessageDeliveryStatus(messageId: string): WAMessageDelivery | null {
    return this.messageDeliveries.get(messageId) || null;
  }

  public async getProfilePicture(phoneNumber: string) {
    try {
      return await this.socket?.profilePictureUrl(this.numberToJid(phoneNumber), 'image');
    } catch {
      return null;
    }
  }

  public async read(messageKey: IMessageKey | IMessageKey[]): Promise<void> {
    if (!this.connected || !this.socket) return;

    const bulk = Array.isArray(messageKey) ? messageKey : [messageKey];
    const ids = bulk.map(({ id }) => id).join(', ');

    try {
      await this.socket.readMessages(bulk);
      this.log('debug', `📖 Read receipt sent for message ${ids}`);
    } catch (error) {
      this.log('warn', `⚠️ Failed to send read receipt for message ${ids}:`, error);
    }
  }

  public async register(): Promise<string> {
    if (this.connected) throw new Error(`Number [${this.phoneNumber}] is already registered and connected.`);

    this.log('info', 'Starting registration process...');
    const { state, saveCreds } = await this.state(true);
    this.saveCreds = saveCreds;

    const { version } = await fetchLatestBaileysVersion();
    this.log('debug', `Using Baileys version: ${version}`);

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

            // Immediately update status to 200 when connection is successful
            await this.update({ statusCode: 200, errorMessage: null, lastErrorAt: null } as WAAppAuth<T>);
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
            await this.update({
              statusCode: code,
              errorMessage: code === 200 ? null : reason,
              lastErrorAt: code === 200 ? null : getLocalTime(),
            } as WAAppAuth<T>);
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

  public async connect(): Promise<void> {
    this.appState ??= await this.getAppAuth();

    if (this.connected) {
      this.log('info', 'Instance is already connected');
      return;
    }

    await this.update({ isActive: true } as Partial<WAAppAuth<T>>);
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

        return;
      }

      try {
        const credsPath = path.join(this.TEMP_DIR, 'creds.json');
        const credsData = await readFile(credsPath, 'utf8');
        const creds = JSON.parse(credsData);

        if (!creds.registered && !creds.me) {
          this.log('info', 'Current session files indicate incomplete registration');

          return;
        }
      } catch (_error) {
        this.log('info', 'Could not read current session files, assuming incomplete');

        return;
      }

      throw error;
    }
  }

  public async send(toNumber: string, payload: WAOutgoingContent, options?: WASendOptions): Promise<WebMessageInfo & Partial<WAMessageDelivery>> {
    if (!this.connected || !this.socket) throw new Error(`Instance is not connected`);
    if (this.appState?.isActive === false) throw new Error('Instance is not active');

    const { maxRetries = 3, retryDelay = 1000, onSuccess, onFailure } = options || {};
    let lastError: any;
    let attempts = 0;
    const { jid, content, record } = this.handleOutgoingMessage(this.phoneNumber, toNumber, payload);

    if ((typeof payload === 'object' && payload.type === 'text' && !payload.text) || (typeof payload === 'string' && !payload)) {
      throw new Error('Empty message');
    }

    this.onSendingMessage(toNumber);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attempts = attempt;
      try {
        this.log('info', `Sending message to ${jid} (attempt ${attempt}/${maxRetries})`);

        const raw: WebMessageInfo | undefined = await (async () => {
          if (!this.connected || !this.socket) throw new Error(`Instance is not connected`);

          const isAudio = typeof payload === 'object' && (payload as any).type === 'audio';

          // Ensure audio content has PTT + WhatsApp-friendly mimetype
          if (isAudio && content && (content as any).audio) {
            (content as any).ptt = (content as any).ptt ?? true;
            (content as any).mimetype = (content as any).mimetype ?? 'audio/ogg; codecs=opus';
          }

          await this.socket.presenceSubscribe(jid);

          if (isAudio) {
            const seconds = (payload as any).duration || 0;
            const ms = seconds * 1000; // Convert seconds to milliseconds
            await this.emulateHuman(jid, 'recording', ms);
          } else {
            const text = typeof payload === 'string' ? payload : (payload as any)?.text || '';
            const ms = this.humanDelayFor(text);
            await this.emulateHuman(jid, 'composing', ms);
          }

          const messageResult = await this.socket.sendMessage(jid, content); // Send the actual message
          if (options?.trackDelivery && messageResult?.key?.id) this.trackMessageDelivery(messageResult.key.id, this.phoneNumber, toNumber, options); // Track message delivery if enabled

          const idleTime = this.randomIdle(); // Add random idle time after sending
          await new Promise((resolve) => setTimeout(resolve, idleTime));

          return messageResult;
        })();

        this.log('info', `Message sent successfully to ${jid}`);

        // Track message delivery and set up callbacks if requested
        const messageId = raw?.key?.id;
        if (messageId) {
          // Only set up callbacks if not already tracking (to avoid overwriting delivery status)
          if ((options?.onUpdate || this.hasGlobalMessageUpdateCallback) && !options?.trackDelivery) {
            this.trackMessageDelivery(messageId, this.phoneNumber, toNumber, options);
          }

          this.setupMessageUpdateCallbacks?.(messageId, options || {});
        }

        // Wait for delivery confirmation if requested
        let deliveryStatus: WAMessageDelivery | null = null;
        if (options?.waitForDelivery || options?.waitForRead) {
          if (messageId) {
            this.log('info', `Waiting for delivery confirmation for message ${messageId}...`);

            try {
              await this.waitForMessageStatus(messageId, options);
              this.log('info', `Message ${messageId} delivery confirmed`);
              deliveryStatus = this.getMessageDeliveryStatus(messageId);
            } catch (_error) {
              this.log('warn', `Delivery confirmation timeout for message (${messageId})`, toNumber);
              deliveryStatus = this.getMessageDeliveryStatus(messageId);

              // Check if we should throw on delivery error
              if (options?.throwOnDeliveryError && deliveryStatus?.status === MessageStatusEnum.ERROR) {
                throw new Error(`Message delivery failed: ${deliveryStatus.errorMessage || 'Unknown error'}`);
              }
            }
          }
        }

        this.update({
          lastSentMessage: this.getTodayDate(),
          dailyMessageCount: this.appState?.lastSentMessage !== this.getTodayDate() ? 1 : (this.appState?.dailyMessageCount || 0) + 1,
        } as WAAppAuth<T>);

        // Trigger outgoing message callback
        try {
          await this.onOutgoingMessage?.(record, raw, deliveryStatus || undefined);
        } catch (error) {
          this.log('error', 'Error in outgoing message callback:', error);
        }

        onSuccess?.(record, raw, deliveryStatus || undefined);

        return { messageId: raw!.key.id, sentAt: getLocalTime(), ...raw, ...(deliveryStatus || {}) } as WebMessageInfo & Partial<WAMessageDelivery>;
      } catch (error: any) {
        lastError = error;

        // Enhanced error detection for blocks
        const errorMessage = error?.message || '';
        const errorCode = error?.output?.statusCode || error?.statusCode;

        // Detect specific block scenarios
        if (errorCode === 403 || errorMessage.includes('Forbidden')) {
          this.log('error', `🚫 User ${toNumber} has blocked this number`);
          await this.handleMessageBlocked(toNumber, 'USER_BLOCKED');
          this.update({
            outgoingErrorCount: (this.appState?.outgoingErrorCount || 0) + 1,
            errorMessage,
            lastErrorAt: getLocalTime(),
          } as WAAppAuth<T>);
          throw new Error(`Message blocked: User has blocked this number`);
        }

        if (errorCode === 401 || errorMessage.includes('Unauthorized')) {
          this.log('error', `🚫 Authentication failed - account may be blocked`);
          await this.handleMessageBlocked(toNumber, 'AUTH_FAILED');
          this.update({
            outgoingErrorCount: (this.appState?.outgoingErrorCount || 0) + 1,
            errorMessage,
            lastErrorAt: getLocalTime(),
          } as WAAppAuth<T>);
          throw new Error(`Message blocked: Authentication failed`);
        }

        if (errorCode === 429 || errorMessage.includes('Too Many Requests')) {
          this.log('error', `🚫 Rate limited - too many messages`);
          await this.handleMessageBlocked(toNumber, 'RATE_LIMITED');
          this.update({
            outgoingErrorCount: (this.appState?.outgoingErrorCount || 0) + 1,
            errorMessage,
            lastErrorAt: getLocalTime(),
          } as WAAppAuth<T>);
          throw new Error(`Message blocked: Rate limited`);
        }

        this.log(attempt < maxRetries ? 'debug' : 'error', `Send attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = Math.min(retryDelay * Math.pow(2, attempt - 1), 5000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          onFailure?.(lastError, attempt);
        }
      }
    }

    options?.onFailure?.(lastError, attempts);
    throw lastError;
  }

  public async refresh(): Promise<boolean> {
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

  public async remove(): Promise<void> {
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
      this.log('info', 'Clearing session data from database...');
      await this.cleanupAndRemoveTempDir();
      await this.deleteAppAuth();
      this.log('info', 'Session data cleared successfully');

      this.connected = false;
      this.socket = null;
      this.saveCreds = null;

      await this.onRemove();
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      this.log('warn', 'Failed to cleanup instance:', error);
    }
  }

  public async disconnect(clearSocket: boolean = false, reason: string = 'Manual disconnect'): Promise<void> {
    if (!this.connected) {
      this.hasManualDisconnected = true;

      return;
    }

    try {
      this.log('info', '🔄 Initiating manual disconnect...');

      // Stop all background processes
      this.stopKeepAlive();
      this.stopHealthCheck();
      this.hasManualDisconnected = true;

      this.connected = false;
      if (clearSocket) this.socket = null;
      await this.onDisconnect(reason);

      this.log('info', '✅ Disconnect completed successfully');
    } catch (error) {
      this.log('error', '❌ Error during disconnect:', error);
      throw error;
    }
  }

  public async enable(): Promise<void> {
    await this.update({ isActive: true } as WAAppAuth<T>);
    await this.connect();
  }

  public async disable(): Promise<void> {
    await this.update({ isActive: false } as WAAppAuth<T>);
    await this.disconnect();
  }

  public async update(data: Partial<WAAppAuth<T>>): Promise<void> {
    const hasChanges = Object.entries(data).some(([key, value]) => {
      const hasValueChanged = this.appState?.[key as keyof typeof this.appState] !== value;
      this.log('debug', `State changed: ${hasValueChanged}`, `[${key}]`, this.appState?.[key as keyof typeof this.appState], '->', value);

      return hasValueChanged;
    });

    if (hasChanges) {
      this.set(data);

      this.set((await this.updateAppAuth(data)) || this.appState);
      this.onUpdate(data);
    } else if (data.outgoingMessageCount !== undefined) {
      this.log('debug', `📱 Update skipped for outgoingMessageCount: no changes detected`);
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

    Array.from(this.deliveryTimeouts.values()).forEach(clearTimeout);
    this.deliveryTimeouts.clear();
    this.messageDeliveries.clear();

    this.connected = false;
    this.socket = null;
    this.saveCreds = null;
    this.log('info', 'Instance cleanup completed');
  }
}
