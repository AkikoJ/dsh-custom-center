/** Public, credential-free state shared with the settings page. */
export interface DouyinStatus {
  window: 'closed' | 'opening' | 'open' | 'closing'
  phase: 'idle' | 'opening' | 'checking' | 'saving' | 'verifying-http' | 'closing'
  browserAuth: 'unverified' | 'waiting' | 'verified' | 'expired' | 'account-mismatch'
  persistence: 'none' | 'historical' | 'saved' | 'failed' | 'invalid'
  observation: 'idle' | 'observing' | 'paused'
  account?: { uid: string; nickname?: string }
  savedAt?: string
  browserVerifiedAt?: string
  http: { state: 'unverified' | 'pending' | 'verified' | 'rejected'; reason?: string; uid?: string; generation?: string; verifiedAt?: string }
  notice?: string
}

export type DouyinAction = 'status' | 'open' | 'check' | 'close'

/** Stable codes; arbitrary platform/exception text never reaches the page. */
export const DOUYIN_MESSAGES: Record<string, string> = {
  'browser-missing': '尚未准备配套 Chromium，请按安装说明准备浏览器后重试。',
  'unsupported-platform': '当前仅支持 macOS 本机登录。',
  'profile-busy': '登录会话目录正在被使用，请关闭所属登录窗口或等待旧插件释放后重试。',
  'browser-start-failed': '登录浏览器启动失败，请检查配套 Chromium 和本机运行环境。',
  'navigation-failed': '浏览器已启动，但抖音页面加载失败，请检查网络后重新打开。',
  'window-closed': '登录窗口已关闭；会话已保留，可重新打开继续检查。',
  'window-required': '请先打开登录窗口，再检查登录状态。',
  'waiting': '请在抖音窗口完成扫码、手机确认、短信或网页验证，然后检查登录状态。',
  'check-throttled': '检查过于频繁，请稍候再试；自动观察会继续按间隔确认。',
  'observation-paused': '等待时间较长，已暂停自动观察。窗口和已有步骤保留，可手动检查。',
  'network': '网络暂不可用，请稍后重试。',
  'timeout': '平台请求超时，请稍后重试。',
  'rate-limited': '平台暂时限流，请等待后重试。',
  'challenge': '平台要求进一步验证，请查看抖音窗口后重试。',
  'identity-unconfirmed': '平台尚未返回可信账号身份，请完成网页登录后重试。',
  'expired': '平台明确返回未登录，已停止使用相关凭据，请在原窗口重新登录。',
  'account-mismatch': '检测到其他账号，已停止使用相关凭据；本期不支持切换账号。',
  'save-failed': '本次凭据保存失败，上一份完整资料保留，请检查数据目录后重试。',
  'export-failed': '浏览器身份已确认，但无法读取登录资料，请保持窗口打开后重试。',
  'close-failed': '登录窗口关闭失败，请重试关闭；不会启动第二个窗口。',
  'snapshot-invalid': '历史凭据损坏或版本不受支持，未使用该资料；请检查本机数据后继续登录。',
  'storage-unavailable': '会话数据目录不可用，请检查权限或符号链接后重试。',
  'redirect-rejected': '平台请求跳转到不受支持的目标，已停止发送凭据。',
  'cookie-unsupported': '平台 Cookie 属性暂不受支持，未将其降级使用。',
  'disposed': '登录服务正在停止，请刷新页面后重试。',
  'failed': '操作未完成，请稍后重试。',
}
