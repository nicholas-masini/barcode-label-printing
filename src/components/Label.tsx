import type { LabelItem, LabelSettings } from '../types'
import { BarcodeSvg } from './BarcodeSvg'

interface Props {
  item: LabelItem
  settings: LabelSettings
}

/** A single label rendered at its physical size (CSS mm units). */
export function Label({ item, settings }: Props) {
  return (
    <div
      className="label"
      style={{ width: `${settings.widthMm}mm`, height: `${settings.heightMm}mm` }}
    >
      {item.text && <div className="label-text">{item.text}</div>}
      <BarcodeSvg
        value={item.value}
        format={settings.format}
        displayValue={settings.displayValue}
      />
    </div>
  )
}
