import { douyinResources } from './resources.js'
import { errorMessage } from './storage.js'

const endpoint = 'https://api.github.com/repos/kdcadmin/dsh_douyin_tools/contents/package.json'
const url = 'https://github.com/kdcadmin/dsh_douyin_tools'
const newer = (latest: string, local: string) => {
  const a = latest.replace(/^v/, '').split('.').map(Number), b = local.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  return false
}
/** Informational upstream check; never changes the pinned source or package. */
export async function checkUpstreamUpdate(request = fetch, signal?: AbortSignal) {
  const resources = douyinResources(), local = resources.upstream.version
  const base = { local, url, packageVersion: resources.identity.version, pinnedCommit: resources.upstream.commit, automaticUpgrade: false }
  try {
    const response = await request(endpoint, { redirect: 'error', headers: { 'User-Agent': 'dsh-custom-center', Accept: 'application/vnd.github.raw+json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
    if (!response.ok || !response.body) throw new Error('GitHub HTTP ' + response.status)
    const reader = response.body.getReader(), chunks: Buffer[] = []; let size = 0
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 131072) throw new Error('版本响应超过大小限制'); chunks.push(Buffer.from(value)) }
    } finally { await reader.cancel() }
    const latest = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).version || '')
    if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(latest)) throw new Error('上游版本格式无效')
    return { ...base, ok: true, latest, hasUpdate: newer(latest, local), checkedAt: new Date().toISOString() }
  } catch (error) { return { ...base, ok: false, latest: '', hasUpdate: false, error: errorMessage(error) } }
}
