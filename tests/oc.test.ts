import { rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { construir_payload, crear, leer_paquete, validar } from "../src/tools/oc"
import type { OrdenCompra, Paquete, Validation } from "../src/types"

const ctx = { directory: join(import.meta.dir, ".."), sessionId: "test" }
const result = <T>(raw: string) => JSON.parse(raw) as { ok: boolean; data?: T; error?: string }

async function review(caso: string) {
  const pack = result<Paquete>(await leer_paquete.execute({ caso }, ctx))
  if (!pack.ok || !pack.data) throw new Error(pack.error)
  const validation = result<Validation>(await validar.execute({ caso, paquete: pack.data }, ctx))
  if (!validation.ok || !validation.data) throw new Error(validation.error)
  return { paquete: pack.data, validation: validation.data }
}

beforeAll(async () => { await rm(join(ctx.directory, "out"), { recursive: true, force: true }) })
afterAll(async () => { await rm(join(ctx.directory, "out"), { recursive: true, force: true }) })

test("sol-001 crea la orden y es idempotente", async () => {
  const { paquete, validation } = await review("sol-001")
  expect(validation.apta).toBe(true)
  expect(validation.confirmaciones).toEqual([])
  const payload = result<{ orden: OrdenCompra }>(await construir_payload.execute({ caso: "sol-001", paquete, derivados: validation.derivados }, ctx))
  expect(payload.ok).toBe(true)
  const first = result<{ numero_oc: string; idempotente: boolean }>(await crear.execute({ caso: "sol-001", payload: payload.data?.orden as OrdenCompra }, ctx))
  const second = result<{ numero_oc: string; idempotente: boolean }>(await crear.execute({ caso: "sol-001", payload: payload.data?.orden as OrdenCompra }, ctx))
  expect(first.data?.numero_oc).toBe(second.data?.numero_oc)
  expect(second.data?.idempotente).toBe(true)
})

test("sol-002 bloquea proveedor inexistente", async () => {
  const { validation } = await review("sol-002")
  expect(validation.apta).toBe(false)
  expect(validation.bloqueos.join(" ")).toContain("RC1")
})

test("sol-003 bloquea aprobación no autorizada", async () => {
  const { validation } = await review("sol-003")
  expect(validation.apta).toBe(false)
  expect(validation.bloqueos.join(" ")).toContain("RC2")
})

test("sol-004 exige confirmación por diferencia de cotización", async () => {
  const { validation } = await review("sol-004")
  expect(validation.apta).toBe(true)
  expect(validation.confirmaciones.join(" ")).toContain("RC5")
})

test("sol-005 detecta retroactividad", async () => {
  const { validation } = await review("sol-005")
  expect(validation.retroactiva).toBe(true)
  expect(validation.confirmaciones.join(" ")).toContain("RC8")
})

test("sol-006 deriva IVA y genera ambas evidencias", async () => {
  const { paquete, validation } = await review("sol-006")
  expect(validation.derivados.indicador_iva).toBe("C1")
  const payload = result<{ orden: OrdenCompra }>(await construir_payload.execute({ caso: "sol-006", paquete, derivados: validation.derivados }, ctx))
  expect(payload.ok).toBe(true)
  await expect(stat(join(ctx.directory, "out", "sol-006", "aprobacion.txt"))).resolves.toBeDefined()
  await expect(stat(join(ctx.directory, "out", "sol-006", "aprobacion.pdf"))).resolves.toBeDefined()
})
