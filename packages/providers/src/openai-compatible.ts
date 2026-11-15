import type { AIProvider, ChatMessage, ModelCapabilities, ModelCompletionOptions, ModelResponse, ToolCall } from "./types.js";
import type { EgressMode } from "@appbridge/core";

export interface OpenAICompatibleOptions {
  id?: string;
  name?: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
  egressMode?: EgressMode;
  capabilitiesOverride?: Partial<ModelCapabilities>;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly is_local: boolean;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultModel: string;
  private readonly egressMode: EgressMode;
  private readonly customCaps?: Partial<ModelCapabilities>;

  constructor(options: OpenAICompatibleOptions) {
    this.id = options.id ?? "openai-compatible";
    this.name = options.name ?? "OpenAI-Compatible Model";
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel ?? "default";
    this.egressMode = options.egressMode ?? "cloud-allowed";
    this.customCaps = options.capabilitiesOverride;

    // Check if endpoint is local (loopback / local network)
    const url = new URL(this.baseUrl);
    const host = url.hostname.toLowerCase();
    this.is_local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");

    if (this.egressMode === "local-only" && !this.is_local) {
      throw new Error(`Policy violation: egress.mode is 'local-only', cannot connect to remote host ${host}`);
    }
  }

  async capabilities(model?: string): Promise<ModelCapabilities> {
    const isLocalSmall = this.is_local;
    return {
      vision: this.customCaps?.vision ?? false,
      tool_calling: this.customCaps?.tool_calling ?? true,
      context_tokens: this.customCaps?.context_tokens ?? (isLocalSmall ? 8192 : 128000),
      streaming: this.customCaps?.streaming ?? false,
      json_mode: this.customCaps?.json_mode ?? true,
    };
  }

  async complete(messages: ChatMessage[], options?: ModelCompletionOptions): Promise<ModelResponse> {
    if (this.egressMode === "local-only" && !this.is_local) {
      throw new Error(`Policy blocked: outbound request to non-local model prevented by local-only egress mode`);
    }

    const model = options?.model ?? this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => {
        if (m.image_base64) {
          return {
            role: m.role,
            content: [
              { type: "text", text: m.content },
              { type: "image_url", image_url: { url: `data:image/png;base64,${m.image_base64}` } },
            ],
          };
        }
        return { role: m.role, content: m.content };
      }),
      temperature: options?.temperature ?? 0.2,
    };

    if (options?.tools && options.tools.length > 0) {
      body["tools"] = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Model API error (${res.status}): ${errText}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = json.choices?.[0]?.message;
    const text = choice?.content ?? "";
    const toolCalls: ToolCall[] = [];

    if (choice?.tool_calls) {
      for (const tc of choice.tool_calls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          parsedArgs = { raw: tc.function.arguments };
        }
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    return {
      text,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      tokens_used: json.usage
        ? {
            prompt: json.usage.prompt_tokens,
            completion: json.usage.completion_tokens,
            total: json.usage.total_tokens,
          }
        : undefined,
    };
  }
}
