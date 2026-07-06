import type { PrinterConfig } from '../types'

export interface WindowsPrinter {
  Name: string
  DriverName?: string
  PortName?: string
}

/** Commands are ASCII (plus STX for PPLA); encode byte-safe for transport. */
function toBase64(data: string): string {
  const bytes = new TextEncoder().encode(data)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export async function fetchPrinters(): Promise<WindowsPrinter[]> {
  const res = await fetch('/api/printers')
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body.printers ?? []
}

export async function sendPrintJob(printer: PrinterConfig, data: string): Promise<number> {
  const connection =
    printer.connectionType === 'network'
      ? { type: 'network', host: printer.host, port: printer.port }
      : { type: 'usb', printerName: printer.printerName }

  const res = await fetch('/api/print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection, dataBase64: toBase64(data) }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Print service error (HTTP ${res.status})`)
  return body.bytes as number
}
