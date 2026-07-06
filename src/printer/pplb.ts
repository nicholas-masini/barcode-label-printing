import type { LabelItem, LabelSettings, PrinterConfig } from '../types'
import { computeLayout } from './layout'

// EPL2 resident bitmap font 3 at 203 dpi: 12×20 glyph, 14.5 cpi → 14-dot advance.
// (Argox's PPLB manual shows samples only; dimensions per the Zebra EPL2 manual.)
const FONT = { id: 3, w: 12, h: 20, advance: 14 }

/**
 * JsBarcode format → PPLB "B" command type code, per the Argox PPLB
 * Programmer's Manual barcode table.
 * ITF-14 = plain Interleaved 2 of 5: enter all 14 digits (incl. check digit).
 * MSI is absent from Argox PPLB (unlike stock EPL2) — rejected below.
 */
const BARCODE_TYPE: Record<string, string> = {
  CODE128: '1', // Code 128 auto subsets
  CODE39: '3',
  EAN13: 'E30',
  EAN8: 'E80',
  UPC: 'UA0',
  ITF14: '2',
  codabar: 'K',
}

/** Free-ratio symbologies use the wide-bar parameter (1:2–1:3); fixed codes ignore it. */
const RATIO_BASED = new Set(['CODE39', 'ITF14', 'codabar'])

function quote(text: string): string {
  // EPL2 strings are double-quoted; backslash escapes " and \
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Generates a PPLB (EPL2-compatible) job for one label.
 * Reference: Argox PPLB Programmer's Manual (2009). Lines end with LF.
 */
export function generatePplb(
  item: LabelItem,
  settings: LabelSettings,
  printer: PrinterConfig,
): string {
  const type = BARCODE_TYPE[settings.format]
  if (!type) {
    throw new Error(
      `${settings.format} is not supported by PPLB firmware — switch the symbology, or use PPLA/PPLZ.`,
    )
  }

  const layout = computeLayout({
    item,
    settings,
    dpi: printer.dpi,
    gapMm: printer.gapMm,
    textCharAdvance: FONT.advance,
    textLineHeight: FONT.h + 8,
    humanReadableHeight: 24, // HR line renders below the bars, beyond the height param
  })

  const lines: string[] = []
  lines.push('N') // clear image buffer
  lines.push(`q${layout.widthDots}`) // label width in dots
  lines.push(`Q${layout.heightDots},${layout.gapDots}`) // label length, gap in dots

  if (layout.text) {
    lines.push(
      `A${layout.text.x},${layout.text.y},0,${FONT.id},1,1,N,${quote(item.text.trim())}`,
    )
  }

  const narrow = layout.barcode.module
  const wide = RATIO_BASED.has(settings.format) ? narrow * 3 : narrow * 2
  const hr = settings.displayValue ? 'B' : 'N'
  lines.push(
    `B${layout.barcode.x},${layout.barcode.y},0,${type},${narrow},${wide},${layout.barcode.height},${hr},${quote(item.value)}`,
  )

  lines.push(`P${item.quantity}`) // print N labels
  return lines.join('\n') + '\n'
}
