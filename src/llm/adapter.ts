export type AgentMessage = { role: "system" | "user" | "assistant" | "tool"; content: string }
export type AgentTool = { name: string; description: string; parameters: Record<string, unknown> }
export type LlmResponse = { content: string; toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> }

export interface LlmAdapter {
  enviar(messages: AgentMessage[], tools: AgentTool[], options: { maxTokens: number; timeoutMs: number }): Promise<LlmResponse>
}
