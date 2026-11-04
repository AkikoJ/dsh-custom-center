import { PARITY_MESSAGES } from './parity-messages.js'
import { createContext, useContext } from 'react'
export type Translate = (key: string) => string
export const Translation = createContext<Translate>((key) => key)
export const useText = () => useContext(Translation)
export const NS = 'custom-center-douyin'
const pairs = [
 ...PARITY_MESSAGES,
 ['人设正文', 'Persona text'], ['角色提示', 'Role prompt'], ['人设用于私信、评论和后台任务；手动保存后生效。', 'Used for messages, comments and headless tasks after saving.'],
 ['刷抖音（中心版）', 'Douyin (Custom Center)'], ['抖音视频（中心版）', 'Douyin videos (Custom Center)'],
 ['刷抖音','Douyin'], ['抖音视频','Douyin videos'], ['日常','Daily'], ['刷视频','Feed'], ['互动','Interactions'], ['私信','Messages'], ['表情包','Stickers'], ['人设','Persona'], ['高级','Advanced'],
 ['连接与运行详情', 'Connection and runtime details'], ['更多登录方式与验证', 'More sign-in and verification options'],
 ['保存更改','Save changes'], ['保存中','Saving'], ['已保存','Saved'], ['有未保存的更改','Unsaved changes'], ['刷新','Refresh'], ['加载中','Loading'], ['重试','Retry'], ['执行中','Working'], ['完成','Done'], ['取消','Cancel'],
 ['账号与今日概况','Account and today'], ['已登录','Signed in'], ['尚未登录','Not signed in'], ['轮次','Rounds'], ['已看视频','Watched'], ['剩余额度','Remaining'], ['今日回复','Replies today'],
 ['浏览器登录','Browser sign-in'], ['关闭登录窗口','Close sign-in window'], ['截图登录','QR sign-in'], ['我扫完了','Check sign-in'], ['手机号','Phone number'], ['验证码','Verification code'], ['收验证码','Request code'], ['提交验证码','Submit code'], ['登录二维码','Sign-in QR code'],
 ['立即刷一轮','Run now'], ['运行前请保存更改','Save changes before running'], ['查看日报','Latest report'], ['打开报告目录','Open reports folder'], ['最近刷过的视频','Recently watched'], ['暂无记录','No records yet'], ['没有截图','No preview'], ['未知日期','Unknown date'], ['收藏表情标签','Favorite sticker tags'], ['标签用逗号分隔','Separate tags with commas'], ['保存标签','Save tags'],
 ['私信巡检状态','Message watcher status'], ['清除已读索引','Clear read cursor'], ['测试私信','Send test message'], ['测试表情','Send test sticker'], ['发送给主动私信名单首位联系人','Send to the first allowed contact'], ['测试正文','Test message'], ['关键词','Keyword'], ['立即回复评论','Reply to comments now'],
 ['ComfyUI 输出','ComfyUI outputs'], ['刷新输出列表','Refresh outputs'], ['准备投稿','Prepare publication'], ['存为草稿','Save as draft'], ['正式发布','Publish now'], ['确认存草稿','Confirm draft'], ['确认正式发布','Confirm publication'], ['标题','Title'], ['标签','Tags'], ['请先保存设置再投稿','Save settings before publication'],
 ['角色设定','Persona'], ['保存角色设定','Save persona'], ['安装运行环境','Install runtime'], ['环境自检','Self-check'], ['连接 Chrome','Connect Chrome'], ['查看安装日志','Setup log'], ['查看运行日志','Runtime log'], ['检查上游版本','Check upstream version'], ['打开数据目录','Open data folder'], ['诊断结果','Diagnostic result'], ['本机轮次','Local round'], ['后台轮次','Headless round'],
 ['独立配置，自动操作受额度和授权控制','Dedicated settings; automation follows quotas and authorization'], ['保存失败时保留本地更改','Local changes are retained if host synchronization fails'], ['本地已保存，宿主同步失败','Saved locally; host synchronization failed'], ['手动刷新查看最新状态','Refresh to see the latest state'], ['总数','Total'], ['原片','Original video'], ['工作流为 JSON 文本','Workflow is JSON text'],
] as const
export const dictionaries: Record<'zh-CN' | 'en-US', Record<string, string>> = { 'zh-CN': Object.fromEntries(pairs.map(([zh]) => [zh, zh])), 'en-US': Object.fromEntries(pairs) }
export function addMessages(entries: readonly (readonly [string, string])[]) { for (const [zh, en] of entries) { dictionaries['zh-CN'][zh] = zh; dictionaries['en-US'][zh] = en } }
