import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { SapAdapter } from "./adapter"
import type { OrdenCompra } from "../types"

export class MockSapAdapter implements SapAdapter {
  constructor(private readonly directory: string) {}
  private get path() { return join(this.directory, "out", "sap", "ordenes.jsonl") }
  private async rows(): Promise<Array<{ numero_oc: string; orden: OrdenCompra }>> { try { return (await readFile(this.path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as { numero_oc: string; orden: OrdenCompra }) } catch { return [] } }
  async consultarProveedor(_nit: string): Promise<{ codigo_sap: string; activo: boolean } | null> { return null }
  async buscarOrdenPorReferencia(solicitudId: string): Promise<{ numero_oc: string } | null> { const found = (await this.rows()).find((row) => row.orden.referencia.solicitud_id === solicitudId); return found ? { numero_oc: found.numero_oc } : null }
  async crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }> { const rows = await this.rows(); const numero_oc = String(4500000001 + rows.length); const fecha = new Date().toISOString(); await mkdir(join(this.directory, "out", "sap"), { recursive: true }); await writeFile(this.path, `${JSON.stringify({ numero_oc, fecha, orden })}\n`, { flag: "a" }); return { numero_oc, fecha } }
}
