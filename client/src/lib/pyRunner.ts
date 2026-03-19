import { loadPyodide, type PyodideInterface } from 'pyodide'

let pyodidePromise: Promise<PyodideInterface> | null = null

async function getPyodide(): Promise<PyodideInterface> {
  if (!pyodidePromise) {
    pyodidePromise = loadPyodide({
      // CDN is the most reliable option for a first pass.
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/',
    }) as unknown as Promise<PyodideInterface>
  }
  return pyodidePromise
}

export async function runPython(code: string): Promise<{ stdout: string; error?: string }> {
  const pyodide = await getPyodide()

  const logs: string[] = []
  const origLog = console.log
  const origError = console.error

  try {
    // capture minimal output from Python print via js console if user calls it
    console.log = (...args) => {
      logs.push(args.map(String).join(' '))
      origLog(...args)
    }
    console.error = (...args) => {
      logs.push(args.map(String).join(' '))
      origError(...args)
    }

    // Provide a small stdout capture inside Python
    pyodide.runPython(`
import sys
from io import StringIO
_collab_out = StringIO()
sys.stdout = _collab_out
sys.stderr = _collab_out
`)

    await (pyodide as any).runPythonAsync(code)
    const out = pyodide.runPython(`_collab_out.getvalue()`) as unknown as string
    return { stdout: [out, ...logs].filter(Boolean).join('\n') }
  } catch (e: any) {
    return { stdout: logs.join('\n'), error: String(e?.message || e) }
  } finally {
    console.log = origLog
    console.error = origError
  }
}

