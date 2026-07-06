import type { LabelItem, LabelSettings, PrinterConfig } from '../types'
import { computeLayout } from './layout'

const TEXT_HEIGHT = 24 // scalable font ^A0 height in dots

/**
 * Generates a PPLZ (ZPL II-compatible) job for one label.
 * Reference: Argox PPLZ Programmer's Manual / Zebra ZPL II manual.
 */
export function generatePplz(
  item: LabelItem,
  settings: LabelSettings,
  printer: PrinterConfig,
): string {
  const layout = computeLayout({
    item,
    settings,
    dpi: printer.dpi,
    gapMm: printer.gapMm,
    textCharAdvance: Math.round(TEXT_HEIGHT * 0.55),
    textLineHeight: TEXT_HEIGHT + 8,
    humanReadableHeight: 32, // interpretation line prints below the bars
  })

  const hr = settings.displayValue ? 'Y' : 'N'
  const { x, y, module, height } = layout.barcode

  // Per-symbology barcode command (rotation N, height, human-readable, no check line)
  const BARCODE_CMD: Record<string, string> = {
    CODE128: `^BCN,${height},${hr},N,N,A`, // mode A = automatic subset selection
    CODE39: `^B3N,N,${height},${hr},N`,
    EAN13: `^BEN,${height},${hr},N`,
    EAN8: `^B8N,${height},${hr},N`,
    UPC: `^BUN,${height},${hr},N,Y`,
    ITF14: `^B2N,${height},${hr},N,N`,
    codabar: `^BKN,N,${height},${hr},N,A,A`,
    MSI: `^BMN,B,${height},${hr},N,N`,
  }
  const barcodeCmd = BARCODE_CMD[settings.format] ?? BARCODE_CMD.CODE128

  const parts: string[] = []
  parts.push('^XA')
  parts.push(`^PW${layout.widthDots}`)
  parts.push(`^LL${layout.heightDots}`)
  parts.push('^LH0,0')

  if (layout.text) {
    parts.push(
      `^FO${layout.text.x},${layout.text.y}^A0N,${TEXT_HEIGHT},${TEXT_HEIGHT}^FD${sanitize(item.text.trim())}^FS`,
    )
  }

  parts.push(`^BY${module},3,${height}`)
  parts.push(`^FO${x},${y}${barcodeCmd}^FD${sanitize(item.value)}^FS`)
  parts.push(`^PQ${item.quantity}`)
  parts.push('^XZ')
  return parts.join('\n') + '\n'
}

/** ^ and ~ are ZPL control characters and cannot appear in ^FD data. */
function sanitize(text: string): string {
  return text.replace(/[\^~]/g, ' ')
}
