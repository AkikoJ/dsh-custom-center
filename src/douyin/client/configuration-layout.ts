import type { Data } from './api.js'
import type { Field } from './fields.js'

const parents: Record<string, string> = {
 noon: 'peakValley', night: 'peakValley', watchSeconds: 'watchBeforeAct', watchFrames: 'watchBeforeAct',
 shareNote: 'shareWithNote', modelShareNote: 'shareWithNote', mentionName: 'autoComment', commentPerDay: 'autoComment', commentPerRound: 'autoComment',
 plainCommentPerDay: 'autoCommentPlain', replyPerRun: 'autoReply', replyPerDay: 'autoReply', replyAllDay: 'autoReply',
 replyRandom: 'autoReply', replyVideoIds: 'autoReply', replyOneShot: 'autoReply', replyOncePerUser: 'autoReply', replyWorksDays: 'autoReply', replyIntervalMin: 'autoReply',
 publishPerDay: 'autoPublish', publishDraft: 'autoPublish', publishTitle: 'autoPublish', publishTags: 'autoPublish',
 dmAutoIntervalSec: 'dmAutoReply', dmFastProvider: 'dmFastReply', dmFastModel: 'dmFastReply', dmFastReasoning: 'dmFastReply',
}
export function fieldVisible(field: Field, draft: Data) { const parent = parents[field.key]; return !parent || draft[parent] !== false }
export const GROUP_STARTS: Record<string, string> = {
 peakValley: '谷时窗口', perDay: '选片与时长', keywords: '内容偏好', shareToNick: '视频转发', streakNick: '续火花',
 autoLike: '点赞与评论', autoReply: '作品回复范围', autoPublish: '手动工具与后台投稿', msgAllowTo: '主动联系人与回复范围', dmReply: '私信巡检', dmFastReply: '快速回复模型',
 memory: '记忆开关与角色提示', pythonPath: '运行环境', headlessModel: '后台轮次', reportLevel: '日报与执行方式', comfyUrl: 'ComfyUI 出片', cdpUrl: '浏览器连接',
}
export const HINTS: Record<string, string> = {
 peakValley: '只在谷时窗口自动运行；关闭后仍可手动运行。', perDay: '填 0 关闭自动刷取，仍可手动选片。已看数只统计成功理解的视频；选片额度另记。',
 pickPerRound: '每轮默认 2 条，最多 5 条。', skipOverMin: '默认 60 分钟，超过时长的素材不看、不评、不转。', skimOverMin: '默认 5 分钟，采样理解会在互动中说明。',
 msgAllowTo: '昵称用逗号或换行分隔；留空不主动发消息。后台自动回复只处理这份名单与回复限制的交集。',
 autoCommentPlain: '普通评论、提及评论和转发轮流选择；同一视频最多一种，点赞可以组合。',
 replyVideoIds: '除当日自己的作品外，额外允许回复的作品 ID。永久回复去重始终生效。',
 replyOneShot: '确认回复成功后清空额外作品 ID；不控制永久回复去重。', replyWorksDays: '兼容旧配置保留；当前按当日作品和额外授权 ID 选择范围。',
 autoPublish: '允许手动工具和后台任务投稿。本机自动轮次没有自动出片投稿流程。', askDoubao: '兼容配置；本机自动轮次尚未接入豆包调用。',
 localRound: '手动运行未指定模式时遵循此开关；自动定时轮次使用本机执行。', shareWithNote: '确认转发后再发附言；确认附言后才发表情。',
 dmAutoIntervalSec: '兼容旧配置；当前使用事件监听和 120 秒补漏，不按此秒数轮询。',
 dmReplyOnlyTo: '留空使用主动联系人名单；填写后与主动联系人名单取交集。', dmFastReply: '纯文本或图片先尝试快速回复；视频或生成失败交给后台任务。',
}
