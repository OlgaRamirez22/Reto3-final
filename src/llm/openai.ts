import type { AgentMessage, AgentTool, LlmAdapter, LlmResponse } from "./adapter"

export class OpenAiAdapter implements LlmAdapter {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async enviar(messages: AgentMessage[], tools: AgentTool[], options: { maxTokens: number; timeoutMs: number }): Promise<LlmResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), max_tokens: options.maxTokens }),
      signal: AbortSignal.timeout(options.timeoutMs),
    })
    if (!response.ok) throw new Error(`Proveedor LLM no disponible (${response.status}).`)
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> }
    const message = body.choices?.[0]?.message
    return { content: message?.content ?? "", toolCalls: (message?.tool_calls ?? []).map((call) => ({ name: call.function.name, arguments: JSON.parse(call.function.arguments) as Record<string, unknown> })) }
  }
}
