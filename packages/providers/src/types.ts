export interface ModelCapabilities {
  vision: boolean;
  tool_calling: boolean;
  context_tokens: number;
  streaming: boolean;
  json_mode: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  image_base64?: string;
}

export interface ModelCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelResponse {
  text: string;
  tool_calls?: ToolCall[];
  tokens_used?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly is_local: boolean;
  capabilities(model?: string): Promise<ModelCapabilities>;
  complete(messages: ChatMessage[], options?: ModelCompletionOptions): Promise<ModelResponse>;
}
