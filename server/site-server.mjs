import crypto from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const STATIC_DIR = process.env.STATIC_DIR || '/app/dist'
const PORT = Number.parseInt(process.env.PORT || '80', 10)
const RESUME_ROUTE = normalizeRoute(process.env.RESUME_ROUTE || '/_private/resume')
const RESUME_FILE = process.env.RESUME_PRIVATE_FILE || '/run/private/resume.pdf'
const RESUME_SECRET = process.env.RESUME_SIGNING_SECRET || ''
const RESUME_FILENAME = sanitizeFilename(process.env.RESUME_DOWNLOAD_FILENAME || 'Josh-Phillips-Resume.pdf')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf'
}

function normalizeRoute(value) {
  if (!value || value === '/') {
    return '/_private/resume'
  }

  let normalized = value.trim()
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  return normalized
}

function sanitizeFilename(value) {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  return cleaned || 'resume.pdf'
}

function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function buildSignature(expiry) {
  return base64Url(
    crypto
      .createHmac('sha256', RESUME_SECRET)
      .update(`${RESUME_ROUTE}:${expiry}`)
      .digest()
  )
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function sendText(req, res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  })

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  res.end(body)
}

function resolveStaticPath(requestPath) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(requestPath)
  } catch {
    return null
  }

  const normalizedPosixPath = path.posix.normalize(decodedPath)
  const relativePath = normalizedPosixPath.replace(/^\/+/, '')
  const resolvedPath = path.resolve(STATIC_DIR, relativePath)

  if (resolvedPath !== STATIC_DIR && !resolvedPath.startsWith(`${STATIC_DIR}${path.sep}`)) {
    return null
  }

  return resolvedPath
}

function findStaticFile(requestPath) {
  const basePath = resolveStaticPath(requestPath)
  if (!basePath) {
    return null
  }

  const candidates = []
  if (requestPath.endsWith('/')) {
    candidates.push(path.join(basePath, 'index.html'))
  } else {
    candidates.push(basePath)
    candidates.push(`${basePath}.html`)
    candidates.push(path.join(basePath, 'index.html'))
  }

  for (const candidate of candidates) {
    try {
      const stats = statSync(candidate)
      if (stats.isFile()) {
        return { filePath: candidate, size: stats.size }
      }
    } catch {
      // candidate does not exist
    }
  }

  return null
}

function sendFile(req, res, filePath, size, extraHeaders = {}) {
  const extension = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[extension] || 'application/octet-stream'

  const headers = {
    'Content-Type': contentType,
    'Content-Length': size,
    ...extraHeaders
  }

  res.writeHead(200, headers)

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  const stream = createReadStream(filePath)
  stream.on('error', () => {
    if (!res.headersSent) {
      sendText(req, res, 500, 'Internal server error')
      return
    }

    res.destroy()
  })

  stream.pipe(res)
}

function serveStatic(req, res, requestPath) {
  const staticFile = findStaticFile(requestPath)
  if (staticFile) {
    sendFile(req, res, staticFile.filePath, staticFile.size)
    return
  }

  const notFoundPath = path.join(STATIC_DIR, '404.html')
  if (existsSync(notFoundPath)) {
    const stats = statSync(notFoundPath)
    if (stats.isFile()) {
      const extension = path.extname(notFoundPath).toLowerCase()
      const contentType = MIME_TYPES[extension] || 'text/html; charset=utf-8'
      res.writeHead(404, {
        'Content-Type': contentType,
        'Content-Length': stats.size
      })

      if (req.method === 'HEAD') {
        res.end()
        return
      }

      createReadStream(notFoundPath).pipe(res)
      return
    }
  }

  sendText(req, res, 404, 'Not found')
}

function servePrivateResume(req, res, requestUrl) {
  if (!RESUME_SECRET) {
    sendText(req, res, 404, 'Not found')
    return
  }

  const expiry = requestUrl.searchParams.get('exp')
  const signature = requestUrl.searchParams.get('sig')

  if (!expiry || !signature || !/^\d+$/.test(expiry)) {
    sendText(req, res, 400, 'Invalid link parameters')
    return
  }

  const expiresAt = Number.parseInt(expiry, 10)
  const now = Math.floor(Date.now() / 1000)
  if (Number.isNaN(expiresAt) || expiresAt <= now) {
    sendText(req, res, 410, 'Link has expired')
    return
  }

  const expectedSignature = buildSignature(expiry)
  if (!timingSafeEqualString(signature, expectedSignature)) {
    sendText(req, res, 403, 'Invalid signature')
    return
  }

  let stats
  try {
    stats = statSync(RESUME_FILE)
  } catch {
    sendText(req, res, 404, 'Not found')
    return
  }

  if (!stats.isFile()) {
    sendText(req, res, 404, 'Not found')
    return
  }

  const extension = path.extname(RESUME_FILE).toLowerCase()
  const contentType = MIME_TYPES[extension] || 'application/octet-stream'

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Content-Disposition': `attachment; filename="${RESUME_FILENAME}"`,
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache'
  })

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  createReadStream(RESUME_FILE).pipe(res)
}

function assertStartup() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    console.error(`Invalid PORT value: ${process.env.PORT || ''}`)
    process.exit(1)
  }

  try {
    const stats = statSync(STATIC_DIR)
    if (!stats.isDirectory()) {
      throw new Error('not a directory')
    }
  } catch (error) {
    console.error(`Static directory is missing or invalid: ${STATIC_DIR}`)
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

assertStartup()

const server = createServer((req, res) => {
  const method = req.method || 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(req, res, 405, 'Method not allowed')
    return
  }

  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (requestUrl.pathname === RESUME_ROUTE) {
    servePrivateResume(req, res, requestUrl)
    return
  }

  serveStatic(req, res, requestUrl.pathname)
})

server.listen(PORT, () => {
  console.log(`Site server listening on port ${PORT}`)
  console.log(`Static directory: ${STATIC_DIR}`)
  console.log(`Private resume route: ${RESUME_ROUTE}`)
})
