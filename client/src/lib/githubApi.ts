import { base64ToUtf8, utf8ToBase64 } from './base64'

export type GitHubRepo = { id: number; full_name: string; private: boolean; default_branch: string }

export async function ghGetUser(serverHttp: string, token: string) {
  const res = await fetch(`${serverHttp}/api/github/user`, {
    headers: { Authorization: `token ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function ghListRepos(serverHttp: string, token: string): Promise<GitHubRepo[]> {
  const res = await fetch(`${serverHttp}/api/github/repos`, {
    headers: { Authorization: `token ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function ghGetFile(
  serverHttp: string,
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<{ text: string; sha?: string }> {
  const q = new URLSearchParams({ owner, repo, path })
  if (ref) q.set('ref', ref)
  const res = await fetch(`${serverHttp}/api/github/contents?${q.toString()}`, {
    headers: { Authorization: `token ${token}` },
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  if (Array.isArray(data)) throw new Error('Path is a directory')
  const b64 = String(data.content || '').replace(/\n/g, '')
  return { text: base64ToUtf8(b64), sha: data.sha }
}

export async function ghPutFile(opts: {
  serverHttp: string
  token: string
  owner: string
  repo: string
  path: string
  message: string
  text: string
  sha?: string
  branch?: string
}) {
  const res = await fetch(`${opts.serverHttp}/api/github/contents`, {
    method: 'PUT',
    headers: { Authorization: `token ${opts.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner: opts.owner,
      repo: opts.repo,
      path: opts.path,
      message: opts.message,
      content: utf8ToBase64(opts.text),
      sha: opts.sha,
      branch: opts.branch,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

