require('dotenv').config()

const http = require('http')
const express = require('express')
const cors = require('cors')
const { WebSocketServer } = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')
const { Octokit } = require('@octokit/rest')

const PORT = Number(process.env.PORT || 4000)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))

function getOctokit(req) {
  const auth = req.headers.authorization || ''
  // Accept: "token <PAT>" or "Bearer <PAT>"
  const token = auth.replace(/^token\s+/i, '').replace(/^bearer\s+/i, '').trim()
  if (!token) return null
  return new Octokit({ auth: token })
}

app.get('/api/github/user', async (req, res) => {
  try {
    const octokit = getOctokit(req)
    if (!octokit) return res.status(401).json({ error: 'Missing Authorization token' })
    const { data } = await octokit.users.getAuthenticated()
    res.json({ login: data.login, id: data.id, avatar_url: data.avatar_url })
  } catch (err) {
    res.status(500).json({ error: err?.message || 'GitHub error' })
  }
})

app.get('/api/github/repos', async (req, res) => {
  try {
    const octokit = getOctokit(req)
    if (!octokit) return res.status(401).json({ error: 'Missing Authorization token' })
    const { data } = await octokit.repos.listForAuthenticatedUser({ per_page: 100, sort: 'updated' })
    res.json(
      data.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        private: r.private,
        default_branch: r.default_branch,
      })),
    )
  } catch (err) {
    res.status(500).json({ error: err?.message || 'GitHub error' })
  }
})

app.get('/api/github/contents', async (req, res) => {
  try {
    const { owner, repo, path, ref } = req.query
    if (!owner || !repo || !path) return res.status(400).json({ error: 'owner, repo, path required' })

    const octokit = getOctokit(req)
    if (!octokit) return res.status(401).json({ error: 'Missing Authorization token' })

    const { data } = await octokit.repos.getContent({
      owner: String(owner),
      repo: String(repo),
      path: String(path),
      ref: ref ? String(ref) : undefined,
    })

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err?.message || 'GitHub error' })
  }
})

app.put('/api/github/contents', async (req, res) => {
  try {
    const { owner, repo, path, message, content, sha, branch } = req.body || {}
    if (!owner || !repo || !path || !message || typeof content !== 'string') {
      return res.status(400).json({ error: 'owner, repo, path, message, content required' })
    }

    const octokit = getOctokit(req)
    if (!octokit) return res.status(401).json({ error: 'Missing Authorization token' })

    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content, // base64 expected from client
      sha: sha || undefined,
      branch: branch || undefined,
    })

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err?.message || 'GitHub error' })
  }
})

const server = http.createServer(app)

// Real-time collaboration WebSocket endpoint
const wss = new WebSocketServer({ server, path: '/collab' })
wss.on('connection', (conn, req) => {
  // Rooms are defined by the URL query ?room=<roomId>
  setupWSConnection(conn, req)
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`)
})

