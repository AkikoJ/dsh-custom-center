import type { DouyinConfig } from '../config.js'
import { addMessages } from './messages.js'
export type Tab = 'daily' | 'pref' | 'like' | 'dm' | 'sticker' | 'mem' | 'adv'
export interface Field { key: keyof DouyinConfig; label: string; en: string; tab: Tab; type?: 'text' | 'number' | 'boolean' | 'textarea' | 'list'; options?: string[]; hint?: string }
const group = (tab: Tab, values: [keyof DouyinConfig, string, string, Field['type']?, string[]?][]): Field[] => values.map(([key, label, en, type, options]) => ({ key, label, en, type, options, tab }))
export const FIELDS: Field[] = [
 ...group('daily', [
  ['peakValley','谷时自动刷','Run in quiet windows','boolean'], ['noon','中午 12:00–14:00','Noon 12:00–14:00','boolean'], ['night','夜间 00:30–08:30','Night 00:30–08:30','boolean'], ['perDay','每日看片上限','Daily watch limit','number'], ['pickPerRound','每轮挑选条数','Picks per round','number'], ['skipOverMin','划走时长阈值（分钟）','Skip above (minutes)','number'], ['skimOverMin','跳看时长阈值（分钟）','Skim above (minutes)','number'],
 ]),
 ...group('pref', [
  ['keywords','偏好关键词','Preferred keywords','list'], ['watchBeforeAct','互动前理解视频','Understand before interacting','boolean'], ['watchSeconds','最多观看秒数','Maximum watch seconds','number'], ['watchFrames','抽帧数量','Sampled frames','number'], ['skipLive','跳过直播','Skip live streams','boolean'], ['shareToNick','转发给谁','Share recipient'], ['sharePerDay','每日转发上限','Daily share limit','number'], ['shareWithNote','转发后附言','Note after sharing','boolean'], ['modelShareNote','生成个性化附言','Generate a personal note','boolean'], ['shareNote','固定转发附言','Fixed share note','textarea'], ['streakNick','续火花联系人','Streak contact'], ['streakSticker','续火花表情关键词','Streak sticker keyword'], ['streakPerDay','每日续火花上限','Daily streak limit','number'],
 ]),
 ...group('like', [
  ['autoLike','自动点赞','Automatic likes','boolean'], ['autoComment','自动评论并提及','Automatic comments with mention','boolean'], ['mentionName','要提及谁','Mention recipient'], ['commentPerRound','每轮评论上限','Comments per round','number'], ['commentPerDay','每日提及评论上限','Daily mention comment limit','number'], ['autoCommentPlain','自动普通评论','Automatic plain comments','boolean'], ['plainCommentPerDay','每日普通评论上限','Daily plain comment limit','number'], ['autoReply','回复自己作品下的评论','Reply to comments on own posts','boolean'], ['replyPerRun','每次回复条数','Replies per run','number'], ['replyPerDay','每日评论回复上限','Daily comment reply limit','number'], ['replyAllDay','全天巡检评论','Inspect comments all day','boolean'], ['replyRandom','随机挑选评论','Random comment selection','boolean'], ['replyVideoIds','额外回复作品 ID','Additional reply video IDs','textarea'], ['replyOneShot','每条评论只回一次','Reply once per comment','boolean'], ['replyOncePerUser','每位用户只回一次','Reply once per user','boolean'], ['replyWorksDays','作品回溯天数（兼容字段）','Post lookback days (compatibility)','number'], ['replyIntervalMin','评论巡检间隔（分钟）','Comment inspection interval (minutes)','number'], ['myNickname','我的昵称','My nickname'], ['autoPublish','自动投稿','Automatic publication','boolean'], ['publishPerDay','每日投稿上限','Daily publication limit','number'], ['publishDraft','默认存草稿','Draft by default','boolean'], ['publishTitle','默认投稿标题','Default publication title'], ['publishTags','默认投稿标签','Default publication tags'],
 ]),
 ...group('dm', [
  ['msgAllowTo','主动私信联系人名单','Allowed outbound contacts','textarea'], ['dmReplyOnlyTo','私信回复联系人限制','Reply contact filter','textarea'], ['dmReply','轮次内回复私信','Reply within feed rounds','boolean'], ['dmAutoReply','后台私信巡检','Background message inspection','boolean'], ['dmAutoIntervalSec','巡检间隔（秒）','Inspection interval (seconds)','number'], ['dmReplyPerContact','每日每人回复上限','Daily replies per contact','number'], ['dmReplyPerDay','每日私信回复总量','Daily message reply limit','number'], ['dmFastReply','使用快速回复模型','Use fast reply model','boolean'], ['dmFastProvider','快速回复提供方','Fast reply provider'], ['dmFastModel','快速回复模型','Fast reply model'], ['dmFastReasoning','快速回复推理等级','Fast reply reasoning','text',['off','low','medium','high']],
 ]),
 ...group('mem', [['memory','启用记忆','Enable memory','boolean'], ['personaPrompt','角色提示词','Persona prompt','textarea']]),
 ...group('adv', [
  ['pythonPath','Python 解释器','Python executable'], ['dshBin','宿主命令路径','Harness command path'], ['headlessModel','后台模型','Headless model'], ['headlessProfile','后台 profile','Headless profile'], ['overlayMcp','注入 MCP 覆盖配置','Inject MCP overlay','boolean'], ['workspace','后台工作目录','Headless working directory'], ['reportLevel','日报详细程度','Report detail','text',['full','short','off']], ['localRound','本机执行轮次','Use local rounds','boolean'], ['autoClean','自动清理缓存','Automatic cache cleanup','boolean'], ['askDoubao','允许调用豆包','Allow Doubao','boolean'], ['comfyUrl','ComfyUI 地址','ComfyUI URL'], ['comfyOutputDir','ComfyUI 输出目录','ComfyUI output folder'], ['comfyWorkflow','ComfyUI 工作流 JSON','ComfyUI workflow JSON','textarea'], ['comfyWaitSeconds','出片等待秒数','Generation timeout (seconds)','number'], ['comfyListLimit','输出列表条数','Output list size','number'], ['cdpUrl','Chrome 调试地址','Chrome debugging URL'], ['cdpPort','Chrome 调试端口','Chrome debugging port','number'], ['chromePath','Chrome 程序路径','Chrome executable'],
 ]),
]
addMessages(FIELDS.map((field) => [field.label, field.en] as const))
export function valueOf(field: Field, value: string | boolean): unknown {
 if (field.type === 'number') { const number = Number(value); if (value === '' || !Number.isSafeInteger(number) || number < 0) throw new Error(field.label); return number }
 if (field.type === 'list') return String(value).split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
 return value
}
