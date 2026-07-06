// Local print service: forwards raw printer-language bytes (PPLA/PPLB/PPLZ)
// from the web app to an Argox printer over TCP (network) or the Windows
// spooler as a RAW job (USB). No print dialog involved.
import http from 'node:http'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PRINT_SERVER_PORT) || 3777
const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

// ---------- helpers ----------

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 10 * 1024 * 1024) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      { windowsHide: true, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message))
        else resolve(stdout)
      },
    )
  })
}

// ---------- printing backends ----------

async function listWindowsPrinters() {
  const stdout = await runPowerShell([
    '-Command',
    'Get-Printer | Select-Object Name,DriverName,PortName | ConvertTo-Json -Compress',
  ])
  const text = stdout.trim()
  if (!text) return []
  const parsed = JSON.parse(text)
  return Array.isArray(parsed) ? parsed : [parsed]
}

function printToNetwork(host, port, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    socket.setTimeout(10_000)
    socket.on('connect', () => {
      // Write the whole job, then FIN. Raw port-9100 printing expects no reply.
      socket.end(data)
    })
    socket.on('timeout', () => socket.destroy(new Error(`Connection to ${host}:${port} timed out`)))
    socket.on('error', (err) => reject(new Error(`Printer connection failed: ${err.message}`)))
    socket.on('close', (hadError) => {
      if (!hadError) resolve()
    })
  })
}

async function printToWindowsQueue(printerName, data) {
  const file = join(tmpdir(), `argox-label-${Date.now()}-${Math.random().toString(36).slice(2)}.prn`)
  await writeFile(file, data)
  try {
    await runPowerShell([
      '-File',
      join(__dirname, 'rawprint.ps1'),
      '-PrinterName',
      printerName,
      '-FilePath',
      file,
    ])
  } finally {
    await unlink(file).catch(() => {})
  }
}

// ---------- static file serving (production: serves the built app) ----------

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function serveStatic(req, res) {
  if (!existsSync(DIST_DIR)) {
    sendJson(res, 404, { error: 'Not found. In development, open the Vite URL instead.' })
    return
  }
  const urlPath = req.url.split('?')[0]
  const safePath = normalize(urlPath).replace(/^([/\\]|\.\.)+/, '')
  let file = join(DIST_DIR, safePath || 'index.html')
  if (!existsSync(file)) file = join(DIST_DIR, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}

// ---------- routes ----------

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url.startsWith('/api/printers')) {
      const printers = await listWindowsPrinters()
      sendJson(res, 200, { printers })
      return
    }

    if (req.method === 'POST' && req.url.startsWith('/api/print')) {
      const body = JSON.parse((await readBody(req)).toString('utf8'))
      const { connection, dataBase64 } = body
      if (!connection || !dataBase64) {
        sendJson(res, 400, { error: 'Expected { connection, dataBase64 }' })
        return
      }
      const data = Buffer.from(dataBase64, 'base64')
      if (data.length === 0) {
        sendJson(res, 400, { error: 'Empty print job' })
        return
      }

      if (connection.type === 'network') {
        const host = String(connection.host ?? '').trim()
        const port = Number(connection.port) || 9100
        if (!host) {
          sendJson(res, 400, { error: 'Printer host/IP is required' })
          return
        }
        await printToNetwork(host, port, data)
      } else if (connection.type === 'usb') {
        const printerName = String(connection.printerName ?? '').trim()
        if (!printerName) {
          sendJson(res, 400, { error: 'Windows printer name is required' })
          return
        }
        await printToWindowsQueue(printerName, data)
      } else {
        sendJson(res, 400, { error: `Unknown connection type: ${connection.type}` })
        return
      }

      sendJson(res, 200, { ok: true, bytes: data.length })
      return
    }

    if (req.method === 'GET') {
      serveStatic(req, res)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
})

server.listen(PORT, () => {
  console.log(`[print-server] listening on http://localhost:${PORT}`)
})
