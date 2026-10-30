import { useEffect, useMemo, useState } from 'react'
import { DOUYIN_MESSAGES } from '../contracts.ts'
import { createAccountController } from './controller.ts'
import { douyinAccountCss } from './styles.ts'

const authLabels = { unverified: '尚未验证', waiting: '等待网页确认', verified: '身份已确认', expired: '登录已失效', 'account-mismatch': '账号不一致' }
const storageLabels = { none: '尚未保存', historical: '上次保存，当前尚未验证', saved: '已保存至本机宿主', failed: '本次保存失败', invalid: '历史资料不可用' }
const windowLabels = { closed: '已关闭', opening: '正在打开', open: '已打开', closing: '正在关闭' }
const httpLabels = { unverified: '尚未验证', pending: 'HTTP 待验证', verified: 'HTTP 已验证', rejected: '已停用凭据' }
const phaseLabels = { idle: '', opening: '正在打开登录窗口…', checking: '正在确认网页账号…', saving: '正在保存内部凭据…', 'verifying-http': '正在独立验证 HTTP…', closing: '正在关闭窗口…' }
const timestamp = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })

export function DouyinAccountPage(): JSX.Element {
  const controller = useMemo(() => createAccountController(), [])
  const [view, setView] = useState(controller.snapshot)
  useEffect(() => {
    const unsubscribe = controller.subscribe(setView)
    controller.mount()
    return () => { unsubscribe(); controller.dispose() }
  }, [controller])
  const status = view.status
  const locked = view.busy || !!status && status.phase !== 'idle'
  const notice = status?.notice ? DOUYIN_MESSAGES[status.notice] : undefined
  const httpReason = status?.http.reason === 'credentials-updated'
    ? 'HTTP 更新了凭据，等待验证新版本。'
    : status?.http.reason ? DOUYIN_MESSAGES[status.http.reason] : undefined
  const loginReady = status?.browserAuth === 'verified' && status.persistence === 'saved'
  const needsAttention = !!status && (['expired', 'account-mismatch'].includes(status.browserAuth)
    || ['failed', 'invalid'].includes(status.persistence))
  const accountLabel = !status ? '正在读取状态' : loginReady ? '已登录'
    : needsAttention ? '需要处理' : status.browserAuth === 'waiting' ? '等待网页登录'
      : status.account ? '登录待确认' : '尚未确认登录'
  const accountTitle = status?.account?.nickname || (status?.account ? '抖音账号' : '连接你的抖音账号')
  const accountHint = loginReady ? '网页登录已确认，登录资料已保存。'
    : needsAttention ? '请查看下方状态与提示，在登录窗口中处理后重新检查。'
      : status?.browserAuth === 'verified' ? '网页身份已确认，登录资料尚未保存完成。'
        : status?.account ? '已有账号记录，请打开窗口重新确认当前登录。'
          : '打开独立窗口，完成扫码、短信或网页验证。'
  const phase = status && phaseLabels[status.phase]
  const feedback = phase || (view.busy ? '正在处理，请稍候…' : undefined)
  return <div className="dsh-cc-page dsh-cc-douyin">
    <style>{douyinAccountCss}</style>
    <header className="dsh-cc-header">
      <h2 className="dsh-cc-heading">抖音账号</h2>
      <p className="dsh-cc-intro">在抖音网页完成登录，为本机宿主保留账号会话。</p>
    </header>
    <section className="dsh-dy-account" aria-label="账号与登录操作">
      <div className="dsh-dy-account-top">
        <span className="dsh-dy-avatar" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="8" r="3.5" /><path d="M5 20v-2a7 7 0 0 1 14 0v2" />
          </svg>
        </span>
        <div className="dsh-dy-account-name">
          <h3>{accountTitle}</h3>
          <p>{status?.account ? `UID · ${status.account.uid}` : 'macOS 本机 · 单账号'}</p>
        </div>
        <span className="dsh-dy-badge" data-tone={loginReady ? 'success' : needsAttention ? 'warning' : 'neutral'}>
          <span className="dsh-dy-status-dot" aria-hidden="true" />{!status && view.error ? '状态不可用' : accountLabel}
        </span>
      </div>
      <p className="dsh-dy-account-hint">{accountHint}</p>
      <div className="dsh-cc-actions dsh-dy-actions">
        <button className="dsh-cc-btn dsh-cc-btn-primary" type="button" disabled={locked} onClick={() => void controller.act('open')}>打开登录窗口</button>
        <button className="dsh-cc-btn" type="button" disabled={locked || status?.window !== 'open'} onClick={() => void controller.act('check')}>检查登录状态</button>
        <button className="dsh-cc-btn" type="button" disabled={!view.busy && (!status || status.window === 'closed')} onClick={() => void controller.act('close')}>关闭登录窗口</button>
      </div>
    </section>
    <div className="dsh-dy-feedback" role="status" aria-live="polite" aria-atomic="true">
      {feedback && <p className="dsh-dy-progress"><span className="dsh-dy-spinner" aria-hidden="true" />{feedback}</p>}
      {notice && <p>{notice}</p>}
      {view.error && <p className="dsh-dy-error">{view.error}</p>}
    </div>
    <section className="dsh-cc-section dsh-dy-verification" aria-label="登录与 HTTP 验证">
      <div className="dsh-dy-section-heading">
        <h3 className="dsh-cc-section-title">会话状态</h3>
        <span className="dsh-cc-hint">网页登录与 HTTP 分别验证</span>
      </div>
      {status ? <>
        <dl className="dsh-dy-status-list">
          <div className="dsh-dy-status-row">
            <dt>网页登录<span>{status.browserVerifiedAt ? `确认于 ${timestamp(status.browserVerifiedAt)}` : '确认抖音网页中的账号身份'}</span></dt>
            <dd data-tone={status.browserAuth === 'verified' ? 'success' : ['expired', 'account-mismatch'].includes(status.browserAuth) ? 'warning' : 'neutral'}>{authLabels[status.browserAuth]}</dd>
          </div>
          <div className="dsh-dy-status-row">
            <dt>登录资料<span>{status.savedAt ? `保存于 ${timestamp(status.savedAt)}` : '保存在本机，仅供宿主内部调用'}</span></dt>
            <dd data-tone={status.persistence === 'saved' ? 'success' : ['failed', 'invalid'].includes(status.persistence) ? 'warning' : 'neutral'}>{storageLabels[status.persistence]}</dd>
          </div>
          <div className="dsh-dy-status-row">
            <dt>HTTP 可用性<span>{status.http.verifiedAt ? `验证于 ${timestamp(status.http.verifiedAt)}` : '与网页登录分开确认请求可用性'}</span></dt>
            <dd data-tone={status.http.state === 'verified' ? 'success' : status.http.state === 'rejected' ? 'warning' : 'neutral'}>{httpLabels[status.http.state]}</dd>
          </div>
        </dl>
        {httpReason && <p className="dsh-dy-http-reason">{httpReason}</p>}
        <div className="dsh-dy-window-meta">
          <span>登录窗口{windowLabels[status.window]}</span>
          <span>{status.observation === 'observing' ? '正在自动观察登录结果' : status.observation === 'paused' ? '自动观察已暂停，可手动检查' : '自动观察未运行'}</span>
        </div>
      </> : <p className="dsh-cc-hint">{view.error ? '连接恢复后将自动更新状态。' : '正在读取登录状态…'}</p>}
    </section>
    <footer className="dsh-dy-footer">
      <p>关闭窗口会保留会话，登录资料不提供下载。</p>
      <details>
        <summary>使用说明</summary>
        <div className="dsh-dy-help">
          <p>请先按插件安装说明准备配套 Chromium，此页不会自动下载浏览器。</p>
          <p>宿主重启后需要重新确认登录。HTTP 暂时失败时保留已确认的网页登录；登录验证不代表私信接口已经可用。</p>
          <p>当前支持 macOS 本机单账号，暂不提供账号切换或清除登录。</p>
        </div>
      </details>
    </footer>
  </div>
}
