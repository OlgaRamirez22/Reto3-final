import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { createLlmAdapter } from "./llm"
import type { AgentTool } from "./llm/adapter"
import { tools, type ToolContext } from "./tools/oc"
import type { OrdenCompra, Paquete, Validation } from "./types"

type ToolCall = { name: string; args: unknown; result: unknown }
type ToolResult<T> = { ok: boolean; data?: T; error?: string }
type Session = { messages: Array<{ role: "user" | "assistant"; content: string }>; pending?: { caso: string; paquete: Paquete; validation: Validation; payload: OrdenCompra } }

const directory = join(import.meta.dir, "..")
const sessions = new Map<string, Session>()
const maxIterations = Number(process.env.MAX_AGENT_ITERATIONS ?? 25)
const maxTokens = Number(process.env.MAX_SESSION_TOKENS ?? 1200)
const llm = createLlmAdapter()
const parse = <T,>(value: string): ToolResult<T> => JSON.parse(value) as ToolResult<T>
const isConfirm = (message: string) => /^(confirmo|confirmar|sí|si|acepto|proceda|procede)\b/i.test(message.trim())
const isReject = (message: string) => /^(no|no confirmo|rechazo|cancelar|cancelo)\b/i.test(message.trim())
const definitions: AgentTool[] = Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description, parameters: { type: "object", properties: Object.fromEntries(Object.keys(tool.args).map((key) => [key, { type: "string" }])), additionalProperties: false } }))

async function call(name: keyof typeof tools, args: unknown, ctx: ToolContext, calls: ToolCall[]): Promise<ToolResult<unknown>> {
  const tool = tools[name]
  const validated = z.object(tool.args).parse(args)
  const raw = await tool.execute(validated as never, ctx)
  const result = parse<unknown>(raw)
  calls.push({ name, args, result })
  await mkdir(join(directory, "out"), { recursive: true })
  await appendFile(join(directory, "out", "log.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), sessionId: ctx.sessionId, name, args, result })}\n`)
  return result
}

async function processCase(caso: string, ctx: ToolContext, calls: ToolCall[]): Promise<{ reply: string; pending?: Session["pending"] }> {
  if (calls.length >= maxIterations) return { reply: "Se alcanzó el límite de herramientas del turno. Revisa el caso y vuelve a intentarlo." }
  const pack = await call("oc_leer_paquete", { caso }, ctx, calls)
  if (!pack.ok) return { reply: String(pack.error) }
  const paquete = pack.data as Paquete
  const check = await call("oc_validar", { caso, paquete }, ctx, calls)
  if (!check.ok) return { reply: String(check.error) }
  const validation = check.data as Validation
  if (!validation.apta) return { reply: `La solicitud ${caso} está bloqueada:\n- ${validation.bloqueos.join("\n- ")}\nAcción sugerida: solicita la corrección o evidencia faltante.` }
  const built = await call("oc_construir_payload", { caso, paquete, derivados: validation.derivados }, ctx, calls)
  if (!built.ok) return { reply: String(built.error) }
  const payload = (built.data as { orden: OrdenCompra }).orden
  await call("oc_generar_evidencia", { caso }, ctx, calls)
  const item = payload.posiciones[0]
  const summary = `OC preparada\nProveedor: ${payload.proveedor.nombre}\nDescripción: ${item.descripcion}\nCentro / subárea: ${item.centro_costo} / ${item.subarea}\nValor: ${paquete.solicitud.moneda} ${paquete.solicitud.valor_total}\nIVA: ${item.indicador_iva}\nPago: ${payload.condiciones_pago}`
  if (validation.confirmaciones.length) return { reply: `${summary}\n\nRequiere confirmación:\n- ${validation.confirmaciones.join("\n- ")}\n¿Confirmas crear la OC?`, pending: { caso, paquete, validation, payload } }
  const created = await call("oc_crear", { caso, payload }, ctx, calls)
  return { reply: created.ok ? `${summary}\n\nOC creada: ${(created.data as { numero_oc: string }).numero_oc}.` : String(created.error) }
}

async function answerWithLlm(message: string): Promise<string> {
  if (!llm) return "Indica el caso, por ejemplo: Procesa la solicitud sol-001."
  const prompt = await readFile(join(directory, "agent", "prompt.md"), "utf8")
  const response = await llm.enviar([{ role: "system", content: prompt }, { role: "user", content: message }], definitions, { maxTokens, timeoutMs: 15_000 })
  return response.content || "Indica una solicitud identificada por sol-001 a sol-006."
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/api/health") return Response.json({ ok: true, provider: process.env.LLM_PROVIDER ?? "deterministic", model: process.env.OPENAI_MODEL ?? "reglas-locales", limits: { maxIterations, maxTokens } })
    if (url.pathname.startsWith("/api/sessions/") && request.method === "GET") return Response.json(sessions.get(url.pathname.split("/").pop() ?? "") ?? { messages: [] })
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const input = (await request.json()) as { sessionId?: string; message?: string }
        if (!input.sessionId || !input.message) return Response.json({ error: "sessionId y message son requeridos" }, { status: 400 })
        const session = sessions.get(input.sessionId) ?? { messages: [] }
        const ctx = { directory, sessionId: input.sessionId }
        const calls: ToolCall[] = []
        session.messages.push({ role: "user", content: input.message })
        let answer: { reply: string; pending?: Session["pending"] }
        if (session.pending && isConfirm(input.message)) {
          const created = await call("oc_crear", { caso: session.pending.caso, payload: session.pending.payload, confirmado: true }, ctx, calls)
          answer = { reply: created.ok ? `OC creada: ${(created.data as { numero_oc: string }).numero_oc}.` : String(created.error) }
          session.pending = undefined
        } else if (session.pending && isReject(input.message)) {
          answer = { reply: `La creación de ${session.pending.caso} fue cancelada. No se creó ninguna OC.` }
          session.pending = undefined
        } else if (session.pending) {
          answer = { reply: "La OC sigue pendiente. Responde “Confirmo” para crearla o “Cancelar” para descartarla.", pending: session.pending }
          session.pending = answer.pending
        } else {
          const caso = input.message.match(/sol-\d{3}/i)?.[0]?.toLowerCase()
          answer = caso ? await processCase(caso, ctx, calls) : { reply: await answerWithLlm(input.message) }
          session.pending = answer.pending
        }
        session.messages.push({ role: "assistant", content: answer.reply })
        sessions.set(input.sessionId, session)
        return Response.json({ reply: answer.reply, toolCalls: calls, needsConfirmation: Boolean(session.pending) })
      } catch (cause) {
        return Response.json({ reply: `Error procesando el turno: ${cause instanceof Error ? cause.message : "desconocido"}`, toolCalls: [], needsConfirmation: false }, { status: 500 })
      }
    }
    if (url.pathname === "/" || url.pathname === "/index.html") return new Response(await readFile(join(directory, "web", "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } })
    return new Response("No encontrado", { status: 404 })
  },
})

console.log(`Agente disponible en http://localhost:${server.port}`)
