import crypto from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const STATIC_DIR = process.env.STATIC_DIR || '/app/dist'
const PORT = Number.parseInt(process.env.PORT || '80', 10)
const RESUME_ROUTE = normalizeRoute(process.env.RESUME_ROUTE || '/_private/resume')
const RESUME_FILE = process.env.RESUME_PRIVATE_FILE || '/run/private/resume.md'
const RESUME_SECRET = process.env.RESUME_SIGNING_SECRET || ''

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

function sendHtml(req, res, html) {
  const body = Buffer.from(html, 'utf8')
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
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

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeUrl(rawUrl) {
  const url = rawUrl.trim()
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || url.startsWith('/') || url.startsWith('#')) {
    return escapeHtml(url)
  }

  return '#'
}

function renderInline(value) {
  const links = []
  const withTokens = value.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, url) => {
    const token = `@@LINK_${links.length}@@`
    links.push({ label, url })
    return token
  })

  let safe = escapeHtml(withTokens)
  safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>')
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  safe = safe.replace(/@@LINK_(\d+)@@/g, (_match, index) => {
    const item = links[Number.parseInt(index, 10)]
    if (!item) {
      return ''
    }

    const href = sanitizeUrl(item.url)
    const label = escapeHtml(item.label)
    const externalAttrs = /^https?:\/\//i.test(item.url) ? ' target="_blank" rel="noreferrer"' : ''
    return `<a href="${href}"${externalAttrs}>${label}</a>`
  })

  return safe
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html = []
  let paragraph = []
  let listItems = []

  function flushParagraph() {
    if (paragraph.length === 0) {
      return
    }

    const renderedLines = paragraph.map((line) => {
      const hardBreak = / {2,}$/.test(line)
      const content = renderInline(line.trimEnd())
      return hardBreak ? `${content}<br>` : content
    })

    html.push(`<p>${renderedLines.join(' ')}</p>`)
    paragraph = []
  }

  function flushList() {
    if (listItems.length === 0) {
      return
    }

    html.push('<ul>')
    for (const item of listItems) {
      html.push(`<li>${item}</li>`)
    }
    html.push('</ul>')
    listItems = []
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      const level = headingMatch[1].length
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph()
      flushList()
      html.push('<hr>')
      continue
    }

    const listMatch = trimmed.match(/^[-*]\s+(.*)$/)
    if (listMatch) {
      flushParagraph()
      listItems.push(renderInline(listMatch[1]))
      continue
    }

    paragraph.push(rawLine)
  }

  flushParagraph()
  flushList()

  return html.join('\n')
}

function buildResumeHtmlPage(content, expiresAt) {
  const rendered = renderMarkdown(content)
  const expiresUtc = new Date(expiresAt * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Private Resume</title>
    <meta name="robots" content="noindex, nofollow, noarchive">
    <style>
      :root {
        --bg: #f6f7f9;
        --fg: #151515;
        --muted: #5a5a5a;
        --line: #d7d9de;
        --panel: #ffffff;
        --accent: #0c66d6;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        background: var(--bg);
        color: var(--fg);
        line-height: 1.55;
      }

      .toolbar {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.95);
        border-bottom: 1px solid var(--line);
      }

      .toolbar .meta {
        color: var(--muted);
        font-size: 0.9rem;
      }

      .toolbar button {
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.9rem;
        cursor: pointer;
      }

      .toolbar button:hover { filter: brightness(0.95); }

      .toolbar a {
        color: var(--accent);
        text-decoration: none;
        font-size: 0.9rem;
      }

      main {
        max-width: 860px;
        margin: 18px auto;
        padding: 28px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 12px;
      }

      h1, h2, h3, h4, h5, h6 { line-height: 1.2; margin-top: 1.3em; }
      h1 { margin-top: 0; }
      p, ul { margin-top: 0.7em; margin-bottom: 0.7em; }
      hr { border: 0; border-top: 1px solid var(--line); margin: 1.2em 0; }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.95em;
        background: #f2f3f5;
        border: 1px solid #e4e6ea;
        border-radius: 5px;
        padding: 0.08em 0.32em;
      }

      @media print {
        body { background: #fff; }
        .toolbar { display: none; }
        main {
          max-width: none;
          margin: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button id="print-btn" type="button">Print / Create PDF</button>
      <span class="meta">Link expires: ${escapeHtml(expiresUtc)}</span>
      <a href="/" target="_blank" rel="noreferrer">Open Public Site</a>
    </div>
    <main>
${rendered}
    </main>
    <script>
      document.getElementById('print-btn').addEventListener('click', () => window.print())
    </script>
  </body>
</html>`
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
    sendText(req, res, 410, 'Link has expired. Email josh@joshphillipssr.com for a new link.')
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

  let markdown
  try {
    markdown = readFileSync(RESUME_FILE, 'utf8')
  } catch {
    sendText(req, res, 500, 'Unable to read resume source')
    return
  }

  const page = buildResumeHtmlPage(markdown, expiresAt)
  sendHtml(req, res, page)
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
