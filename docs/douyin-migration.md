# 抖音迁移记录

## 来源和范围

本次将独立插件 dsh-douyin-life 0.2.9 并入个性化中心，以保留原业务为目标，按功能内部职责组织实现。已发现的功能与界面差异见[修复清单](douyin-parity-repair.md)；为支持共存，中心版外部名称已做下述适配。

- 源仓库：git@github.com:kdcadmin/dsh_douyin_tools.git
- 固定提交：aaf9f9a862afafd45a15acf32789da97688de695
- 提交时间：2026-10-31 00:25:11 +0800
- 提交主题：docs: 恢复 README 封面图 + 修正截图引用（02/05/06/07 文件名对不上）
- 目标起点：971e61d5c3a9cef8a44a1c91e18d9733a5aec737
- 目标分支：feat/douyin-tools-clone
- 源版权：Copyright (c) 2026 TiAmoSS，MIT，见 [许可证](../LICENSE-douyin)。

迁移不恢复目标历史上已回退的登录实现，不修改源仓库，不安装或切换运行 profile，不推送。原有未跟踪 Python 字节码不属于本次迁移。

## 合同基线

[快照](../tests/douyin/fixtures/upstream-contract.json) 从固定提交读取，不执行插件或账号操作，记录每个源文件 SHA-256、35 个工具名称、原描述、参数与输出 schema、74 个 Config 字段表达式（含默认值和 volatile）、32 个 HTTP 路径和七个页签。快照中原始描述逐字保留，包括上游已有符号；新实现、注释和文档不新增此类符号。

重建快照：`node scripts/douyin-baseline.mjs <源仓库>`。该脚本始终从固定提交读取，不使用工作树或后来上游 HEAD。

真实存在的检查是 selfcheck.mjs、tests/dm-regression.mjs 和 tests/protocol-smoke.mjs。源 npm 的 test、test:proxy、test:headless、test:media:real 指向不存在文件，不能视为已通过验证。

## 归属与映射

| 原实现 | 目标职责 |
| --- | --- |
| index.js Config、默认值、配置桥 | src/douyin/config.ts、server/configuration.ts |
| lib/state.mjs、宿主路径和持久化 | server/paths.ts、storage.ts、import-legacy.ts |
| lib/actions.mjs、账本及写入守卫 | server/actions.ts、ledger.ts、action-policy.ts、action-executor.ts |
| lib/mcp.mjs、process.mjs、action-proxy.mjs | server/mcp.ts、process.ts、action-proxy.ts |
| lib/dsh-cli.mjs、headless overlay 和启动 | server/headless.ts、cli.ts |
| index.js Chrome/CDP、登录、采集 | [browser.ts](../src/douyin/server/browser.ts)、[content.ts](../src/douyin/server/content.ts) |
| index.js 私信、回复、发布、ComfyUI | server/ 下按业务职责拆分，共用执行守卫 |
| index.js 定时器、清理、日报、记忆 | server/scheduler.ts、cleanup.ts、reports.ts、memory.ts |
| client.js 页面状态、七页签、视频视图 | client/ 下 TS/TSX 模块，通过中心浏览器入口装配 |
| vendor/douyin-mcp/* | resources/douyin/mcp/ |
| video-understanding-lab/* | resources/douyin/video-understanding/ |
| prompts/* | resources/douyin/prompts/ |
| package.json 上游版本和元信息 | resources/douyin/upstream.json |
| 源测试、自检、文档、资源、许可证 | tests/douyin/、docs/、resources/douyin/、LICENSE-douyin |

独立宿主入口使用 dsh-custom-center/douyin，Loader 行及设置页为 `custom-center-douyin`，会话视图为 `custom-center-douyin-watched`，HTTP 前缀为 `/api/custom-center/douyin`，35 个工具使用 `cc_dy_*`。旧插件保持原名，可同时加载；详见[并行启动说明](douyin-coexistence.md)。下方批次记录是历史状态，其中的原名保留说明已由本次共存适配取代。

## 必要适配

统一数据根优先 DSH_CUSTOM_CENTER_DOUYIN_HOME，其次 DSH_HOME/dsh-custom-center/douyin，最后 ~/.dsh/dsh-custom-center/douyin。所有子进程显式接收同一数据根和缓存环境；不得修改宿主全局环境。

缓存归 cache，持久化登录态归 browser。旧数据只能通过独立命令校验复制，保留原目录，不覆盖已有目标，记录清单和完成标记并支持重试，不在启动时隐式迁移。开发验收仅使用临时目录和替身。

HTTP 统一执行回环、来源、浏览器请求标记及服务端资源根检查。工具原有显式路径功能保留。界面资源访问随之同步调整。

上游版本独立存储，不能将目标包 0.1.0 用作上游版本。Python、提示词、视频理解和 CLI 定位在打包后独立验证。

## 最终工具与路由映射

全部工具将原 `dy_` 一一映射为 `cc_dy_` 名称，参数与[冻结快照](../tests/douyin/fixtures/upstream-contract.json)核对；
注册入口见 [tools.ts](../src/douyin/server/tools.ts)。下表按业务归属列出全部 35 项。

| 目标职责 | 中心版工具 |
| --- | --- |
| 状态和配置 | `cc_dy_status`、`cc_dy_config`、`cc_dy_selfcheck` |
| Chrome 与登录 | `cc_dy_chrome_open`、`cc_dy_whoami`、`cc_dy_login_start`、`cc_dy_login_poll`、`cc_dy_login_sms`、`cc_dy_login_sms_submit` |
| 视频采集和理解 | `cc_dy_feed`、`cc_dy_hot`、`cc_dy_hot_videos`、`cc_dy_search`、`cc_dy_video`、`cc_dy_comments`、`cc_dy_watch`、`cc_dy_thumb`、`cc_dy_my_posts` |
| 评论和写动作 | `cc_dy_like`、`cc_dy_comment`、`cc_dy_reply`、`cc_dy_reply_round`、`cc_dy_reconcile_pending` |
| 私信和分享 | `cc_dy_chat_send`、`cc_dy_chat_sticker`、`cc_dy_dm_inbox`、`cc_dy_dm_poll`、`cc_dy_dm_round`、`cc_dy_share` |
| 投稿和生成 | `cc_dy_publish`、`cc_dy_my_videos`、`cc_dy_comfy_list` |
| 轮次和维护 | `cc_dy_run`、`cc_dy_remember`、`cc_dy_cleanup` |

[路由表](../src/douyin/server/routes.ts)保留 32 个精确路径，共用 `/api/custom-center/douyin` 前缀：

| 方法 | 路径后缀 |
| --- | --- |
| GET | `/update/check`、`/status`、`/thumb`、`/memory`、`/watched`、`/cover`、`/comfy/list`、`/dm`、`/stickers`、`/report/latest`、`/setup/log`、`/log/tail` |
| GET / POST | `/config` |
| POST | `/login/browser`、`/login/browser/close`、`/login/qr`、`/login/poll`、`/run`、`/persona`、`/publish`、`/dm/seen/clear`、`/dm/test`、`/stickers/tags`、`/stickers/test`、`/reply/round`、`/login/sms`、`/login/sms/submit`、`/setup`、`/selfcheck`、`/chrome/open`、`/log`、`/open` |

设置保留日常、刷视频、互动、私信、表情包、记忆、高级七个页签及 `custom-center-douyin-watched` 会话视图；
[字段归属](../src/douyin/client/fields.ts)覆盖 74 个公开配置字段并注册双语标签。
配置保存通过差异补丁保留保存期间的新输入，服务器统一清洗字段并同步宿主配置。

## 旧目录映射

下列目标均相对统一数据根，完整映射由 [paths.ts](../src/douyin/server/paths.ts)维护。

| 原名称 | 新位置 |
| --- | --- |
| `config.json` | `config/config.json` |
| `ledger.json`、`day-ledger/` | `ledger/ledger.json`、`ledger/days/` |
| `replied-cids.jsonl`、`replied-users.jsonl` 及旧文本索引 | `ledger/`，保留跨日去重 |
| `state.json`、`dm-cursors.json`、`dm-sent.json`、`dm-log/` | `state/`，保留旧私信数据形状与持久游标 |
| `out/` | `reports/` |
| `memory/` | `memory/` |
| `duty.md`、`persona.md`、提示词哈希和备份 | `prompts/` |
| `mcp_server.py`、脚本哈希和备份 | `runtime/` |
| `browser/` | `browser/`，不作为可清理缓存 |
| `thumbs/`、`media/`、`models/`、`shots/`、表情和临时目录 | `cache/` 对应子目录 |
| 日志 | `logs/` |
| `.venv/` | 不复制，安装后在 `python/.venv/` 重建 |
| 其余持久文件 | `state/legacy/`，保留原相对路径 |

自定义脚本和人设保留；新版受管脚本写入 `.new` 供人工比较。
导入仅重写指向旧应用自有路径的配置，外部 Chrome、工作区、ComfyUI 和自定义路径保持原值。
发生冲突时不覆盖目标，退出码为 2；处理冲突后用相同参数重跑，导入清单记录校验进度。

## 最终验收与边界

2026-11-04 的最终离线验收覆盖类型检查、38 个测试文件的 307 项测试、声明及宿主/浏览器构建。
架构检查覆盖手写 TS/TSX 与测试 800 行上限、无环依赖、功能边界、无入口反向导入及浏览器无 Node 依赖。

```sh
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false test
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false douyin:check-package
```

[打包验收脚本](../scripts/douyin-package-check.mjs)以离线模式执行 npm pack，将实际发布包解压到仓库外临时目录，
确认入口、声明、许可证、元信息和 Python/提示词资源齐全，且不包含 vendor、虚拟环境或 Python 字节码。
使用宿主 SDK 与服务替身装卸 35 个工具和 32 条路由，执行只读状态工具核对固定提交，
两次运行独立导入并确认旧目录字节不变、自定义脚本保留且出现 `.new`，从其他 cwd 运行随包视频 doctor。
浏览器工厂通过共享 React、JSX runtime 与 UI primitive 模块替身加载；这一步不渲染页面。
脚本保留临时目录并打印位置，便于核对包内容；没有安装运行 profile 或访问真实账号。

已验证的是业务与生命周期离线行为及发布物可加载性。真实 Chromium 页面选择器、扫码/短信、平台卡片回执、
模型提供方、ComfyUI 服务和正式 GUI 的视觉/交互需要部署环境验收。
本机缺少 faster-whisper，未下载模型；视频 doctor 成功仅表明诊断入口可执行，不能替代视频转写就绪检查。
既有 Skills 测试的 React key spread 提示与本次迁移无关，测试保持通过。

## 切换与回退

以下步骤是部署操作说明，本次没有执行：

1. 停止旧插件的定时任务、后台会话、Python MCP 和使用旧目录的浏览器；确认没有活进程占用。
2. 保留旧目录备份，构建新包。在任何新任务启动前执行 `pnpm douyin:import --legacy-stopped`；
   需要时添加 `--source /旧目录 --target /新目录`，运行环境使用同一个 `DSH_CUSTOM_CENTER_DOUYIN_HOME`。
3. 检查导入清单、完成标记、冲突和虚拟环境重建标记。保留冲突双方，解决后重跑；不手工删除不明占用锁。
4. 检查导入配置中的自动开关、固定联系人、额度、作品范围、CDP 地址与端口及自定义脚本差异。
   通过官方 Bundle/profile 机制启用新包；旧插件可以保留并同时加载，两套自动任务需分别配置，不能共用账本或假设跨插件去重。
5. 在设置页重建 Python 环境，显式运行自检并核对登录账号；先检查状态、配置、视频列表和报告。
   扫码、短信和平台写动作只在账号本人明确授权后分别验收。
6. 重新打开或刷新正式 GUI，检查七页签、会话视图、主题、窄屏布局、键盘切换、配置保存、取消和卸载。
   仅在只读检查及对应动作验收完成后开启需要的自动功能。
7. 若回退，先停止新入口并等待进程和在途请求退出，保留新目录、未知发送记录及确认回执。
   重新启用旧入口前先核对新旧账本和永久去重记录；导入是单向复制，旧目录不会自动取得新动作记录，
   不能在尚有未知发送时直接恢复自动重发。旧目录和新目录均保留。两套入口可在各自目录并行加载；同账号自动任务需避免重叠，导入操作期间来源必须停止。

## 批次与验证

每批提交前运行 pnpm typecheck、pnpm test、pnpm build，实际结果在此追加。当前尚未进行真实浏览器或账号验收；全部写操作必须使用替身。

1. 来源、许可证和合同基线：完成，提交 7f835f8。类型检查、147 项测试及构建通过。pnpm 11 默认先检查依赖并尝试非交互重装，报 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY；通过命令行 verify-deps-before-run=false 使用现有依赖完成同一检查，未改变仓库包管理配置。既有 Skills 生命周期测试仍输出 React key spread 提示，与本批无关。
2. 统一路径、配置、原子存储和独立导入：完成，提交 a58d3f9。类型检查、158 项测试、构建通过；将构建出的导入命令单独复制到仓库外临时目录，使用临时旧数据验证实际执行成功。导入包含源/目标哈希、冲突保留、独占锁、崩溃锁恢复、进度清单、目标变化撤销完成标记、自定义脚本保留及虚拟环境重建标记。未读取或改写真实旧数据。全量验证中既有壁纸上传测试出现过一次临时文件异步清理时序失败，后续复跑通过；本批不修改该模块。
3. Python MCP、视频理解资源、提示词部署及通信：完成，提交 71efc0a。类型检查、165 项测试及构建通过；单独打包资源定位模块并复制资源到仓库外，以其他工作目录执行视频 doctor 成功。Python 源文件全部离线编译，假注册器确认默认不暴露写工具；MCP 进程用本地协议替身覆盖并发、分片、超时、退出及重启。自定义脚本、人设保留；只有散列匹配的受管资源可自动升级。doctor 检测到本机尚无 faster-whisper，未下载模型或安装依赖，也未启动账号浏览器。首次临时打包验证因测试脚本假定扩展名 .js 而构建器输出 .mjs 失败；按正式构建的 fixedExtension=false 重验通过。
4. 账号操作锁、运行状态、账本、永久回复索引及统一执行：完成，提交 8c9cabf。类型检查、194 项测试及构建通过。新增 29 个离线场景，覆盖跨入口并发限额、失效锁恢复、未知锁保留、源动作键兼容、未确认额度预留、可信工具授权、作品范围及短回复检查、跨日索引、真实路径投稿限制、私信联系人额度以及短期本地代理。未调用真实账号写接口。工具、业务自动化、HTTP 与界面尚待装配。
5. 浏览器登录、ComfyUI、记忆、日报、私信消息模型和清理：完成。类型检查、204 项测试及构建通过。新增 10 个离线场景，验证完成工作流只选自己的单一 MP4、目录和符号链接越界拒绝、按月记忆、人设手写正文保留、日报关闭、已看分组、繁忙时延后清理以及扫码后返回无头模式。首次测试发现 macOS /var 与 /private/var 别名差异导致缓存被跳过，已改为真实路径比较并复验。清理仅接受插件自有物理目录，保留转写、Cookie、外部附件和符号链接。未启动真实浏览器、ComfyUI 工作流或账号会话。
6. Python 运行环境、可取消安装、内容读取、投稿及短回复编排：完成。类型检查、214 项测试及构建通过。新增 10 个离线场景，覆盖解释器选择和显式子进程环境、安装失败与卸载取消、采集输入上限及超时、启动 ComfyUI 前的授权和额度检查、默认草稿、实际评论取证、敏感话题拒绝、未识别图片跳过及永久去重。回复范围按本次规格默认只取当日作品，保留显式附加作品授权；调用方传入的 comment 不参与敏感话题取证。首次单测发现替身断言多写一个 undefined 参数，修正后通过；未安装依赖、下载模型或调用真实账号。其余业务及 UI 尚未挂载。
7. 私信消息选择、日志与跨日游标、快回和后台任务回执、收件箱轮次及事件监听：完成。类型检查、226 项测试及构建通过。新增 12 个离线场景，覆盖入站方向、自己发送文本回显、旧 DOM 索引复用、损坏游标停发、跨日去重、白名单交集、未知发送不重发、共享执行器额度、视频转后台任务、联系人约束、事件基线同步、繁忙延后与退避。后台任务只接受确认发送且匹配指定联系人的回执；清空展示用已读索引不清除发送去重。未调用真实私信或启动账号浏览器。其余业务及 UI 继续迁移。
8. CLI 定位、临时 overlay、后台章程上下文和会话生命周期：完成。类型检查、241 项测试及构建通过。新增 15 个离线场景，使用本地 Node 子进程替身验证无 shell 参数、桌面启动 shim、环境白名单、每轮私有凭据、动态工具关闭、宿主强制联系人、重复及未知回执拒绝、观看额度、跨实例占用、启动取消、超时、符号链接越界和回调失败收尾。后台进程主环境不持有平台写权限，写工具通过短期代理回到共享执行器；私信任务不会调用其他账号写工具。完成回调在代理撤销、在途动作与进程退出之后等待执行，成功后才计轮次。未启动真实 DSH 后台会话、切换 profile 或访问账号；模型、其余业务及 UI 继续迁移。
9. 安全图片读取、官方附件引用、固定视觉端点及官方 LLM 短文本适配：完成。类型检查、258 项测试及构建通过。新增 17 个离线场景覆盖可信域名、混合 DNS、IPv4/IPv6 保留及过渡地址、逐跳校验、大小和格式限制、取消、附件索引、凭据按次解析、视觉回退、推理参数兼容、图片模型不支持、部分输出拒绝及卸载取消。首次测试发现单段零 IPv6 Teredo 表示未被拒绝，已修正。视觉服务接收已校验图片字节，不再要求第三方读取远程 URL；不记录凭据。新增官方 npm SDK 开发依赖且跳过安装脚本；pnpm 存储路径差异通过本次命令显式沿用既有目录解决，未改全局配置。pnpm peers check 仍报告若干 SDK 宿主运行时 peer 未在此开发项目安装；本批未启动这些宿主服务，也未访问真实图片 CDN、模型 API 或账号。后台 MCP 白名单已实现，完整 CLI 预设工具范围仍待核实和收紧，运行功能继续保持未挂载。
10. 后台 CLI 整轮工具范围：完成。类型检查、260 项测试及构建通过；首次全量测试再次遇到既有壁纸上传清理时序失败，完整复跑通过。新增子进程专用官方单调工具守卫；每个 Agent 过滤全局工具，固定 native 展示，并拒绝作用域新增的 shell、文件、子代理及其他 MCP 工具调用。runner 注入就绪标记，守卫缺失时无法开始轮次。独立构建入口按包内资源定位，临时配置仍只存本轮最小凭据。使用真实官方工具注册器离线验证前置 allow 无法覆盖拒绝，以及作用域工具不能绕过白名单；未启动真实 CLI 账号任务或修改 profile。SDK 运行依赖仅添加到本开发项目并跳过安装脚本。
11. 本机推荐轮次、卡片附言与续火花、收藏标签、状态自检及定时巡检：完成。类型检查、279 项测试及构建通过。新增 19 个离线场景覆盖平台毫秒时长、评分和去重、手动零额度模式、推荐流回退、共享评论预算及动作轮转、转写证据缺失停发、连续失败停止、跨日与卸载、卡片和附言确认顺序、联系人授权、固定收藏文件、谷时六次重试、串行巡检、异常隔离、计时抖动、夜间独立清理、状态身份和环境就绪证据。选片先持久化到账本和报告，未确认卡片不补附言，未确认附言不补表情；这收紧了上游仅点击分享也补消息的行为。自检只在显式请求时调用平台检查，状态快照不启动 MCP。首次新测试因 mockResolvedValueOnce 不执行默认替身日志导致断言失效，已改为检查实际调用数。未访问真实平台、模型、ComfyUI 或账号；宿主与界面装配继续迁移。
12. 独立宿主入口、35 个工具、32 条精确路由及运行生命周期：完成。类型检查、292 项测试、声明与双端构建通过。新增 13 个离线场景覆盖真实 Cordis fiber 装卸、工具注册冲突回滚、在途请求排空、取消前置检查、参数和路径合同、HTTP 来源及资源边界、固定测试联系人、网页强制授权拒绝、过期投稿选择拒绝、只读上游版本检查以及配置初值、串行保存和缓存失效。独立导出 dsh-custom-center/douyin；设置命名空间保留 douyin-life。配置保存中本地值先行，成功后重新读取宿主 revision；工具输出转换为无 undefined 的 JSON。首次声明构建发现 SetupState 未导出，补齐后通过；全量测试曾触发既有壁纸临时文件清理时序失败，完整复跑通过。未挂载 Bundle、切换 profile、启动账号浏览器或访问平台；七页签与会话视图继续迁移。
13. 七页签、74 个公开字段、会话视频视图与 Bundle 声明：完成。类型检查、298 项测试与双端构建通过。中心浏览器入口挂载独立抖音 fiber，保留 douyin-life 与 douyin-watched；所有新文案注册中英字典，沿用宿主主题令牌。设置保留草稿及保存期间新输入；键盘支持左右键、Home、End 切换页签。视频图片使用带来源标记的认证请求与对象 URL，卸载时取消并释放；原片地址限制为 HTTPS 抖音作品。登录、固定联系人私信和表情测试、收藏标签、记忆、人设、环境维护与文件凭据投稿均复用宿主操作。投稿先选择列表项目，再明确确认草稿或正式发布。新增离线合同、注册卸载、翻译和请求边界测试；未安装 profile、刷新当前 GUI、启动浏览器或使用真实账号。
14. 取消、超时与卸载期间的进程收尾：完成。类型检查、304 项测试与双端构建通过。命令和 MCP 超时或取消后等待 close，必要时升级 SIGKILL，确认退出后才拒绝在途调用；运行环境切换串行等待旧进程结束。卸载信号穿透嵌套执行上下文，安装及 ComfyUI 请求继承取消；事件监听停止保留清理通道。新增延迟退出替身验证、预取消、卸载与工作流取消测试，补齐工具白名单末尾换行拒绝。推荐轮次拒绝非有限评分输入，并在取消或卸载后停止热榜回退。首次全量测试发现预取消由异步拒绝变为同步抛错，已恢复原接口并复验。未启动平台账号或真实工作流。
15. 资源部署、文件打开、导入锁恢复及后台代理排空复核：完成。类型检查、307 项测试及双端构建通过。资源采用私有临时文件和原子发布，拒绝目录、脚本、哈希、备份及新版侧文件符号链接，保护用户自定义脚本；读取文件核对描述符 inode、设备及物理位置。导入恢复锁加入独占恢复目录，不抢占不明恢复过程。后台任务持有独立取消信号，结束时先取消在途平台操作，再撤销并排空代理、等待进程退出与回调；新增挂起平台替身验证停止能完整结束。未操作真实账号或运行 profile。
16. 发布物验收及交付文档：完成。类型检查、307 项测试、双端构建及 `douyin:check-package` 通过。实际 npm 发布包在仓库外解压，验证宿主装卸、固定版本状态、独立重复导入、自定义资源保留、浏览器工厂及随包 doctor；校验许可证、声明、双语指南和迁移文档随包发布。显式声明仅内联官方 SDK 小型值构造器，Cordis/Schemastery 仍由宿主提供。补齐全部工具、路由、目录映射及切换/回退说明，并同步领域词汇和当前架构。未修改源仓库、推送、安装或切换 profile。
