// ---------------------------------------------------------------------------
// Simple Ollama client for integration testing
// ---------------------------------------------------------------------------

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaOptions {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  temperature?: number;
}

export interface OllamaResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export class OllamaClient {
  constructor(
    private baseUrl: string = 'http://localhost:11434',
    private defaultModel: string = 'kimi-k2.6:cloud'
  ) {}

  async chat(options: Omit<OllamaOptions, 'stream'>): Promise<OllamaResponse> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || this.defaultModel,
        messages: options.messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }

    return res.json() as Promise<OllamaResponse>;
  }

  async generate(prompt: string, model?: string): Promise<string> {
    const res = await this.chat({
      model: model || this.defaultModel,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.message.content;
  }
}
