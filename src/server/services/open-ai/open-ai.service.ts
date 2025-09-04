// open-ai.service.ts
import axios, { type AxiosResponse } from 'axios';
import type { OpenAiRequest, OpenAiMessage, JsonSchema, OpenAiFunction, OpenAiResponse, TTSFormat, STTModal, TTSModal } from './open-ai.types';

export interface OpenAiServiceConfig {
  apiKey?: string;
  apiUrl?: string;
  maxRetries?: number;
  delayMs?: number;
}

export class OpenAiService {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly maxRetries: number;
  private readonly delayMs: number;

  constructor(config: OpenAiServiceConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY!;
    this.apiUrl = config.apiUrl || process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
    this.maxRetries = config.maxRetries || 3;
    this.delayMs = config.delayMs || 500;

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  private extractErrMsg(err: unknown): string {
    const anyErr = err as any;

    return (
      anyErr?.response?.data?.error?.message ??
      (anyErr?.response?.data ? JSON.stringify(anyErr.response.data) : undefined) ??
      (err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err))
    );
  }

  private async retryAsyncFunction<T>(
    asyncFunction: (lastError?: string, attempt?: number) => Promise<T | null>,
    runTime: number = 0,
    lastError?: string
  ): Promise<T | null> {
    if (runTime >= this.maxRetries) return null;

    try {
      return await asyncFunction(lastError, runTime + 1);
    } catch (err: unknown) {
      const errorMessage = this.extractErrMsg(err);
      console.error('OpenAiService', `${runTime + 1}/${this.maxRetries}`, errorMessage);
      await new Promise((r) => setTimeout(r, this.delayMs));

      return this.retryAsyncFunction(asyncFunction, runTime + 1, errorMessage);
    }
  }

  async request(messages: OpenAiMessage[], options: Partial<Omit<OpenAiRequest, 'messages'>> = {}): Promise<OpenAiResponse | null> {
    const defaultOptions: Partial<OpenAiRequest> = { model: 'gpt-4o-mini', temperature: 0.7 };
    const requestPayload: OpenAiRequest = { ...defaultOptions, ...options, messages } as OpenAiRequest;

    return this.retryAsyncFunction(async (lastError, attempt) => {
      if (lastError) {
        console.warn(`OpenAiService retry attempt ${attempt}: ${lastError}`);
      }

      const response: AxiosResponse<OpenAiResponse> = await axios.post(this.apiUrl, requestPayload, {
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      });

      return response.data;
    });
  }

  async requestWithJsonSchema<T = any>(
    messages: OpenAiMessage[],
    jsonSchema: JsonSchema,
    options: Partial<Omit<OpenAiRequest, 'messages' | 'response_format'>> = {}
  ): Promise<T | null> {
    // Use functions API instead of response_format for JSON schema
    const functionName = jsonSchema.name || 'get_response';
    const functionDefinition: OpenAiFunction = {
      name: functionName,
      description: 'Get the response in the specified format',
      parameters: jsonSchema,
    };

    const response = await this.request(messages, {
      ...options,
      functions: [functionDefinition],
      function_call: { name: functionName },
    });

    if (!response) {
      return null;
    }

    const message = response.choices?.[0]?.message;
    let raw: string;

    if (message?.tool_calls?.[0]?.function?.arguments) {
      // New functions API response (tool_calls)
      raw = message.tool_calls[0].function.arguments;
    } else if (message?.function_call?.arguments) {
      // Old functions API response (function_call)
      raw = message.function_call.arguments;
    } else if (message?.content) {
      // Regular response format
      raw = message.content;
    } else {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      console.error('Raw response:', raw);
      return null;
    }
  }

  // open-ai.service.ts (inside OpenAiService class)
  async textToSpeech(text: string, format: TTSFormat = 'ogg', options: { voice?: string; model?: TTSModal } = {}): Promise<Buffer | null> {
    const ttsUrl = process.env.OPENAI_TTS_URL || 'https://api.openai.com/v1/audio/speech';
    const model = options.model ?? 'gpt-4o-mini-tts';
    const voice = options.voice ?? 'alloy';

    // Use your built-in retry wrapper
    return this.retryAsyncFunction<Buffer>(async (lastError, attempt) => {
      if (lastError) console.warn('OpenAiService', `TTS retry ${attempt}: ${lastError}`);

      const res = await axios.post(
        ttsUrl,
        { model, voice, input: text, format },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'arraybuffer', // <-- get raw audio bytes
        }
      );

      return Buffer.from(res.data);
    });
  }

  async speechToText(
    audio: Buffer,
    mimeType: string = 'audio/ogg',
    options: { model?: STTModal; prompt?: string; language?: string } = {}
  ): Promise<string | null> {
    const sttUrl = process.env.OPENAI_STT_URL || 'https://api.openai.com/v1/audio/transcriptions';
    const model = options.model ?? 'gpt-4o-mini-transcribe'; // or "whisper-1"

    return this.retryAsyncFunction<string>(async (lastError, attempt) => {
      if (lastError) console.warn('OpenAiService', `STT retry ${attempt}: ${lastError}`);

      const formData = new FormData();
      formData.append('model', model);
      if (options.prompt) formData.append('prompt', options.prompt);
      if (options.language) formData.append('language', options.language);
      formData.append('file', new Blob([audio], { type: mimeType }), 'audio.ogg');

      const res = await axios.post(sttUrl, formData, { headers: { Authorization: `Bearer ${this.apiKey}` } });

      return res.data?.text ?? null;
    });
  }

  // Helper method to create a simple user message
  createUserMessage(content: string): OpenAiMessage {
    return { role: 'user', content };
  }

  // Helper method to create a system message
  createSystemMessage(content: string): OpenAiMessage {
    return { role: 'system', content };
  }

  // Helper method to create an assistant message
  createAssistantMessage(content: string): OpenAiMessage {
    return { role: 'assistant', content };
  }
}
