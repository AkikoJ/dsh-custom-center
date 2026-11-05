import { DetailIcon } from '../../shared/form-controls.js'
import { record, type Data } from './api.js'
import { Feedback } from './controls.js'
import { useText } from './messages.js'

export function DmStatus({ data, error, refresh, onConfigure, onOpenMessages }: { data?: Data; error?: string; refresh(): void; onConfigure(): void; onOpenMessages?: () => void }) {
 const t = useText(), watcher = record(data?.watcher)
 const configured = String(data?.dmReplyOnlyTo || '').split(/[,，、\r\n]+/).some((name) => name.trim())
 const enabled = data?.dmAutoReply === true
 const connectionError = enabled && configured ? String(watcher.error || '') : ''
 const healthy = !error && enabled && configured && !connectionError && watcher.connected === true
 const label = error ? '状态获取失败' : typeof data?.dmAutoReply !== 'boolean' ? '加载中' : !enabled ? '已关闭' : !configured ? '未配置回复联系人' : connectionError ? '连接异常' : healthy ? '运行正常' : '监听连接中'
 return <section className="dy-dm-status" aria-label={t('私信巡检状态')}>
  <div className="dy-dm-status-row"><div className="dy-dm-status-label"><span>{t('私信自动回复')}</span><span className="dy-account-state" role="status" data-active={healthy}>{t(label)}</span><DetailIcon label={t('私信巡检状态') + t('说明')}>{t('使用事件监听并每 120 秒补漏；仅处理回复联系人名单。')}</DetailIcon></div>
   <div className="dy-dm-status-actions">{onOpenMessages && <button type="button" onClick={onOpenMessages}>{t('查看对话')}</button>}<button type="button" onClick={onConfigure}>{t('配置私信')}</button><button type="button" onClick={refresh} aria-label={t('刷新私信状态')}>{t('刷新')}</button></div>
  </div>
  <Feedback error={error || connectionError} />
 </section>
}
