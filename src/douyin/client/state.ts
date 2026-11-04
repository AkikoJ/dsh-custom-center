import { useCallback, useEffect, useRef, useState } from 'react'
import { record, request, type Data } from './api.js'
export function useResource(path: string) {
 const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [version, setVersion] = useState(0)
 useEffect(() => { const controller = new AbortController(); setData(null); setError(''); request(path, undefined, controller.signal).then((value) => { if (!controller.signal.aborted) setData(value) }, (error: Error) => { if (!controller.signal.aborted) setError(error.message) }); return () => controller.abort() }, [path, version])
 return { data, error, refresh: useCallback(() => setVersion((value) => value + 1), []) }
}
export function useActions() {
 const [busy, setBusy] = useState(''), [error, setError] = useState(''), [result, setResult] = useState<Data | null>(null)
 const active = useRef<AbortController | null>(null), alive = useRef(true)
 useEffect(() => { alive.current = true; return () => { alive.current = false; active.current?.abort() } }, [])
 const run = useCallback(async (path: string, data?: Data): Promise<Data | null> => {
  if (active.current) return null
  const controller = new AbortController(); active.current = controller; setBusy(path); setError(''); setResult(null)
  try { const value = await request(path, data, controller.signal); controller.signal.throwIfAborted(); if (alive.current) setResult(value); return value }
  catch (error) { if (alive.current && !controller.signal.aborted) setError(error instanceof Error ? error.message : String(error)); return null }
  finally { active.current = null; if (alive.current) setBusy('') }
 }, [])
 return { busy, error, result, run }
}
export function useConfiguration() {
 const source = useResource('/config'), action = useActions(), [draft, setDraft] = useState<Data>({}), [saved, setSaved] = useState<Data>({})
 useEffect(() => { if (source.data) { const config = record(source.data.config); setDraft(config); setSaved(config) } }, [source.data])
 const patch = Object.fromEntries(Object.entries(draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(saved[key])))
 const dirty = Object.keys(patch).length > 0
 const save = async () => { const submitted = draft; const response = await action.run('/config', { patch }); if (response) { const config = record(response.config); setDraft((latest) => ({ ...config, ...Object.fromEntries(Object.entries(latest).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(submitted[key]))) })); setSaved(config) } }
 return { ...source, ...action, draft, dirty, save, set: (key: string, value: unknown) => setDraft((old) => ({ ...old, [key]: value })) }
}
