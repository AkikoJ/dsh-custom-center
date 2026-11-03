# 抖音迁移记录

## 来源和范围

本次将独立插件 dsh-douyin-life 0.2.9 并入个性化中心，保留原业务和外部合同，按功能内部职责组织实现。

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
| index.js Chrome/CDP、登录、采集 | server/browser.ts、tools/ 下的登录和内容工具 |
| index.js 私信、回复、发布、ComfyUI | server/ 下按业务职责拆分，共用执行守卫 |
| index.js 定时器、清理、日报、记忆 | server/scheduler.ts、cleanup.ts、reports.ts、memory.ts |
| client.js 页面状态、七页签、视频视图 | client/ 下 TS/TSX 模块，通过中心浏览器入口装配 |
| vendor/douyin-mcp/* | resources/douyin/mcp/ |
| video-understanding-lab/* | resources/douyin/video-understanding/ |
| prompts/* | resources/douyin/prompts/ |
| package.json 上游版本和元信息 | resources/douyin/upstream.json |
| 源测试、自检、文档、资源、许可证 | tests/douyin/、docs/、resources/douyin/、LICENSE-douyin |

独立宿主入口使用 dsh-custom-center/douyin，Loader 行及设置页仍为 douyin-life，会话视图仍为 douyin-watched，HTTP 前缀仍为 /api/douyin-duty。未完成模块在前期批次保持未挂载。

## 必要适配

统一数据根优先 DSH_DOUYIN_HOME，其次 DSH_HOME/dsh-custom-center/douyin，最后 ~/.dsh/dsh-custom-center/douyin。所有子进程显式接收同一数据根和缓存环境；不得修改宿主全局环境。

缓存归 cache，持久化登录态归 browser。旧数据只能通过独立命令校验复制，保留原目录，不覆盖已有目标，记录清单和完成标记并支持重试，不在启动时隐式迁移。开发验收仅使用临时目录和替身。

HTTP 统一执行回环、来源、浏览器请求标记及服务端资源根检查。工具原有显式路径功能保留。界面资源访问随之同步调整。

上游版本独立存储，不能将目标包 0.1.0 用作上游版本。Python、提示词、视频理解和 CLI 定位在打包后独立验证。

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
