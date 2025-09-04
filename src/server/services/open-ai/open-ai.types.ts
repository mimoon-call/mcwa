type Model =
  // GPT-4 Models
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-4-turbo-preview'
  | 'gpt-4'
  | 'gpt-4-32k'
  | 'gpt-4-0613'
  | 'gpt-4-0314'

  // GPT-3.5 Models
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-16k'
  | 'gpt-3.5-turbo-0613'
  | 'gpt-3.5-turbo-0301'

  // DALL-E Models
  | 'dall-e-3'
  | 'dall-e-2'

  // Whisper Models
  | 'whisper-1'

  // Embedding Models
  | 'text-embedding-ada-002'
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'

  // Fine-tuned Models
  | 'gpt-4-0125-preview'
  | 'gpt-4-1106-preview'
  | 'gpt-3.5-turbo-0125'
  | 'gpt-3.5-turbo-1106';

export type TTSModal = 'gpt-4o-mini-tts';
export type STTModal = 'gpt-4o-mini-transcribe';

type Role = 'user' | 'assistant' | 'system' | 'tool';

type SchemaType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer';

export interface JsonSchema {
  type: SchemaType;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: readonly any[] | any[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean;
  name?: string;
}

export interface OpenAiMessage {
  role: Role;
  content: string;
  name?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface OpenAiFunction {
  name: string;
  description?: string;
  parameters: JsonSchema;
}

// More restrictive types for better validation
export type Temperature = 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1.0 | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 | 1.6 | 1.7 | 1.8 | 1.9 | 2.0;
export type TopP = 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1.0;
export type Penalty =
  | -2.0
  | -1.9
  | -1.8
  | -1.7
  | -1.6
  | -1.5
  | -1.4
  | -1.3
  | -1.2
  | -1.1
  | -1.0
  | -0.9
  | -0.8
  | -0.7
  | -0.6
  | -0.5
  | -0.4
  | -0.3
  | -0.2
  | -0.1
  | 0.0
  | 0.1
  | 0.2
  | 0.3
  | 0.4
  | 0.5
  | 0.6
  | 0.7
  | 0.8
  | 0.9
  | 1.0
  | 1.1
  | 1.2
  | 1.3
  | 1.4
  | 1.5
  | 1.6
  | 1.7
  | 1.8
  | 1.9
  | 2.0;

export type MaxTokens = 1 | 10 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 | 1500 | 2000 | 2500 | 3000 | 3500 | 4000 | 4096;

export type OpenAiRequest = {
  model: Model;
  messages: OpenAiMessage[];
  temperature: Temperature;
  top_p?: TopP;
  presence_penalty?: Penalty;
  frequency_penalty?: Penalty;
  max_tokens?: MaxTokens;
  response_format: { type: 'json_schema'; json_schema: JsonSchema };
  functions?: OpenAiFunction[];
  function_call?: 'auto' | 'none' | { name: string };
  stream?: boolean;
};

export type OpenAiResponse = {
  choices: {
    message: {
      content?: string;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
      function_call?: { name: string; arguments: string };
    };
  }[];
};

export type TTSFormat = 'ogg' | 'mp3' | 'wav' | 'pcm';
