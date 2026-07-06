import type { LabelItem, LabelSettings, PrinterConfig } from '../types'
import { computeLayout } from './layout'

const STX = '\x02'
const CR = '\r' // PPLA records terminate with CR (0x0D) only

/**
 * JsBarcode format → PPLA barcode ID, per the Argox PPLA Programmer's Manual
 * §A10. UPPERCASE = with human-readable text, lowercase = bars only.
 * ITF-14 = plain Interleaved 2 of 5 ("D"): enter all 14 digits.
 * MSI = Argox "Plessey" ("K"), 1–14 digits, mod-10 check appended.
 */
const BARCODE_ID: Record<string, string> = {
  CODE39: 'A',
  UPC: 'B', // 11 digits, check digit appended
  ITF14: 'D',
  CODE128: 'E', // subset B default; no auto mode in PPLA
  EAN13: 'F', // 12 digits, check digit appended
  EAN8: 'G',
  codabar: 'I',
  MSI: 'K',
}

/** Free-ratio symbologies get a 3:1 wide:narrow ratio; fixed codes use wide = narrow. */
const RATIO_BASED = new Set(['CODE39', 'ITF14', 'codabar'])

// PPLA bitmap font 2: full ASCII (fonts 3–6 are numeric/uppercase only).
// ~10×18 dots + 2 spacing at 203 dpi per the Datamax DPL table PPLA emulates.
const FONT = { id: '2', h: 18, advance: 12 }

/** Bar-width / multiplier field: 1–9 then A(10)–O(24). */
function widthChar(n: number): string {
  const v = Math.max(1, Math.min(24, Math.round(n)))
  return v <= 9 ? String(v) : String.fromCharCode(65 + v - 10)
}

function pad(n: number, width: number): string {
  const max = 10 ** width - 1
  return String(Math.max(0, Math.min(max, Math.round(n)))).padStart(width, '0')
}

/**
 * Generates a PPLA (Datamax DPL-compatible) job for one label.
 * Field record layout (15-char header, then data):
 *   <rotation:1><font|barcode:1><wide|hMul:1><narrow|vMul:1><bcHeight|fontSize:3><row:4><col:4><data>
 * Inch mode: positions and barcode height are in 1/100 inch, measured from
 * the BOTTOM-left corner of the label (Y grows upward).
 */
export function generatePpla(
  item: LabelItem,
  settings: LabelSettings,
  printer: PrinterConfig,
): string {
  const layout = computeLayout({
    item,
    settings,
    dpi: printer.dpi,
    gapMm: printer.gapMm,
    textCharAdvance: FONT.advance,
    textLineHeight: FONT.h + 8,
    humanReadableHeight: 24,
  })

  // dots → 1/100 inch (inch mode is the PPLA power-on default, set explicitly below)
  const toUnits = (dots: number) => (dots / printer.dpi) * 100
  // Our layout is top-origin; PPLA rows are bottom-origin.
  const rowFromTop = (yTopDots: number, elementHeightDots: number) =>
    toUnits(layout.heightDots - yTopDots - elementHeightDots)

  const lines: string[] = []
  lines.push(`${STX}n`) // inch mode (matches unit math above)
  lines.push(`${STX}L`) // enter label-formatting mode
  lines.push('D11') // 1×1 dot size

  if (layout.text) {
    lines.push(
      `1${FONT.id}11000` +
        pad(rowFromTop(layout.text.y, FONT.h), 4) +
        pad(toUnits(layout.text.x), 4) +
        item.text.trim(),
    )
  }

  let barcodeId = BARCODE_ID[settings.format] ?? 'E'
  if (!settings.displayValue) barcodeId = barcodeId.toLowerCase()
  const narrow = layout.barcode.module
  const wide = RATIO_BASED.has(settings.format) ? narrow * 3 : narrow
  lines.push(
    `1${barcodeId}${widthChar(wide)}${widthChar(narrow)}` +
      pad(toUnits(layout.barcode.height), 3) +
      pad(rowFromTop(layout.barcode.y, layout.barcode.height), 4) +
      pad(toUnits(layout.barcode.x), 4) +
      item.value,
  )

  lines.push(`Q${pad(item.quantity, 4)}`) // copies
  lines.push('E') // end format and print
  return lines.join(CR) + CR
}
