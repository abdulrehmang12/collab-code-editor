# Collab Code Editor

Real-time collaborative code editor (CodeSandbox-style) with:

- Monaco Editor
- Yjs real-time collaboration over WebSocket
- Live preview for HTML/CSS/JS
- WebAssembly runtime demo (Python via Pyodide)
- GitHub API integration (load/save files)

## Requirements

- Node.js (you have `v24+`)

## Run locally

### 1) Start the server

```bash
cd server
npm install
npm run dev
```

Server runs on `http://localhost:4000`.

### 2) Start the client

```bash
cd client
npm install
npm run dev
```

Client runs on the URL printed by Vite (usually `http://localhost:5173` or next available port).

## Collaboration

- Open the client in **two browser windows**
- Use the same **room id** in the top bar
- You’ll see shared edits + cursors/presence

## GitHub integration

- Create a GitHub **Personal Access Token** (classic is fine) with `repo` scope for private repos, or `public_repo` for public repos.
- Paste it in the app’s top bar and click **Connect GitHub**
- Choose a repo, set a path prefix, then **Load** / **Save**

Files saved/loaded:

- Web mode: `index.html`, `styles.css`, `main.js`
- Python mode: `main.py`

## Notes

- Python runs in-browser via Pyodide (WASM) and downloads the runtime from a CDN on first run.

