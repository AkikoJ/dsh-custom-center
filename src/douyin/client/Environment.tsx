import { useEffect, useRef } from 'react'
import { record, rows } from './api.js'
import { useActions, useResource } from './state.js'
import { Card, Feedback } from './controls.js'
import { useText } from './messages.js'

export function Environment({ dirty, onConfigure }: { dirty: boolean; onConfigure(): void }) {
 const t = useText(), environment = useResource('/environment'), logs = useResource('/setup/log'), action = useActions()
 const result = record(action.result), report = Array.isArray(result.issues) ? result : environment.data, issues = rows(report?.issues)
 const setupStatus = String(logs.data?.status || ''), previousStatus = useRef(setupStatus)
 useEffect(() => {
  if (setupStatus !== 'running') return
  const timer = setInterval(logs.refresh, 2000)
  return () => clearInterval(timer)
 }, [setupStatus, logs.refresh])
 useEffect(() => {
  const previous = previousStatus.current
  previousStatus.current = setupStatus
  if (previous === 'running' && setupStatus && setupStatus !== 'running') void action.run('/selfcheck', {})
 }, [setupStatus, action.run])
 const run = async (path: string) => {
  const value = await action.run(path, {})
  if (!value) return
  if (path === '/setup') logs.refresh()
  if (path === '/chrome/open') await action.run('/selfcheck', {})
 }
 const installing = setupStatus === 'running' || action.busy === '/setup'
 if (!environment.error && !issues.length && !installing) return null
 return <Card title={installing && !issues.length ? '运行环境安装中' : '运行环境需要处理'} aside={issues.length ? <span className="dy-environment-count">{issues.length} {t('项异常')}</span> : undefined}>
  {issues.length > 0 && <div className="dy-environment-list">{issues.map((issue, index) => {
   const download = record(issue.download), actionName = String(issue.action || '')
   return <article className="dy-environment-issue" key={String(issue.id || index)}>
    <div className="dy-environment-copy"><strong>{t(String(issue.name || '运行环境'))}</strong><p>{t(String(issue.fix || '请修复后重新自检'))}</p>{issue.detail !== undefined && issue.detail !== '' && <small>{String(issue.detail)}</small>}</div>
    <div className="dy-environment-actions">
     {typeof download.url === 'string' && <a className="dy-download" href={download.url} target="_blank" rel="noopener noreferrer">{t(String(download.label || '下载'))}</a>}
     {actionName === 'setup' && <button disabled={dirty || !!action.busy} onClick={() => void run('/setup')}>{t('下载并安装环境')}</button>}
     {actionName === 'chrome' && <button disabled={dirty || !!action.busy} onClick={() => void run('/chrome/open')}>{t('连接 Chrome')}</button>}
     {actionName === 'configure' && <button onClick={onConfigure}>{t('前往配置')}</button>}
    </div>
   </article>
  })}</div>}
  {dirty && <p className="dy-dirty-hint" role="status">{t('请先保存更改，再安装或连接运行环境')}</p>}
  <div className="dy-toolbar"><button disabled={dirty || !!action.busy} onClick={() => void action.run('/selfcheck', {})}>{t('重新自检')}</button>{(installing || setupStatus === 'failed') && <button onClick={logs.refresh}>{t('刷新安装日志')}</button>}</div>
  <Feedback error={environment.error || logs.error || action.error} busy={action.busy} />
  {(installing || setupStatus === 'failed') && <details className="dy-environment-log" open={installing}><summary>{t('环境安装状态与日志')} · {t(setupStatus || '执行中')}</summary><pre>{String(logs.data?.tail || t('暂无日志'))}</pre></details>}
  {report && <details className="dy-details"><summary>{t('环境检查详情')}</summary><pre>{JSON.stringify(report, null, 2)}</pre></details>}
 </Card>
}
