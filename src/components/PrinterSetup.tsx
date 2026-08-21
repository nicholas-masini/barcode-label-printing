import { useState } from 'react'
import type { PrinterConfig } from '../types'
import { sendCommand } from '../printer/client'
import {
  DARKNESS_MAX,
  DARKNESS_MIN,
  PPLA_SPEEDS,
  SENSOR_TYPES,
  pplaSetup,
  setupSupported,
  type SensorType,
} from '../printer/setup'

interface Props {
  printer: PrinterConfig
  setPrinter: (updater: (c: PrinterConfig) => PrinterConfig) => void
  /** Label length (mm) used when selecting continuous media. */
  labelLengthMm: number
}

type Status = { kind: 'ok' | 'error' | 'sending'; text: string } | null

export function PrinterSetup({ printer, setPrinter, labelLengthMm }: Props) {
  const [sensor, setSensor] = useState<SensorType>('reflective')
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)

  const target =
    printer.connectionType === 'network'
      ? `${printer.host}:${printer.port}`
      : printer.printerName
  const hasTarget =
    printer.connectionType === 'network'
      ? printer.host.trim() !== ''
      : printer.printerName !== ''
  const canSend = !busy && hasTarget

  async function run(label: string, data: string) {
    setBusy(true)
    setStatus({ kind: 'sending', text: `${label}…` })
    try {
      const bytes = await sendCommand(printer, data)
      setStatus({ kind: 'ok', text: `${label} — sent ${bytes} byte${bytes === 1 ? '' : 's'} to ${target}` })
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!setupSupported(printer)) {
    return (
      <div className="setup">
        <div className="panel setup-panel">
          <h2>Printer setup</h2>
          <div className="hint">
            In-app setup commands are implemented for <strong>PPLA</strong>. Set the printer
            language to PPLA (in the Print tab) to use them.
          </div>
        </div>
      </div>
    )
  }

  const darknessOn = typeof printer.darkness === 'number'

  return (
    <div className="setup">
      <section className="panel setup-panel">
        <h2>Media &amp; calibration</h2>

        <label className="field">
          <span>Sensor / media type</span>
          <select value={sensor} onChange={(e) => setSensor(e.target.value as SensorType)}>
            {SENSOR_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field-hint">{SENSOR_TYPES.find((s) => s.value === sensor)?.hint}</div>
        <button
          className="setup-button primary"
          disabled={!canSend}
          onClick={() => run('Set sensor', pplaSetup.sensor(sensor, labelLengthMm))}
        >
          Apply sensor type
        </button>
        <div className="field-hint">
          Transient — reverts on power-off. Re-apply after power-cycling, or run calibration.
        </div>

        <div className="setup-row">
          <button
            className="setup-button"
            disabled={!canSend}
            onClick={() => run('Feed', pplaSetup.feed())}
          >
            Feed one label
          </button>
          <button
            className="setup-button"
            disabled={!canSend}
            onClick={() => run('Calibrate', pplaSetup.calibrate())}
            title="DPL Quick Media Calibration — may be ignored by PPLA firmware"
          >
            Calibrate media <span className="badge">experimental</span>
          </button>
        </div>
        <div className="field-hint">
          If calibrate does nothing, use the printer's FEED-button power-on, or just re-apply the
          sensor type + feed.
        </div>
      </section>

      <section className="panel setup-panel">
        <h2>Print quality</h2>
        <div className="field-hint">Applied to every label printed from the Print tab.</div>

        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={darknessOn}
            onChange={(e) =>
              setPrinter((c) => ({ ...c, darkness: e.target.checked ? (c.darkness ?? 10) : undefined }))
            }
          />
          <span>Set darkness (else use printer default)</span>
        </label>
        {darknessOn && (
          <label className="field">
            <span>Darkness: {printer.darkness}</span>
            <input
              type="range"
              min={DARKNESS_MIN}
              max={DARKNESS_MAX}
              value={printer.darkness}
              onChange={(e) => setPrinter((c) => ({ ...c, darkness: Number(e.target.value) }))}
            />
          </label>
        )}

        <label className="field">
          <span>Print speed</span>
          <select
            value={printer.speed ?? ''}
            onChange={(e) =>
              setPrinter((c) => ({ ...c, speed: e.target.value === '' ? undefined : e.target.value }))
            }
          >
            <option value="">Printer default</option>
            {PPLA_SPEEDS.map((s) => (
              <option key={s.letter} value={s.letter}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel setup-panel">
        <h2>Diagnostics</h2>
        <div className="setup-row">
          <button
            className="setup-button"
            disabled={!canSend}
            onClick={() => run('Head test', pplaSetup.headTest())}
          >
            Print head test
          </button>
          <button
            className="setup-button"
            disabled={!canSend}
            onClick={() => run('Config label', pplaSetup.configLabel())}
            title="DPL config-label print — Argox normally uses the FEED button"
          >
            Config label <span className="badge">experimental</span>
          </button>
        </div>
        <button
          className="setup-button"
          disabled={!canSend}
          onClick={() => {
            if (confirm('Soft-reset the printer? It reboots and reloads saved settings (non-destructive).')) {
              run('Soft reset', pplaSetup.softReset())
            }
          }}
        >
          Soft reset (reboot)
        </button>
      </section>

      {status && (
        <div className={`status status-${status.kind === 'error' ? 'error' : 'ok'} setup-status`}>
          {status.text}
        </div>
      )}
    </div>
  )
}
