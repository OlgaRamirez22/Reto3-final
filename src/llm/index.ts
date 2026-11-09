import type { LlmAdapter } from "./adapter"
import { OpenAiAdapter } from "./openai"

export const createLlmAdapter = (): LlmAdapter | null => {
  if (process.env.LLM_PROVIDER === "openai" && process.env.OPENAI_API_KEY) return new OpenAiAdapter(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL ?? "gpt-4o-mini")
  return null
}
