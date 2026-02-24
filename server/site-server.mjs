import crypto from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const STATIC_DIR = process.env.STATIC_DIR || '/app/dist'
const PORT = parseInteger(process.env.PORT, 80, 1, 65535)

const RESUME_ROUTE = normalizeRoute(process.env.RESUME_ROUTE || '/_private/resume')
const RESUME_FILE = process.env.RESUME_PRIVATE_FILE || '/run/private/resume.md'
const RESUME_SECRET = process.env.RESUME_SIGNING_SECRET || ''

const ASK_API_ROUTE = normalizeRoute(process.env.ASK_JOSHGPT_API_ROUTE || process.env.ASK_ASSISTANT_API_ROUTE || '/api/ask-joshgpt')
const LEGACY_ASK_API_ROUTE = '/api/ask-assistant'
const ASK_CONTEXT_DIR = process.env.ASK_JOSHGPT_CONTEXT_DIR || process.env.ASK_ASSISTANT_CONTEXT_DIR || '/app/context/docs'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
const ASK_JOSHGPT_MODEL = process.env.ASK_JOSHGPT_MODEL || process.env.ASK_ASSISTANT_MODEL || 'gpt-4o-mini'
const ASK_JOSHGPT_MAX_TOKENS = parseInteger(process.env.ASK_JOSHGPT_MAX_TOKENS || process.env.ASK_ASSISTANT_MAX_TOKENS, 700, 200, 1600)
const ASK_JOSHGPT_TEMPERATURE = parseNumber(process.env.ASK_JOSHGPT_TEMPERATURE || process.env.ASK_ASSISTANT_TEMPERATURE, 0.2, 0, 1)
const ASK_JOSHGPT_TIMEOUT_MS = parseInteger(process.env.ASK_JOSHGPT_TIMEOUT_MS || process.env.ASK_ASSISTANT_TIMEOUT_MS, 30000, 5000, 120000)
const ASK_JOSHGPT_RATE_LIMIT_WINDOW_SECONDS = parseInteger(process.env.ASK_JOSHGPT_RATE_LIMIT_WINDOW_SECONDS || process.env.ASK_ASSISTANT_RATE_LIMIT_WINDOW_SECONDS, 300, 30, 3600)
const ASK_JOSHGPT_RATE_LIMIT_MAX = parseInteger(process.env.ASK_JOSHGPT_RATE_LIMIT_MAX || process.env.ASK_ASSISTANT_RATE_LIMIT_MAX, 10, 1, 200)
const ASK_JOSHGPT_MAX_QUESTION_CHARS = parseInteger(process.env.ASK_JOSHGPT_MAX_QUESTION_CHARS || process.env.ASK_ASSISTANT_MAX_QUESTION_CHARS, 1200, 100, 5000)

const ASK_RATE_LIMIT_WINDOW_MS = ASK_JOSHGPT_RATE_LIMIT_WINDOW_SECONDS * 1000
const ASK_RATE_LIMIT_STATE = new Map()

const ASK_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'are', 'was', 'were', 'you', 'your',
  'about', 'into', 'over', 'under', 'after', 'before', 'where', 'what', 'when', 'who', 'how', 'why', 'can',
  'could', 'should', 'would', 'does', 'did', 'will', 'just', 'than', 'then', 'also', 'more', 'most', 'some',
  'site', 'joshphillipssr', 'com'
])

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

const ASK_CONTEXT_SECTIONS = loadAskJoshGptContext()

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }

  if (parsed < min) {
    return min
  }

  if (parsed > max) {
    return max
  }

  return parsed
}

function parseNumber(value, fallback, min, max) {
  const parsed = Number.parseFloat(String(value || ''))
  if (Number.isNaN(parsed)) {
    return fallback
  }

  if (parsed < min) {
    return min
  }

  if (parsed > max) {
    return max
  }

  return parsed
}

function normalizeRoute(value) {
  if (!value || value === '/') {
    return '/'
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

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') {
    return '/'
  }

  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }

  return pathname
}

function isRouteMatch(route, pathname) {
  return normalizePathname(pathname) === route
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

function sendJson(req, res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
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

function markdownToSearchText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\r/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildRepoContextText(rawJson) {
  let repos
  try {
    repos = JSON.parse(rawJson)
  } catch {
    return ''
  }

  if (!Array.isArray(repos)) {
    return ''
  }

  const lines = repos.slice(0, 60).map((repo) => {
    const name = String(repo?.name || 'unknown')
    const language = String(repo?.language || '-')
    const description = String(repo?.description || '').trim() || 'No description provided'
    const url = String(repo?.url || '')
    return `${name} | ${language} | ${description}${url ? ` | ${url}` : ''}`
  })

  return `Public GitHub Projects (${repos.length} repositories): ${lines.join(' ; ')}`
}

function loadAskJoshGptContext() {
  const definitions = [
    { id: 'home', title: 'Home', relativePath: 'index.md', route: '/' },
    { id: 'resume', title: 'Resume', relativePath: 'resume/index.md', route: '/resume/' },
    { id: 'projects', title: 'Projects', relativePath: 'projects/index.md', route: '/projects/' },
    { id: 'projects-catalog', title: 'Projects Catalog', relativePath: 'projects/public-repos.md', route: '/projects/public-repos/' },
    { id: 'github-projects', title: 'Public GitHub Projects', relativePath: 'projects/data/public-repos.json', route: '/projects/public-repos/', isRepoJson: true }
  ]

  const sections = []

  for (const definition of definitions) {
    const absolutePath = path.join(ASK_CONTEXT_DIR, definition.relativePath)
    let raw
    try {
      raw = readFileSync(absolutePath, 'utf8')
    } catch {
      continue
    }

    const text = definition.isRepoJson ? buildRepoContextText(raw) : markdownToSearchText(raw)
    if (!text) {
      continue
    }

    sections.push({
      id: definition.id,
      title: definition.title,
      route: definition.route,
      text,
      normalized: text.toLowerCase()
    })
  }

  return sections
}

function tokenizeQuestion(question) {
  const terms = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !ASK_STOP_WORDS.has(term))

  return Array.from(new Set(terms))
}

function scoreContextSection(section, terms, question) {
  let score = 0
  for (const term of terms) {
    if (section.normalized.includes(term)) {
      score += 1
    }
  }

  const questionSnippet = question.toLowerCase().trim()
  if (questionSnippet.length > 0 && section.normalized.includes(questionSnippet)) {
    score += 3
  }

  return score
}

function pickContextSections(question) {
  if (ASK_CONTEXT_SECTIONS.length === 0) {
    return []
  }

  const terms = tokenizeQuestion(question)
  const scored = ASK_CONTEXT_SECTIONS
    .map((section) => ({ section, score: scoreContextSection(section, terms, question) }))
    .sort((left, right) => right.score - left.score)

  const selected = []
  for (const item of scored) {
    if (item.score <= 0 && selected.length >= 3) {
      break
    }

    selected.push(item.section)
    if (selected.length >= 4) {
      break
    }
  }

  if (selected.length === 0) {
    selected.push(...scored.slice(0, 3).map((entry) => entry.section))
  }

  const githubSection = ASK_CONTEXT_SECTIONS.find((section) => section.id === 'github-projects')
  if (githubSection && !selected.some((section) => section.id === githubSection.id)) {
    selected.push(githubSection)
  }

  return selected.slice(0, 5)
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }

  return req.socket.remoteAddress || 'unknown'
}

function isRateLimited(ipAddress) {
  const now = Date.now()

  if (ASK_RATE_LIMIT_STATE.size > 5000) {
    for (const [key, state] of ASK_RATE_LIMIT_STATE.entries()) {
      if (now - state.startedAt > ASK_RATE_LIMIT_WINDOW_MS) {
        ASK_RATE_LIMIT_STATE.delete(key)
      }
    }
  }

  const current = ASK_RATE_LIMIT_STATE.get(ipAddress)
  if (!current || now - current.startedAt > ASK_RATE_LIMIT_WINDOW_MS) {
    ASK_RATE_LIMIT_STATE.set(ipAddress, { count: 1, startedAt: now })
    return false
  }

  if (current.count >= ASK_JOSHGPT_RATE_LIMIT_MAX) {
    return true
  }

  current.count += 1
  return false
}

async function readJsonBody(req, maxBytes) {
  return await new Promise((resolve, reject) => {
    const chunks = []
    let totalBytes = 0

    req.on('data', (chunk) => {
      totalBytes += chunk.length
      if (totalBytes > maxBytes) {
        reject(new Error('Payload too large'))
        req.destroy()
        return
      }

      chunks.push(chunk)
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf8')
        if (!body.trim()) {
          resolve({})
          return
        }

        const parsed = JSON.parse(body)
        resolve(parsed)
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
  })
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

async function askOpenAI(question, sections) {
  const trimmedQuestion = question.trim()
  const contextText = sections
    .map((section, index) => {
      const excerpt = section.text.slice(0, 3000)
      return `[${index + 1}] ${section.title}\nSource Route: ${section.route}\n${excerpt}`
    })
    .join('\n\n')

  const systemPrompt = [
    'You are JoshGPT. You are searching joshphillipssr.com and Josh Phillips Sr public GitHub project context.',
    'Use only the provided context sections.',
    'Do not invent facts that are not present in the supplied context.',
    'If the answer is not in context, clearly say so and suggest emailing josh@joshphillipssr.com.',
    'Prefer concise, factual responses and include source route references when possible.'
  ].join(' ')

  const userPrompt = [
    `Question: ${trimmedQuestion}`,
    '',
    'Context:',
    contextText
  ].join('\n')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ASK_JOSHGPT_TIMEOUT_MS)

  let response
  try {
    response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: ASK_JOSHGPT_MODEL,
        temperature: ASK_JOSHGPT_TEMPERATURE,
        max_tokens: ASK_JOSHGPT_MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`OpenAI request failed (${response.status}): ${errorText.slice(0, 200)}`)
  }

  const payload = await response.json()
  const answer = payload?.choices?.[0]?.message?.content
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('OpenAI response did not include text content')
  }

  return answer.trim()
}

async function handleAskJoshGpt(req, res) {
  if (req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method not allowed. Use POST.' })
    return
  }

  if (!OPENAI_API_KEY) {
    sendJson(req, res, 503, { error: 'Ask JoshGPT is not configured on this server yet.' })
    return
  }

  const ipAddress = getClientIp(req)
  if (isRateLimited(ipAddress)) {
    sendJson(req, res, 429, { error: 'Rate limit reached. Try again in a few minutes.' })
    return
  }

  let payload
  try {
    payload = await readJsonBody(req, 16 * 1024)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body'
    sendJson(req, res, 400, { error: message })
    return
  }

  const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
  if (question.length < 3) {
    sendJson(req, res, 400, { error: 'Question must be at least 3 characters.' })
    return
  }

  if (question.length > ASK_JOSHGPT_MAX_QUESTION_CHARS) {
    sendJson(req, res, 400, { error: `Question exceeds ${ASK_JOSHGPT_MAX_QUESTION_CHARS} characters.` })
    return
  }

  const contextSections = pickContextSections(question)
  if (contextSections.length === 0) {
    sendJson(req, res, 500, { error: 'No local context available for Ask JoshGPT.' })
    return
  }

  try {
    const answer = await askOpenAI(question, contextSections)
    const sources = contextSections.map((section) => ({ title: section.title, route: section.route }))
    sendJson(req, res, 200, {
      answer,
      sources,
      model: ASK_JOSHGPT_MODEL
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected Ask JoshGPT error'
    sendJson(req, res, 502, { error: message })
  }
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

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  if (isRouteMatch(ASK_API_ROUTE, requestUrl.pathname) || isRouteMatch(LEGACY_ASK_API_ROUTE, requestUrl.pathname)) {
    await handleAskJoshGpt(req, res)
    return
  }

  const method = req.method || 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    sendText(req, res, 405, 'Method not allowed')
    return
  }

  if (isRouteMatch(RESUME_ROUTE, requestUrl.pathname)) {
    servePrivateResume(req, res, requestUrl)
    return
  }

  serveStatic(req, res, requestUrl.pathname)
})

server.listen(PORT, () => {
  console.log(`Site server listening on port ${PORT}`)
  console.log(`Static directory: ${STATIC_DIR}`)
  console.log(`Private resume route: ${RESUME_ROUTE}`)
  console.log(`Legacy API route supported: ${LEGACY_ASK_API_ROUTE}`)
  console.log(`Ask JoshGPT API route: ${ASK_API_ROUTE}`)
})
