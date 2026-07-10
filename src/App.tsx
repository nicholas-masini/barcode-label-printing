import { useEffect, useMemo, useState } from 'react'
import type { LabelItem, LabelSettings, PrinterConfig } from './types'
import {
  BARCODE_FORMATS,
  DEFAULT_PRINTER_CONFIG,
  LABEL_PRESETS,
  ORIENTATIONS,
  PRINTER_LANGUAGES,
  newLabel,
} from './types'
import { Label } from './components/Label'
import { generatePrintJob } from './printer'
import { isVertical } from './printer/layout'
import { fetchPrinters, sendPrintJob, type WindowsPrinter } from './printer/client'

const CUSTOM_PRESET = 'custom'

type PrintStatus =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'ok'; message: string }
  | { state: 'error'; message: string }

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...initial, ...JSON.parse(raw) } : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}

export default function App() {
  const [settings, setSettings] = usePersistentState<LabelSettings>('label-settings', {
    widthMm: LABEL_PRESETS[0].widthMm,
    heightMm: LABEL_PRESETS[0].heightMm,
    format: 'CODE128',
    displayValue: true,
    orientation: 'auto',
  })
  const [printer, setPrinter] = usePersistentState<PrinterConfig>(
    'printer-config',
    DEFAULT_PRINTER_CONFIG,
  )
  const [labels, setLabels] = useState<LabelItem[]>([newLabel('SKU-000123', 'Sample product')])
  const [selectedId, setSelectedId] = useState<string | null>(labels[0]?.id ?? null)
  const [bulkText, setBulkText] = useState('')
  const [status, setStatus] = useState<PrintStatus>({ state: 'idle' })
  const [windowsPrinters, setWindowsPrinters] = useState<WindowsPrinter[] | null>(null)
  const [printersError, setPrintersError] = useState<string | null>(null)

  const selected = labels.find((l) => l.id === selectedId) ?? labels[0] ?? null
  const printable = useMemo(() => labels.filter((l) => l.value.trim()), [labels])
  const totalCopies = useMemo(
    () => printable.reduce((sum, l) => sum + l.quantity, 0),
    [printable],
  )

  const commandPreview = useMemo(() => {
    try {
      return { text: generatePrintJob(printable, settings, printer), error: null as string | null }
    } catch (err) {
      return { text: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [printable, settings, printer])

  useEffect(() => {
    if (printer.connectionType !== 'usb' || windowsPrinters !== null) return
    refreshPrinters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printer.connectionType])

  async function refreshPrinters() {
    setPrintersError(null)
    try {
      const list = await fetchPrinters()
      setWindowsPrinters(list)
      // Preselect the Argox queue if none chosen yet
      if (!list.some((p) => p.Name === printer.printerName)) {
        const argox = list.find((p) => /argox/i.test(`${p.Name} ${p.DriverName ?? ''}`))
        setPrinter((c) => ({ ...c, printerName: (argox ?? list[0])?.Name ?? '' }))
      }
    } catch (err) {
      setWindowsPrinters([])
      setPrintersError(
        `Could not list printers — is the print service running? (${err instanceof Error ? err.message : err})`,
      )
    }
  }

  const presetValue =
    LABEL_PRESETS.find(
      (p) => p.widthMm === settings.widthMm && p.heightMm === settings.heightMm,
    )?.name ?? CUSTOM_PRESET

  function applyPreset(name: string) {
    const preset = LABEL_PRESETS.find((p) => p.name === name)
    if (preset) {
      setSettings((s) => ({ ...s, widthMm: preset.widthMm, heightMm: preset.heightMm }))
    }
  }

  function updateLabel(id: string, patch: Partial<LabelItem>) {
    setLabels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function addLabel() {
    const label = newLabel()
    setLabels((ls) => [...ls, label])
    setSelectedId(label.id)
  }

  function removeLabel(id: string) {
    setLabels((ls) => ls.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function addBulk() {
    const rows = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // Format per line: value [tab or comma] optional text
        const [value, ...rest] = line.split(/[\t,]/)
        return newLabel(value.trim(), rest.join(',').trim())
      })
    if (rows.length === 0) return
    setLabels((ls) => [...ls, ...rows])
    setBulkText('')
  }

  async function handlePrint() {
    setStatus({ state: 'sending' })
    try {
      const bytes = await sendPrintJob(printer, commandPreview.text)
      const target =
        printer.connectionType === 'network'
          ? `${printer.host}:${printer.port}`
          : printer.printerName
      setStatus({
        state: 'ok',
        message: `Sent ${totalCopies} label${totalCopies === 1 ? '' : 's'} (${bytes} bytes) to ${target}`,
      })
    } catch (err) {
      setStatus({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const canPrint =
    totalCopies > 0 &&
    !commandPreview.error &&
    status.state !== 'sending' &&
    (printer.connectionType === 'network' ? printer.host.trim() !== '' : printer.printerName !== '')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Barcode Label Printer</h1>
        <div className="header-actions">
          {status.state === 'ok' && <span className="status status-ok">{status.message}</span>}
          {status.state === 'error' && (
            <span className="status status-error">{status.message}</span>
          )}
          <button className="print-button" onClick={handlePrint} disabled={!canPrint}>
            {status.state === 'sending'
              ? 'Sending…'
              : `🖨 Print${totalCopies > 0 ? ` ${totalCopies} label${totalCopies === 1 ? '' : 's'}` : ''}`}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="panel settings-panel">
          <h2>Printer</h2>
          <label className="field">
            <span>Connection</span>
            <select
              value={printer.connectionType}
              onChange={(e) =>
                setPrinter((c) => ({
                  ...c,
                  connectionType: e.target.value as PrinterConfig['connectionType'],
                }))
              }
            >
              <option value="usb">USB (Windows printer queue)</option>
              <option value="network">Network (raw TCP, port 9100)</option>
            </select>
          </label>

          {printer.connectionType === 'usb' ? (
            <>
              <label className="field">
                <span>Windows printer</span>
                <select
                  value={printer.printerName}
                  onChange={(e) => setPrinter((c) => ({ ...c, printerName: e.target.value }))}
                >
                  {windowsPrinters === null && <option value="">Loading…</option>}
                  {windowsPrinters?.length === 0 && <option value="">No printers found</option>}
                  {windowsPrinters?.map((p) => (
                    <option key={p.Name} value={p.Name}>
                      {p.Name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="link-button" onClick={refreshPrinters}>
                ↻ Refresh printer list
              </button>
              {printersError && <div className="status status-error">{printersError}</div>}
            </>
          ) : (
            <div className="field-row">
              <label className="field" style={{ flex: 2 }}>
                <span>Printer IP / hostname</span>
                <input
                  placeholder="192.168.1.50"
                  value={printer.host}
                  onChange={(e) => setPrinter((c) => ({ ...c, host: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>Port</span>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={printer.port}
                  onChange={(e) =>
                    setPrinter((c) => ({ ...c, port: Number(e.target.value) || 9100 }))
                  }
                />
              </label>
            </div>
          )}

          <label className="field">
            <span>Printer language</span>
            <select
              value={printer.language}
              onChange={(e) =>
                setPrinter((c) => ({ ...c, language: e.target.value as PrinterConfig['language'] }))
              }
            >
              {PRINTER_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Resolution</span>
              <select
                value={printer.dpi}
                onChange={(e) =>
                  setPrinter((c) => ({ ...c, dpi: Number(e.target.value) as 203 | 300 }))
                }
              >
                <option value={203}>203 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </label>
            <label className="field">
              <span>Label gap (mm)</span>
              <input
                type="number"
                min={0}
                max={10}
                value={printer.gapMm}
                onChange={(e) => setPrinter((c) => ({ ...c, gapMm: Number(e.target.value) || 0 }))}
              />
            </label>
          </div>
          <div className="hint">
            The language must match your printer's firmware (check the self-test page — hold FEED
            while powering on). OS/CP series ship as PPLA or PPLB; newer models also speak PPLZ.
          </div>

          <h2>Label stock</h2>
          <label className="field">
            <span>Preset</span>
            <select value={presetValue} onChange={(e) => applyPreset(e.target.value)}>
              {LABEL_PRESETS.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
              <option value={CUSTOM_PRESET}>Custom…</option>
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Width (mm)</span>
              <input
                type="number"
                min={10}
                max={220}
                value={settings.widthMm}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, widthMm: Number(e.target.value) || s.widthMm }))
                }
              />
            </label>
            <label className="field">
              <span>Height (mm)</span>
              <input
                type="number"
                min={10}
                max={300}
                value={settings.heightMm}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, heightMm: Number(e.target.value) || s.heightMm }))
                }
              />
            </label>
          </div>

          <h2>Barcode</h2>
          <label className="field">
            <span>Symbology</span>
            <select
              value={settings.format}
              onChange={(e) => setSettings((s) => ({ ...s, format: e.target.value }))}
            >
              {BARCODE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={settings.displayValue}
              onChange={(e) => setSettings((s) => ({ ...s, displayValue: e.target.checked }))}
            />
            <span>Print value under barcode</span>
          </label>
          <label className="field">
            <span>Orientation</span>
            <select
              value={settings.orientation}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  orientation: e.target.value as LabelSettings['orientation'],
                }))
              }
            >
              {ORIENTATIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {isVertical(settings) && printer.language !== 'PPLA' && (
            <div className="hint">
              Vertical layout is currently applied for PPLA output only; {printer.language} prints
              horizontally.
            </div>
          )}
        </aside>

        <main className="panel queue-panel">
          <div className="queue-header">
            <h2>Labels to print</h2>
            <button onClick={addLabel}>+ Add label</button>
          </div>

          <div className="queue-list">
            {labels.length === 0 && <div className="empty">No labels yet — add one above.</div>}
            {labels.map((label) => (
              <div
                key={label.id}
                className={`queue-row ${selected?.id === label.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(label.id)}
              >
                <input
                  className="value-input"
                  placeholder="Barcode value"
                  value={label.value}
                  onChange={(e) => updateLabel(label.id, { value: e.target.value })}
                />
                <input
                  className="text-input"
                  placeholder="Text line (optional)"
                  value={label.text}
                  onChange={(e) => updateLabel(label.id, { text: e.target.value })}
                />
                <input
                  className="qty-input"
                  type="number"
                  min={1}
                  max={999}
                  value={label.quantity}
                  title="Copies"
                  onChange={(e) =>
                    updateLabel(label.id, {
                      quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                    })
                  }
                />
                <button
                  className="remove-button"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeLabel(label.id)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <details className="bulk-add">
            <summary>Bulk add (one per line: value, optional text)</summary>
            <textarea
              rows={5}
              placeholder={'SKU-001\tRed widget\nSKU-002\tBlue widget'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button onClick={addBulk} disabled={!bulkText.trim()}>
              Add all
            </button>
          </details>
        </main>

        <section className="panel preview-panel">
          <h2>Preview</h2>
          {selected ? (
            <>
              <div className="preview-stage">
                <Label
                  item={selected}
                  settings={settings}
                  vertical={isVertical(settings) && printer.language === 'PPLA'}
                />
              </div>
              <div className="preview-caption">
                {settings.widthMm} × {settings.heightMm} mm
                {isVertical(settings) && printer.language === 'PPLA' ? ' · vertical' : ''} —
                approximate; the printer renders barcodes and fonts natively from the commands below.
              </div>
            </>
          ) : (
            <div className="empty">Select a label to preview it.</div>
          )}
          {commandPreview.error && (
            <div className="status status-error">{commandPreview.error}</div>
          )}
          <details className="command-preview">
            <summary>Printer commands ({printer.language})</summary>
            <pre>
              {commandPreview.error
                ? '— fix the error above —'
                : commandPreview.text.replaceAll('\x02', '<STX>').replaceAll('\r', '<CR>\n') ||
                  '— no printable labels —'}
            </pre>
          </details>
        </section>
      </div>
    </div>
  )
}
