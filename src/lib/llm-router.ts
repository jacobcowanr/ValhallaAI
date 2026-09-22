/**
 * LLM Router
 * Abstraction layer for multiple LLM providers: OpenRouter, OpenAI, DeepSeek, Anthropic, local
 */

export type LLMProvider = "nous" | "anthropic" | "anthropic_oauth" | "claude_directsdk" | "chatgpt" | "minimax" | "qwen" | "xai_grok" | "github_copilot" | "fireworks" | "openrouter" | "local";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Route a request to the appropriate LLM provider
 */
export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  try {
    switch (config.provider) {
      case "nous":
        return await callNous(config, messages);
      case "anthropic":
      case "anthropic_oauth":
        return await callAnthropic(config, messages);
      case "claude_directsdk":
        return await callClaudeDirectSDK(config, messages);
      case "chatgpt":
        return await callOpenAI(config, messages);
      case "minimax":
        return await callMiniMax(config, messages);
      case "qwen":
        return await callQwen(config, messages);
      case "xai_grok":
        return await callGrok(config, messages);
      case "github_copilot":
        return await callOpenAI(config, messages);
      case "fireworks":
        return await callFireworks(config, messages);
      case "openrouter":
        return await callOpenRouter(config, messages);
      case "local":
        return await callLocal(config, messages);
      default:
        return {
          success: false,
          error: `Unknown provider: ${config.provider}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * OpenRouter: aggregated endpoint for multiple models
 */
async function callOpenRouter(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://vahalla.local",
      "X-Title": "Vahalla",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.choices[0]?.message?.content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * OpenAI: direct endpoint
 */
async function callOpenAI(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.choices[0]?.message?.content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * DeepSeek: direct endpoint
 */
async function callDeepSeek(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.choices[0]?.message?.content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * Anthropic (Claude): SDK + API
 */
async function callAnthropic(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  // This would use the Anthropic SDK in a real implementation
  // For now, direct API call
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey || process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens || 2048,
      messages: messages,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.content[0]?.text,
    usage: {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    },
  };
}

/**
 * Grok (X.AI): direct endpoint
 */
async function callGrok(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.choices[0]?.message?.content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * Local: Ollama or similar local LLM
 */
async function callLocal(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const baseURL = config.baseURL || "http://localhost:11434";
  const response = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      num_predict: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.message?.content,
  };
}

/**
 * Nous Portal: aggregated endpoint (same as OpenRouter for Nous)
 */
async function callNous(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://inference-api.nousresearch.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.NOUS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.choices[0]?.message?.content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * Claude Subscription DirectSDK (via Claude CLI)
 */
async function callClaudeDirectSDK(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  // This delegates to the Hermes DirectSDK plugin or local Claude CLI
  // For now, use Anthropic API as fallback
  return await callAnthropic(config, messages);
}

/**
 * MiniMax: direct endpoint
 */
async function callMiniMax(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://api.minimax.chat/v1/text/chatcompletion", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      tokens_to_generate: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.reply,
  };
}

/**
 * Qwen: direct endpoint
 */
async function callQwen(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.QWEN_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        messages: messages,
      },
      parameters: {
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 2048,
      },
    }),
  });

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.output?.text,
  };
}

/**
 * Fireworks AI: direct endpoint
 */
async function callFireworks(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<LLMResponse> {
  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.apiKey || process.env.FIREWORKS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2048,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return {
      success: false,
      error: error.error?.message || `HTTP ${response.status}`,
    };
  }

  const data = await response.json();
  return {
    success: true,
    content: data.choices[0]?.message?.content,
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
  };
}

/**
 * Get available models from OpenRouter
 */
export async function getOpenRouterModels(apiKey?: string): Promise<string[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey || process.env.OPENROUTER_API_KEY}`,
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  } catch {
    return [];
  }
}
