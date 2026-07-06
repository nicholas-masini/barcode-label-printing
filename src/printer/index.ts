import type { LabelItem, LabelSettings, PrinterConfig } from '../types'
import { generatePpla } from './ppla'
import { generatePplb } from './pplb'
import { generatePplz } from './pplz'

const GENERATORS = {
  PPLA: generatePpla,
  PPLB: generatePplb,
  PPLZ: generatePplz,
} as const

/** Builds one raw print job covering every label (× its copy count). */
export function generatePrintJob(
  labels: LabelItem[],
  settings: LabelSettings,
  printer: PrinterConfig,
): string {
  const generate = GENERATORS[printer.language]
  return labels
    .filter((l) => l.value.trim().length > 0)
    .map((label) => generate(label, settings, printer))
    .join('')
}
