import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { config } from "@/lib/config";

export function getChatModel(temperature = 0.5): BaseChatModel {
  const provider = config.llm.provider;

  if (provider === "google") {
    const apiKey = config.llm.geminiKey;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required when MODEL_PROVIDER=google");
    return new ChatGoogleGenerativeAI({
      model: config.llm.modelId,
      apiKey,
      temperature,
    }) as unknown as BaseChatModel;
  }

  if (provider === "anthropic") {
    const apiKey = config.llm.anthropicKey;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic");
    return new ChatAnthropic({ model: config.llm.modelId, apiKey, temperature });
  }

  if (provider === "openai") {
    const apiKey = config.llm.openaiKey;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when MODEL_PROVIDER=openai");
    return new ChatOpenAI({ model: config.llm.modelId, apiKey, temperature });
  }

  throw new Error(`Unknown MODEL_PROVIDER: "${provider}". Must be google | anthropic | openai`);
}
