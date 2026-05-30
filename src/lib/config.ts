// Typed env getters. Throws at startup if a required variable is missing.
// Import `config` everywhere rather than reading process.env directly.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const config = {
  ms: {
    get tenantId()        { return required("MS_TENANT_ID"); },
    get clientId()        { return required("MS_CLIENT_ID"); },
    get clientSecret()    { return required("MS_CLIENT_SECRET"); },
    get botUserEmail()    { return required("MS_BOT_USER_EMAIL"); },
    get botUserPassword() { return required("MS_BOT_USER_PASSWORD"); },
    get organizerEmail()  { return required("MS_ORGANIZER_EMAIL"); },
  },
  llm: {
    get provider()      { return required("MODEL_PROVIDER"); },
    get modelId()       { return required("MODEL_ID"); },
    get geminiKey()     { return optional("GEMINI_API_KEY"); },
    get anthropicKey()  { return optional("ANTHROPIC_API_KEY"); },
    get openaiKey()     { return optional("OPENAI_API_KEY"); },
    get deepseekKey()   { return optional("DEEPSEEK_API_KEY"); },
    get deepseekBaseUrl() { return process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1"; },
  },
  app: {
    get outputDir()   { return process.env.INTERVIEWLY_OUTPUT_DIR ?? "./data/output"; },
    get logLevel()    { return process.env.LOG_LEVEL ?? "info"; },
    get nextAuthUrl() { return process.env.NEXTAUTH_URL ?? "http://localhost:3000"; },
    get testMode()    { return process.env.MEDHA_TEST_MODE === "true"; },
    get fixtureRole() { return process.env.MEDHA_TEST_FIXTURE_ROLE ?? "react"; },
    get fixtureOutcome() { return process.env.MEDHA_TEST_FIXTURE_OUTCOME ?? "good-hire"; },
    get baseUrl()     { return process.env.MEDHA_BASE_URL?.trim() ?? "http://localhost:3000"; },
  },
  // Scope Y — sidecar bot integration. Both optional: when unset, Medha
  // operates in pure-chat mode (Scope X keyword/timer only).
  bot: {
    get baseUrl()      { return optional("MEDHA_BOT_BASE_URL"); },
    get sharedSecret() { return optional("MEDHA_BOT_SHARED_SECRET"); },
  },
} as const;
