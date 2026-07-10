import type { LabelItem, LabelSettings } from '../types'

export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm * dpi) / 25.4)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
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

/** Whether the barcode should be rotated to run the length of the label. */
export function isVertical(settings: LabelSettings): boolean {
  if (settings.orientation === 'vertical') return true
  if (settings.orientation === 'horizontal') return false
  return settings.heightMm > settings.widthMm // 'auto': rotate on portrait stock
}

export interface VerticalLayout {
  widthDots: number
  heightDots: number
  gapDots: number
  /** Narrow-bar width in dots */
  module: number
  /** Bar height across the label width (dots) */
  barHeightDots: number
  /** Encoded barcode length along the label height (dots) */
  barLenDots: number
  /** Top-left corner of the barcode's physical footprint (dots, top-origin) */
  barLeftDots: number
  barTopDots: number
  /** Top-left of the product-text footprint, beside the bars (dots, top-origin) */
  text: { leftDots: number; topDots: number } | null
}

interface VerticalLayoutOptions {
  item: LabelItem
  settings: LabelSettings
  dpi: number
  gapMm: number
  /** Dots advanced per character along the length (after rotation) */
  textCharAdvance: number
  /** Font height in dots (across the length) */
  textHeight: number
}

/**
 * Geometry for a rotated (vertical) label: the barcode runs the length of the
 * label with its bars spanning the width, the value auto-printed on one side
 * and the product text on the other. Positions are top-origin dots; the
 * generator maps them to its own rotation commands.
 */
export function computeVerticalLayout(opts: VerticalLayoutOptions): VerticalLayout {
  const { item, settings, dpi } = opts
  const widthDots = mmToDots(settings.widthMm, dpi)
  const heightDots = mmToDots(settings.heightMm, dpi)
  const endMargin = mmToDots(6, dpi)

  // Bars span across the width; leave room either side for the value + text.
  const barHeightDots = clamp(Math.round(widthDots * 0.5), mmToDots(12, dpi), mmToDots(24, dpi))

  // Encoded length runs along the longer (height) axis — more room, thicker bars.
  const availLen = Math.max(mmToDots(10, dpi), heightDots - 2 * endMargin)
  const modules = estimateModules(settings.format, item.value)
  const module = clamp(Math.floor(availLen / modules), 1, 5)
  const barLenDots = Math.min(availLen, modules * module)

  const barLeftDots = Math.round((widthDots - barHeightDots) / 2)
  const barTopDots = Math.round((heightDots - barLenDots) / 2)

  const label = item.text.trim()
  const text =
    label.length > 0
      ? {
          leftDots: Math.round(barLeftDots + barHeightDots + mmToDots(2, dpi)),
          topDots: Math.round(
            (heightDots - Math.min(availLen, label.length * opts.textCharAdvance)) / 2,
          ),
        }
      : null

  return {
    widthDots,
    heightDots,
    gapDots: mmToDots(opts.gapMm, dpi),
    module,
    barHeightDots,
    barLenDots,
    barLeftDots,
    barTopDots,
    text,
  }
}

/** Shared geometry for all three printer languages. */
export function computeLayout(opts: LayoutOptions): ComputedLayout {
  const { item, settings, dpi } = opts
  const widthDots = mmToDots(settings.widthMm, dpi)
  const heightDots = mmToDots(settings.heightMm, dpi)
  const margin = mmToDots(1.5, dpi)
  const availWidth = widthDots - 2 * margin

  const hasText = item.text.trim().length > 0
  const textBlock = hasText ? opts.textLineHeight : 0
  const hrBlock = settings.displayValue ? opts.humanReadableHeight : 0

  const modules = estimateModules(settings.format, item.value)
  const module = Math.min(4, Math.max(1, Math.floor(availWidth / modules)))
  const barcodeWidth = modules * module

  // A readable barcode height: ~40% of the label, clamped so it neither
  // disappears on short stock nor stretches the full length of a long label.
  const barcodeHeight = clamp(
    Math.round(heightDots * 0.4),
    mmToDots(8, dpi),
    mmToDots(25, dpi),
  )

  // Stack [text?] + [barcode] + [human-readable?] as one block and center it
  // vertically, so there is even whitespace above and below.
  const blockHeight = textBlock + barcodeHeight + hrBlock
  const blockTop = Math.max(margin, Math.round((heightDots - blockHeight) / 2))

  const text = hasText
    ? {
        x: Math.max(
          margin,
          Math.round((widthDots - item.text.length * opts.textCharAdvance) / 2),
        ),
        y: blockTop,
      }
    : null

  return {
    widthDots,
    heightDots,
    gapDots: mmToDots(opts.gapMm, dpi),
    text,
    barcode: {
      x: Math.max(margin, Math.round((widthDots - barcodeWidth) / 2)),
      y: blockTop + textBlock,
      module,
      height: barcodeHeight,
    },
  }
}
