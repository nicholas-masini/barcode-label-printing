export interface LabelItem {
  id: string
  /** The data encoded in the barcode */
  value: string
  /** Optional human-readable line printed above the barcode */
  text: string
  quantity: number
}

export interface LabelSettings {
  widthMm: number
  heightMm: number
  format: string
  /** Print the encoded value under the bars */
  displayValue: boolean
}

export type PrinterLanguage = 'PPLA' | 'PPLB' | 'PPLZ'
export type ConnectionType = 'network' | 'usb'

export interface PrinterConfig {
  /** Argox command language the printer firmware speaks */
  language: PrinterLanguage
  dpi: 203 | 300
  connectionType: ConnectionType
  /** Network: printer IP/hostname, raw TCP */
  host: string
  port: number
  /** USB: Windows printer queue name */
  printerName: string
  /** Gap between labels on the roll (transmissive sensing) */
  gapMm: number
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  language: 'PPLB',
  dpi: 203,
  connectionType: 'usb',
  host: '',
  port: 9100,
  printerName: '',
  gapMm: 3,
}

export const PRINTER_LANGUAGES: { value: PrinterLanguage; label: string }[] = [
  { value: 'PPLB', label: 'PPLB (EPL2-compatible)' },
  { value: 'PPLA', label: 'PPLA (Datamax-compatible)' },
  { value: 'PPLZ', label: 'PPLZ (ZPL-compatible)' },
]

export const BARCODE_FORMATS: { value: string; label: string }[] = [
  { value: 'CODE128', label: 'Code 128 (any text)' },
  { value: 'CODE39', label: 'Code 39' },
  { value: 'EAN13', label: 'EAN-13 (12–13 digits)' },
  { value: 'EAN8', label: 'EAN-8 (7–8 digits)' },
  { value: 'UPC', label: 'UPC-A (11–12 digits)' },
  { value: 'ITF14', label: 'ITF-14 (14 digits incl. check)' },
  { value: 'MSI', label: 'MSI (PPLA/PPLZ only)' },
  { value: 'codabar', label: 'Codabar' },
]

export interface LabelPreset {
  name: string
  widthMm: number
  heightMm: number
}

/** Common thermal label stock sizes for Argox desktop printers */
export const LABEL_PRESETS: LabelPreset[] = [
  { name: '50 × 25 mm', widthMm: 50, heightMm: 25 },
  { name: '57 × 32 mm', widthMm: 57, heightMm: 32 },
  { name: '40 × 30 mm', widthMm: 40, heightMm: 30 },
  { name: '57 × 19 mm', widthMm: 57, heightMm: 19 },
  { name: '100 × 50 mm', widthMm: 100, heightMm: 50 },
  { name: '100 × 150 mm (4×6″)', widthMm: 100, heightMm: 150 },
]

export function newLabel(value = '', text = '', quantity = 1): LabelItem {
  return { id: crypto.randomUUID(), value, text, quantity }
}
