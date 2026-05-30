import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { config } from "@/lib/config";
import { UsageTrackerCallback } from "@/lib/usage/tracker";

/** Budget-tracker opts threaded through every getChatModel call site. */
export interface ChatModelOpts {
  /** Optional interview id — joins the call to a specific interview in the usage breakdown. */
  interviewId?: string;
  /** Short label for the call's purpose, e.g. "question-plan", "transcript-mapping", "branching". */
  purpose?: string;
}

/**
 * Pick the structured-output method that the active provider actually supports.
 *
 *   - DeepSeek's OpenAI-compatible API only honours `response_format:
 *     {type: "json_object"}` (jsonMode). It does NOT support OpenAI's
 *     strict `response_format: {type: "json_schema", ...}` path, so the
 *     default LangChain method silently returns malformed shapes.
 *
 *   - OpenAI native + Anthropic + Google work fine with the LangChain
 *     defaults — pass `undefined` to let LangChain pick.
 *
 * Use:
 *   const method = structuredOutputMethod();
 *   const structured = model.withStructuredOutput(schema, method ? { method } : {});
 */
export function structuredOutputMethod(): "jsonMode" | "functionCalling" | undefined {
  switch (config.llm.provider) {
    case "deepseek":
      return "jsonMode";
    default:
      return undefined;
  }
}

export function getChatModel(temperature = 0.5, opts?: ChatModelOpts): BaseChatModel {
  const provider = config.llm.provider;
  // Budget tracker — registers a LangChain callback that fires
  // handleLLMEnd on every invocation (including those wrapped by
  // withStructuredOutput, withRetry, etc). Provider-normalised token
  // counts → cost table → ring buffer.
  const callbacks = [new UsageTrackerCallback({
    provider,
    modelId: config.llm.modelId,
    interviewId: opts?.interviewId,
    purpose: opts?.purpose,
  })];

  if (provider === "google") {
    const apiKey = config.llm.geminiKey;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required when MODEL_PROVIDER=google");
    return new ChatGoogleGenerativeAI({
      model: config.llm.modelId,
      apiKey,
      temperature,
      callbacks,
    }) as unknown as BaseChatModel;
  }

  if (provider === "anthropic") {
    const apiKey = config.llm.anthropicKey;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required when MODEL_PROVIDER=anthropic");
    return new ChatAnthropic({ model: config.llm.modelId, apiKey, temperature, callbacks });
  }

  if (provider === "openai") {
    const apiKey = config.llm.openaiKey;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when MODEL_PROVIDER=openai");
    return new ChatOpenAI({ model: config.llm.modelId, apiKey, temperature, callbacks });
  }

  if (provider === "deepseek") {
    const apiKey = config.llm.deepseekKey;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required when MODEL_PROVIDER=deepseek");
    // DeepSeek API is OpenAI-compatible. Phase-1.5 default model is
    // `deepseek-v4-flash` — confirmed live against
    // GET https://api.deepseek.com/v1/models on 2026-05-27.
    //
    // V4-flash is a *hybrid* model that returns reasoning_content by
    // default, which (a) doubles latency, (b) burns tokens, and
    // (c) confuses structured-output parsing. We disable thinking
    // explicitly via `thinking: { type: "disabled" }` — verified to
    // work end-to-end on 2026-05-27.
    return new ChatOpenAI({
      model: config.llm.modelId,
      apiKey,
      temperature,
      callbacks,
      configuration: {
        baseURL: config.llm.deepseekBaseUrl,
      },
      modelKwargs: {
        thinking: { type: "disabled" },
      },
    });
  }

  throw new Error(
    `Unknown MODEL_PROVIDER: "${provider}". Must be google | anthropic | openai | deepseek`
  );
}
