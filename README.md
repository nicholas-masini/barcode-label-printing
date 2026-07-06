# Barcode Label Printer

A React + Vite web app that prints barcode labels **directly** to an Argox thermal label printer — no browser print dialog. The app generates native Argox printer commands (PPLA / PPLB / PPLZ) and a small bundled print service delivers the raw bytes to the printer over **USB** or **network**.

## How it works

```
React app (localhost:5173)
  └─ generates PPLA/PPLB/PPLZ commands from your labels
       └─ POST /api/print → local print service (Node, localhost:3777)
            ├─ Network: raw TCP to printer-IP:9100
            └─ USB: RAW job to the Windows printer queue (winspool)
```

The local service exists because browsers cannot open raw TCP sockets, and on Windows WebUSB cannot claim a device owned by the printer driver. Both paths deliver the command bytes untouched — the printer renders text and barcodes natively.

## Getting started

```bash
npm install
npm run dev      # starts the web app (5173) and the print service (3777)
```

For production use: `npm run build` then `npm start` — the print service also serves the built app at `http://localhost:3777`.

## Printer setup

**Pick the right language.** The command language must match your printer's firmware. Print a self-test page (hold FEED while powering on) — it states the emulation. Per Argox's manuals: OS-214plus/OS-2140 and CP-2140/CP-3140 contain both PPLA **and** PPLB (switchable with the free Argox Printer Tool); the "Z"-suffix models (OS-2140Z, CP-2140Z, …) run PPLZ; newer D2/O4-series support all three. Select the matching language in the app's *Printer* panel.

**Symbology notes:** MSI is not available in PPLB firmware (use PPLA or PPLZ — the app enforces this). Enter ITF-14 values as all 14 digits including the check digit. PPLA's Code 128 uses subset B (no auto mode), which covers normal ASCII values.

**USB:** install the Argox Windows driver (from [argox.com](https://www.argox.com)) so the printer has a queue name, then select it in the app. Jobs are sent as RAW spool data, so the driver's own page settings don't matter and no dialog appears.

**Network:** printers with an Ethernet/Wi-Fi port accept raw jobs on TCP port 9100. Enter the printer's IP in the app — no driver needed at all.

## Using the app

1. **Printer** — connection (USB queue or IP), language, resolution (most Argox desktop models are 203 dpi), and label gap.
2. **Label stock** — preset or custom size in mm.
3. **Barcode** — symbology and whether the value prints under the bars.
4. **Labels to print** — rows of value + optional text + copies; *Bulk add* pastes many at once (one per line, `value<TAB>text` or `value,text`).
5. **Print** — sends everything in one job. The *Printer commands* panel in the preview column shows exactly what will be sent (useful for debugging).

Settings persist in the browser between sessions.

## Notes

- The on-screen preview is an approximation rendered by the browser; the printer draws barcodes/fonts itself from the commands.
- If output is misaligned, check that width/height/gap match the physical stock and run the printer's media calibration (usually auto on self-test).
- If nothing prints over USB, confirm the queue name and that the Windows print spooler is running; over network, confirm the IP and that port 9100 is reachable.
- The print service listens on `localhost:3777` (override with the `PRINT_SERVER_PORT` env var — the Vite proxy in `vite.config.ts` must match in dev).
