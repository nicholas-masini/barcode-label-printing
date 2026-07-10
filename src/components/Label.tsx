import type { LabelItem, LabelSettings } from '../types'
import { BarcodeSvg } from './BarcodeSvg'

interface Props {
  item: LabelItem
  settings: LabelSettings
  /** Render the barcode running the length of the label (rotated 90°). */
  vertical?: boolean
}

/** A single label rendered at its physical size (CSS mm units). */
export function Label({ item, settings, vertical = false }: Props) {
  const content = (
    <>
      {item.text && <div className="label-text">{item.text}</div>}
      <BarcodeSvg
        value={item.value}
        format={settings.format}
        displayValue={settings.displayValue}
      />
    </>
  )

  if (vertical) {
    // Frame stays portrait; an inner "rotor" holds the normal (landscape)
    // content and is rotated 90° to fill it — so the barcode runs the length
    // with the value on one side and the text on the other, matching print.
    return (
      <div
        className="label label-vertical"
        style={{ width: `${settings.widthMm}mm`, height: `${settings.heightMm}mm` }}
      >
        <div
          className="label-rotor"
          style={{ width: `${settings.heightMm}mm`, height: `${settings.widthMm}mm` }}
        >
          {content}
        </div>
      </div>
    )
  }

  return (
    <div
      className="label"
      style={{ width: `${settings.widthMm}mm`, height: `${settings.heightMm}mm` }}
    >
      {content}
    </div>
  )
}
