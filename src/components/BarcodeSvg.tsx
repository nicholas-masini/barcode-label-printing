import { useLayoutEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'

interface Props {
  value: string
  format: string
  displayValue: boolean
}

/**
 * Renders a barcode as an SVG that scales to fill its parent while
 * preserving aspect ratio. Reports invalid values inline instead of throwing.
 */
export function BarcodeSvg({ value, format, displayValue }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [valid, setValid] = useState(true)

  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg) return
    let ok = Boolean(value)
    if (ok) {
      try {
        JsBarcode(svg, value, {
          format,
          displayValue,
          margin: 0,
          width: 2,
          height: 80,
          fontSize: 18,
          valid: (v: boolean) => {
            ok = v
          },
        })
      } catch {
        ok = false
      }
    }
    if (ok) {
      // Let CSS drive the size: convert the fixed px dimensions JsBarcode
      // emits (e.g. "246px") into a unitless viewBox so the barcode scales
      // with the label.
      const w = parseFloat(svg.getAttribute('width') ?? '')
      const h = parseFloat(svg.getAttribute('height') ?? '')
      if (w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      svg.removeAttribute('width')
      svg.removeAttribute('height')
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    } else {
      svg.innerHTML = ''
    }
    setValid(ok)
  }, [value, format, displayValue])

  return (
    <>
      <svg ref={ref} className="barcode-svg" style={valid ? undefined : { display: 'none' }} />
      {!valid && (
        <div className="barcode-error">
          {value ? `"${value}" is not valid for ${format}` : 'No value'}
        </div>
      )}
    </>
  )
}
