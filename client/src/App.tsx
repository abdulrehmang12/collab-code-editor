import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { MonacoBinding } from 'y-monaco'
import { buildPreviewSrcDoc } from './lib/preview'
import { runPython } from './lib/pyRunner'
import { runLua } from './lib/luaRunner'
import { ghGetUser, ghGetFile, ghListRepos, ghPutFile, type GitHubRepo } from './lib/githubApi'

function App() {
  const serverHttp = import.meta.env.VITE_SERVER_HTTP || 'http://localhost:4000'
  const serverWs = import.meta.env.VITE_SERVER_WS || 'ws://localhost:4000/collab'

  const [room, setRoom] = useState('demo-room')
  const [language, setLanguage] = useState<'web' | 'python' | 'lua'>('web')
  const [activeFile, setActiveFile] = useState<string>('index.html')
  const [previewLogs, setPreviewLogs] = useState<string>('')
  const [pyOut, setPyOut] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [docVersion, setDocVersion] = useState(0)

  const [ghToken, setGhToken] = useState<string>(() => localStorage.getItem('gh_token') || '')
  const [ghUser, setGhUser] = useState<{ login: string } | null>(null)
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([])
  const [ghRepoFullName, setGhRepoFullName] = useState<string>('')
  const [ghPathPrefix, setGhPathPrefix] = useState<string>('collab-editor')
  const [ghStatus, setGhStatus] = useState<string>('')
  const [ghSha, setGhSha] = useState<Record<string, string | undefined>>({})

  const monacoRef = useRef<typeof Monaco | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)

  const ydoc = useMemo(() => new Y.Doc(), [])
  const yFiles = useMemo(() => ydoc.getMap<Y.Text>('files'), [ydoc])

  const providerRef = useRef<WebsocketProvider | null>(null)

  // Ensure default files exist in the shared doc
  useEffect(() => {
    const ensure = (name: string, initial: string) => {
      if (!yFiles.has(name)) yFiles.set(name, new Y.Text(initial))
    }
    ensure(
      'index.html',
      `<div style="font-family: system-ui; padding: 16px;">
  <h1>Hello collaborative editor</h1>
  <p>Edit HTML/CSS/JS and see live preview.</p>
  <button id="btn">Click me</button>
</div>`,
    )
    ensure(
      'styles.css',
      `body { margin: 0; }
#btn { padding: 10px 14px; border-radius: 10px; border: 1px solid #ddd; }`,
    )
    ensure(
      'main.js',
      `document.getElementById('btn')?.addEventListener('click', () => {
  console.log('clicked at', new Date().toLocaleTimeString())
})`,
    )
    ensure(
      'main.py',
      `print("Hello from Python (WASM via Pyodide)")\nfor i in range(3):\n  print("i =", i)\n`,
    )
    ensure(
      'main.lua',
      `print("Hello from Lua (WASM)")\nfor i = 0, 2 do\n  print("i = " .. i)\nend\n`,
    )
  }, [yFiles])

  // Connect to collaboration server; reconnect when room changes
  useEffect(() => {
    if (providerRef.current) providerRef.current.destroy()
    setPreviewLogs('')

    const provider = new WebsocketProvider(serverWs, room, ydoc, {
      connect: true,
    })

    // lightweight user presence
    provider.awareness.setLocalStateField('user', {
      name: `User-${Math.floor(Math.random() * 9999)}`,
      color: ['#7c5cff', '#00c8ff', '#ff5c7a', '#5cff9f'][Math.floor(Math.random() * 4)],
    })

    providerRef.current = provider
    return () => provider.destroy()
  }, [room, serverWs, ydoc])

  const fileList =
    language === 'web'
      ? (['index.html', 'styles.css', 'main.js'] as const)
      : language === 'python'
      ? (['main.py'] as const)
      : (['main.lua'] as const)

  const filesForMode = useMemo(() => {
    if (language === 'web') return ['index.html', 'styles.css', 'main.js'] as const
    if (language === 'python') return ['main.py'] as const
    return ['main.lua'] as const
  }, [language])

  const monacoLanguage = useMemo(() => {
    if (activeFile.endsWith('.html')) return 'html'
    if (activeFile.endsWith('.css')) return 'css'
    if (activeFile.endsWith('.js')) return 'javascript'
    if (activeFile.endsWith('.py')) return 'python'
    if (activeFile.endsWith('.rb')) return 'ruby'
    if (activeFile.endsWith('.lua')) return 'lua'
    return 'plaintext'
  }, [activeFile])

  const editorOnMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco as typeof Monaco
    bindActiveModel()
  }

  function bindActiveModel() {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const provider = providerRef.current
    if (!editor || !monaco || !provider) return

    const model = editor.getModel()
    if (!model) return

    const ytext = yFiles.get(activeFile)
    if (!ytext) return

    if (bindingRef.current) {
      bindingRef.current.destroy()
      bindingRef.current = null
    }

    bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), provider.awareness)
  }

  // Rebind when switching files or when editor model changes
  useEffect(() => {
    bindActiveModel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile])

  // Trigger React updates for preview/output panes when shared document changes.
  useEffect(() => {
    const bump = () => setDocVersion((v) => v + 1)
    yFiles.observeDeep(bump)
    return () => yFiles.unobserveDeep(bump)
  }, [yFiles])

  // Live preview for web files
  const previewSrcDoc = useMemo(() => {
    const html = yFiles.get('index.html')?.toString() || ''
    const css = yFiles.get('styles.css')?.toString() || ''
    const js = yFiles.get('main.js')?.toString() || ''
    return buildPreviewSrcDoc({ html, css, js })
  }, [docVersion, yFiles])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data
      if (!data || !data.__collab_editor_console) return
      const line = `[${data.type}] ${Array.isArray(data.args) ? data.args.map(String).join(' ') : String(data.args)}`
      setPreviewLogs((prev) => (prev ? `${prev}\n${line}` : line))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  async function runPy() {
    const code = yFiles.get('main.py')?.toString() || ''
    setBusy(true)
    try {
      const res = await runPython(code)
      setPyOut(res.error ? `${res.stdout}\n\nERROR: ${res.error}` : res.stdout || '(no output)')
    } finally {
      setBusy(false)
    }
  }

  async function runLu() {
    const code = yFiles.get('main.lua')?.toString() || ''
    setBusy(true)
    try {
      const res = await runLua(code)
      setPyOut(res.error ? `${res.stdout}\n\nERROR: ${res.error}` : res.stdout || '(no output)')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    localStorage.setItem('gh_token', ghToken)
  }, [ghToken])

  async function connectGitHub() {
    setGhStatus('Connecting to GitHub…')
    try {
      const user = await ghGetUser(serverHttp, ghToken.trim())
      setGhUser(user)
      const repos = await ghListRepos(serverHttp, ghToken.trim())
      setGhRepos(repos)
      setGhStatus(`Connected as ${user.login}`)
    } catch (e: any) {
      setGhUser(null)
      setGhRepos([])
      setGhStatus(`GitHub error: ${String(e?.message || e)}`)
    }
  }

  async function loadFromGitHub() {
    if (!ghRepoFullName) return
    const [owner, repo] = ghRepoFullName.split('/')
    setGhStatus('Loading files…')
    try {
      const filesToLoad = filesForMode
      const nextSha: Record<string, string | undefined> = { ...ghSha }
      for (const f of filesToLoad) {
        const path = `${ghPathPrefix.replace(/\/+$/g, '')}/${f}`
        const { text, sha } = await ghGetFile(serverHttp, ghToken.trim(), owner, repo, path)
        const ytext = yFiles.get(f)
        if (ytext) {
          ytext.delete(0, ytext.length)
          ytext.insert(0, text)
        }
        nextSha[f] = sha
      }
      setGhSha(nextSha)
      setDocVersion((v) => v + 1)
      setGhStatus('Loaded.')
    } catch (e: any) {
      setGhStatus(`Load error: ${String(e?.message || e)}`)
    }
  }

  async function saveToGitHub() {
    if (!ghRepoFullName) return
    const [owner, repo] = ghRepoFullName.split('/')
    setGhStatus('Saving files…')
    try {
      const filesToSave = filesForMode
      const nextSha: Record<string, string | undefined> = { ...ghSha }
      for (const f of filesToSave) {
        const path = `${ghPathPrefix.replace(/\/+$/g, '')}/${f}`
        const text = yFiles.get(f)?.toString() || ''
        const res = await ghPutFile({
          serverHttp,
          token: ghToken.trim(),
          owner,
          repo,
          path,
          message: `Update ${path}`,
          text,
          sha: nextSha[f],
        })
        nextSha[f] = res?.content?.sha || nextSha[f]
      }
      setGhSha(nextSha)
      setGhStatus('Saved.')
    } catch (e: any) {
      setGhStatus(`Save error: ${String(e?.message || e)}`)
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          Collab Editor <span className="badge">Monaco + Yjs</span>
          <span className="badge">room: {room}</span>
        </div>
        <div className="controls">
          <select
            className="select"
            value={language}
            onChange={(e) => {
              const next = e.target.value as 'web' | 'python' | 'lua'
              setLanguage(next)
              const firstFile =
                next === 'web'
                  ? 'index.html'
                  : next === 'python'
                  ? 'main.py'
                  : 'main.lua'
              setActiveFile(firstFile)
            }}
            aria-label="Mode"
          >
            <option value="web">HTML/CSS/JS</option>
            <option value="python">Python (WASM)</option>
            <option value="lua">Lua (WASM)</option>
          </select>

          <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="room id" />

          <input
            className="input"
            style={{ width: 220 }}
            value={ghToken}
            onChange={(e) => setGhToken(e.target.value)}
            placeholder="GitHub token (PAT)"
          />
          <button className="btn" onClick={connectGitHub} disabled={!ghToken.trim()}>
            {ghUser ? `GitHub: ${ghUser.login}` : 'Connect GitHub'}
          </button>
        </div>
      </div>

      <div className="main">
        <div className="panel">
          <div className="panelHeader">
            <div className="tabs">
              {fileList.map((f) => (
                <button
                  key={f}
                  className={`tab ${activeFile === f ? 'tabActive' : ''}`}
                  onClick={() => setActiveFile(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="muted">Collaboration is live in this room</div>
          </div>

          <Editor
            height="100%"
            theme="vs-dark"
            language={monacoLanguage}
            value={yFiles.get(activeFile)?.toString() || ''}
            onMount={editorOnMount}
            onChange={(v) => {
              // When bound to Yjs, MonacoBinding will sync changes; this keeps initial state stable.
              // If binding isn't ready yet, write to Y.Text directly.
              const ytext = yFiles.get(activeFile)
              if (!ytext) return
              const next = v ?? ''
              if (bindingRef.current) return
              ytext.delete(0, ytext.length)
              ytext.insert(0, next)
            }}
            options={{
              minimap: { enabled: false },
              fontFamily: 'var(--mono)',
              fontSize: 13,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        </div>

        <div className="splitRight">
          <div className="panel">
            <div className="panelHeader">
              <div className="brand">Live Preview</div>
              {language !== 'web' ? (
                <button
                  className={`btn ${busy ? '' : 'btnPrimary'}`}
                  onClick={language === 'python' ? runPy : runLu}
                  disabled={busy}
                >
                  {busy ? 'Running…' : `Run ${language.charAt(0).toUpperCase() + language.slice(1)}`}
                </button>
              ) : (
                <button className="btn" onClick={() => setPreviewLogs('')}>
                  Clear console
                </button>
              )}
            </div>

            {language === 'web' ? (
              <iframe className="iframe" sandbox="allow-scripts" srcDoc={previewSrcDoc} key={docVersion} />
            ) : (
              <div className="console">
                {pyOut ||
                  `Click “Run ${
                    language.charAt(0).toUpperCase() + language.slice(1)
                  }” to execute main.${language === 'python' ? 'py' : 'lua'} in WebAssembly.`}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="brand">GitHub + Console</div>
              <span className="muted">{ghStatus || (language === 'web' ? 'Preview logs' : 'Python output')}</span>
            </div>
            <div style={{ padding: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select
                  className="select"
                  value={ghRepoFullName}
                  onChange={(e) => setGhRepoFullName(e.target.value)}
                  disabled={!ghRepos.length}
                >
                  <option value="">Select repo…</option>
                  {ghRepos.map((r) => (
                    <option key={r.id} value={r.full_name}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  value={ghPathPrefix}
                  onChange={(e) => setGhPathPrefix(e.target.value)}
                  placeholder="path prefix in repo"
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={loadFromGitHub} disabled={!ghUser || !ghRepoFullName}>
                  Load
                </button>
                <button className="btn btnPrimary" onClick={saveToGitHub} disabled={!ghUser || !ghRepoFullName}>
                  Save
                </button>
              </div>
              <div className="console">{language === 'web' ? previewLogs || '(no logs yet)' : pyOut || '(no output yet)'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
