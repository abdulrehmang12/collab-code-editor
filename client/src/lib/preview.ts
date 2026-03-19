type PreviewFiles = { html: string; css: string; js: string }

export function buildPreviewSrcDoc(files: PreviewFiles): string {
  // Note: iframe sandbox blocks top-level navigation by default.
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>${files.css || ''}</style>
  </head>
  <body>
    ${files.html || ''}
    <script>
      // Forward console logs to parent
      (function () {
        const send = (type, args) => {
          try {
            parent.postMessage({ __collab_editor_console: true, type, args }, '*')
          } catch {}
        }
        ;['log','info','warn','error'].forEach((k) => {
          const orig = console[k]
          console[k] = function (...args) {
            send(k, args)
            return orig.apply(console, args)
          }
        })
        window.addEventListener('error', (e) => send('error', [String(e.message || e.error || e)]))
        window.addEventListener('unhandledrejection', (e) => send('error', [String(e.reason || e)]))
      })()
    </script>
    <script type="module">
      try {
        ${files.js || ''}
      } catch (e) {
        console.error(e)
      }
    </script>
  </body>
</html>`
}

