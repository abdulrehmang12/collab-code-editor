# Collab Code Editor

Real-time collaborative code editor (CodeSandbox-style) with:

- Monaco Editor
- Yjs real-time collaboration over WebSocket
- Live preview for HTML/CSS/JS
- WebAssembly runtime demo (Python via Pyodide)
- GitHub API integration (load/save files)

## Requirements

- Node.js (you have `v24+`)

## Quick start (single command)

Install dependencies in both apps and run both dev servers:

```bash
cd server && npm install
cd ../client && npm install
cd ..
npm run dev
```

By default:

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`

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

## Environment configuration

### Server (`server/.env`)

```bash
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
```

### Client (`client/.env`)

```bash
VITE_SERVER_HTTP=http://localhost:4000
VITE_SERVER_WS=ws://localhost:4000/collab
```

If these are not set, the app uses the same defaults.

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

## Production build

Build the client:

```bash
cd client
npm run build
```

Run the server:

```bash
cd server
npm run start
```

## Notes

- Python runs in-browser via Pyodide (WASM) and downloads the runtime from a CDN on first run.

