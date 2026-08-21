import type { PrinterConfig } from '../types'

// Control characters (Argox PPLA control-code table).
const STX = '\x02'
const SOH = '\x01'

export type SensorType = 'reflective' | 'gap' | 'continuous'

export const SENSOR_TYPES: { value: SensorType; label: string; hint: string }[] = [
  { value: 'reflective', label: 'Black-mark (reflective)', hint: 'Media with a black stripe on the back' },
  { value: 'gap', label: 'Gap (see-through)', hint: 'Die-cut labels with gaps between them' },
  { value: 'continuous', label: 'Continuous', hint: 'Continuous roll — no gaps or marks' },
]

/** PPLA print-speed letters (Argox mapping); trimmed to the O4-250's usable window. */
export const PPLA_SPEEDS: { letter: string; label: string }[] = [
  { letter: 'C', label: '2 ips' },
  { letter: 'E', label: '3 ips' },
  { letter: 'G', label: '4 ips' },
  { letter: 'I', label: '5 ips' },
  { letter: 'K', label: '6 ips' },
]

export const DARKNESS_MIN = 0
export const DARKNESS_MAX = 20 // Argox PPLA caps heat at 20 (Datamax allows 30)

function pad4(n: number): string {
  return String(Math.max(0, Math.min(9999, Math.round(n)))).padStart(4, '0')
}

const mmToHundredthsInch = (mm: number) => Math.round((mm / 25.4) * 100)

/** Whether the in-app setup commands are available for the selected language. */
export function setupSupported(printer: PrinterConfig): boolean {
  return printer.language === 'PPLA'
}

/**
 * Standalone PPLA setup/calibration command bytes, sent to the printer the same
 * way as a print job (outside <STX>L..E label mode) — matching how the Argox
 * Printer Tool operates. Sources: Argox PPLA Programmer's Manual (2009), cross-
 * checked against the Datamax DPL spec it descends from.
 */
export const pplaSetup = {
  /** Select the media sensor. Transient on PPLA — reverts on power-cycle. */
  sensor(type: SensorType, labelLengthMm: number): string {
    switch (type) {
      case 'reflective':
        return `${STX}r` // 02 72
      case 'gap':
        return `${STX}e` // 02 65
      case 'continuous':
        // Non-zero length selects continuous & disables gap/mark sensing.
        return `${STX}c${pad4(mmToHundredthsInch(labelLengthMm))}` // 02 63 ....
    }
  },

  /** Feed one label to the next gap/mark (one FEED-key press). */
  feed(): string {
    return `${STX}F` // 02 46
  },

  /** Print the print-head dot-pattern (broken-dot) test. */
  headTest(): string {
    return `${STX}T` // 02 54
  },

  /** Non-destructive soft reset: reboot, reload saved config, clear buffers. */
  softReset(): string {
    return `${SOH}#` // 01 23
  },

  /**
   * Experimental: DPL "Quick Media Calibration" — undocumented for PPLA, so the
   * O4-250 may ignore it. Safe fallback re-syncs by re-selecting the sensor and
   * feeding a label.
   */
  calibrate(): string {
    return `${STX}K}Q` // 02 4B 7D 51 (experimental)
  },
  calibrateFallback(type: SensorType, labelLengthMm: number): string {
    return pplaSetup.sensor(type, labelLengthMm) + pplaSetup.feed()
  },

  /** Experimental: DPL config-label print — Argox normally uses the FEED button. */
  configLabel(): string {
    return `${STX}Z` // 02 5A (experimental)
  },
}

/** Per-job PPLA darkness (H) + speed (P) lines, emitted inside a label job. */
export function pplaJobSettings(printer: PrinterConfig): string[] {
  const lines: string[] = []
  if (typeof printer.darkness === 'number') {
    const d = Math.max(DARKNESS_MIN, Math.min(DARKNESS_MAX, Math.round(printer.darkness)))
    lines.push(`H${String(d).padStart(2, '0')}`)
  }
  if (printer.speed) {
    lines.push(`P${printer.speed}`)
  }
  return lines
}
