import type { ToolDefinition, JsonSchemaNode } from '@deepseek-ai/dsh-tools'

export const PLUGIN_ID = 'custom-center-douyin'
export const CONVERSATION_VIEW_ID = 'custom-center-douyin-watched'
export const API_PREFIX = '/api/custom-center/douyin'
export const TABS = [['home', '首页'], ['daily', '日常'], ['pref', '刷视频'], ['like', '互动'], ['dm', '私信'], ['sticker', '表情包'], ['persona', '人设'], ['adv', '高级']] as const
export type ToolContract = Pick<ToolDefinition, 'name' | 'description' | 'parameters'>
const text = (description: string): JsonSchemaNode => ({ type: 'string', description })
const number = (description: string): JsonSchemaNode => ({ type: 'number', description })
const bool = (description: string): JsonSchemaNode => ({ type: 'boolean', description })
const aweme = text('视频 ID 或整条链接')
const contract = (name: string, description: string, properties: Record<string, JsonSchemaNode> = {}): ToolContract => ({ name, description, parameters: { type: 'object', properties, additionalProperties: false } })
export const TOOL_CONTRACTS: readonly ToolContract[] = [
  contract('cc_dy_status', '查看今日轮次、选片、额度、登录、环境和下一窗口。'),
  contract('cc_dy_chrome_open', '打开个性化中心专用 Chrome；登录态与旧抖音插件独立。', { port: number('调试端口；默认使用 cdpPort 或 9223') }),
  contract('cc_dy_config', '查看或修改刷抖音设置，返回有效配置。', { patch: { type: 'object', additionalProperties: true, description: '要修改的公开配置字段；省略则只读' } }),
  contract('cc_dy_whoami', '查看抖音登录账号与登录状态。'),
  contract('cc_dy_login_start', '打开登录流程并返回二维码，扫码后用 cc_dy_login_poll 检查结果。遇到图形验证时在当前窗口完成。'),
  contract('cc_dy_login_poll', '检查扫码结果；need_sms 时接着调用 cc_dy_login_sms，保留当前二维码。'),
  contract('cc_dy_login_sms', '在扫码后的验证弹层依次请求短信验证码，随后用 cc_dy_login_sms_submit 提交。', { phone: text('本人确认的 11 位手机号；弹层已显示号码时省略') }),
  contract('cc_dy_login_sms_submit', '提交本人提供的短信验证码并检查登录状态。', { code: text('短信验证码，4 至 6 位数字') }),
  contract('cc_dy_reply_round', '回复自己当日作品及显式附加作品下的新评论，每条至多 20 字。', { count: number('本轮回复条数；默认使用设置'), random: bool('是否随机选择；默认使用设置') }),
  contract('cc_dy_chat_send', '给已授权联系人发送一条私信。', { nickname: text('对方昵称'), text: text('私信正文，可含视频链接或文本表情码') }),
  contract('cc_dy_chat_sticker', '向联系人发送收藏中的表情，按标签选择。', { nickname: text('对方昵称'), keyword: text('情绪或标签；默认大肥鱼，空字符串随机'), pick: number('选择第几项，从 0 开始'), flip: number('翻页数量，0 至 6') }),
  contract('cc_dy_reconcile_pending', '核对待确认回复，只有平台确认后才记成功。', { limit: number('最多核对条数，默认 10') }),
  contract('cc_dy_dm_inbox', '只读查看私信收件箱和最近消息。', { limit: number('最多条数，默认 20'), nickname: text('指定会话昵称；空为全部') }),
  contract('cc_dy_watch', '下载视频并本地转写，返回字幕和时长作为理解依据。', { aweme_id: aweme, seconds: number('最多转写秒数，默认 300'), frames: number('抽帧数量，默认使用设置') }),
  contract('cc_dy_dm_poll', '立即巡检私信，有授权的新消息时启动回复任务。'),
  contract('cc_dy_cleanup', '清理插件自有临时缓存、旧缩略图和旧日报。', { thumbDays: number('缩略图保留天数，默认 30'), reportDays: number('日报保留天数，默认 120') }),
  contract('cc_dy_dm_round', '检查私信并按联系人授权、每日额度和消息去重规则回复。'),
  contract('cc_dy_share', '将视频分享给已授权好友，确认卡片后再补充分享理由。', { aweme_id: aweme, to: text('对方昵称；默认 shareToNick'), title: text('视频标题；省略时读取') }),
  contract('cc_dy_thumb', '为视频生成插件自有缓存中的缩略图。', { aweme_id: aweme }),
  contract('cc_dy_my_posts', '查看账号近期发布的作品。', { days: number('最近天数，默认 1 表示今天') }),
  contract('cc_dy_my_videos', '查看投稿账本中的作品与草稿。'),
  contract('cc_dy_reply', '回复自己作品下指定评论，每条至多 20 字，敏感话题委婉拒绝。', { aweme_id: aweme, cid: text('评论 CID'), text: text('回复正文'), comment: text('原评论提示；发送前仍读取实际评论') }),
  contract('cc_dy_feed', '滚动抖音推荐页并读取视频列表。', { num: number('视频数量，默认 10'), scrolls: number('最大滚屏数，默认 6') }),
  contract('cc_dy_hot', '读取抖音热榜，无需登录。', { limit: number('条数，默认 30，最多 100') }),
  contract('cc_dy_hot_videos', '读取某热点下的视频列表，无需登录。', { sentence_id: text('热榜条目的 sentence_id'), word: text('未提供 sentence_id 时使用的热点词'), num: number('条数，默认 10，最多 60') }),
  contract('cc_dy_search', '搜索视频，返回标题、作者、热度和链接；判断内容前还需阅读评论。', { keyword: text('搜索关键词'), num: number('条数，默认 10，最多 50'), order: text('general 综合、latest 最新或 hot 最热；默认 general') }),
  contract('cc_dy_video', '读取单条视频的标题、简介、作者和统计。', { aweme_id: aweme }),
  contract('cc_dy_comments', '读取视频热门评论及点赞和时间。', { aweme_id: aweme, num: number('条数，默认 30') }),
  contract('cc_dy_like', '给视频点赞或取消赞，受自动点赞开关和当场授权控制。', { aweme_id: aweme, undo: bool('true 表示取消赞'), force: bool('仅本人当场明确要求该动作时设 true') }),
  contract('cc_dy_comment', '发布评论或回复指定评论，受授权、额度和去重控制。', { aweme_id: aweme, text: text('短评论正文'), reply_cid: text('要回复的评论 CID；省略为顶层评论'), force: bool('仅本人当场明确要求该动作时设 true') }),
  contract('cc_dy_publish', '投稿 MP4，默认存草稿；可以取 ComfyUI 本轮生成或输出目录最新视频。', { video_path: text('现有 MP4 的本地路径；优先于 latest'), latest: bool('没有 video_path 时取 ComfyUI 输出'), draft: bool('是否只存草稿；默认使用设置，初始为 true'), title: text('作品标题'), tags: text('空格或逗号分隔的话题'), force: bool('仅本人当场明确要求该动作时设 true') }),
  contract('cc_dy_comfy_list', '按修改时间列出 ComfyUI 输出目录中的 MP4。', { limit: number('条数，默认使用设置') }),
  contract('cc_dy_run', '立即执行一轮推荐筛选和报告。', { mode: text('local 宿主执行，headless 后台模型；默认 local') }),
  contract('cc_dy_selfcheck', '显式检查 Python、脚本、配置所需媒体依赖以及浏览器登录和搜索。'),
]
