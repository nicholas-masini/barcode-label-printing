import type { LabelItem, LabelSettings } from '../types'

export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm * dpi) / 25.4)
}

/**
 * Approximate total barcode width in modules (narrow-bar units).
 * Used for centering and for auto-picking the widest module that fits —
 * a few dots of error is invisible on a label.
 */
export function estimateModules(format: string, value: string): number {
  const len = value.length
  switch (format) {
    case 'EAN13':
    case 'UPC':
      return 95
    case 'EAN8':
      return 67
    case 'CODE39':
      // 9 elements/char, 3 wide (ratio 3) + 6 narrow, +1 gap; start/stop chars included
      return (len + 2) * 16 - 1
    case 'ITF14':
      // 7 digit pairs × (2 wide + 3 narrow) × 2 elements + start/stop
      return 7 * 18 + 9 + 5
    case 'MSI':
      return len * 12 + 24
    case 'codabar':
      return (len + 2) * 13
    case 'CODE128':
    default:
      // mode B worst case: start + data + check + stop, 11 modules each + 2-module bar
      return (len + 3) * 11 + 2
  }
}

export interface ComputedLayout {
  widthDots: number
  heightDots: number
  gapDots: number
  text: { x: number; y: number } | null
  barcode: { x: number; y: number; module: number; height: number }
}

interface LayoutOptions {
  item: LabelItem
  settings: LabelSettings
  dpi: number
  gapMm: number
  /** Advance width in dots of one character of the font used for the text line */
  textCharAdvance: number
  /** Height in dots of the text line (including breathing room below it) */
  textLineHeight: number
  /** Vertical dots to reserve for the human-readable line under the bars */
  humanReadableHeight: number
}

/** Shared geometry for all three printer languages. */
export function computeLayout(opts: LayoutOptions): ComputedLayout {
  const { item, settings, dpi } = opts
  const widthDots = mmToDots(settings.widthMm, dpi)
  const heightDots = mmToDots(settings.heightMm, dpi)
  const margin = mmToDots(2, dpi)
  const availWidth = widthDots - 2 * margin

  const hasText = item.text.trim().length > 0
  const textBlock = hasText ? opts.textLineHeight : 0
  const hrBlock = settings.displayValue ? opts.humanReadableHeight : 0

  const modules = estimateModules(settings.format, item.value)
  const module = Math.min(4, Math.max(1, Math.floor(availWidth / modules)))
  const barcodeWidth = modules * module

  const barcodeHeight = Math.max(mmToDots(4, dpi), heightDots - 2 * margin - textBlock - hrBlock)

  const text = hasText
    ? {
        x: Math.max(
          margin,
          Math.round((widthDots - item.text.length * opts.textCharAdvance) / 2),
        ),
        y: margin,
      }
    : null

  return {
    widthDots,
    heightDots,
    gapDots: mmToDots(opts.gapMm, dpi),
    text,
    barcode: {
      x: Math.max(margin, Math.round((widthDots - barcodeWidth) / 2)),
      y: margin + textBlock,
      module,
      height: barcodeHeight,
    },
  }
}
