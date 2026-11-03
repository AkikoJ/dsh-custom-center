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
| lib/actions.mjs、账本及写入守卫 | server/actions.ts、ledger.ts、execution.ts |
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
2. 统一路径、配置、原子存储和独立导入：完成。类型检查、158 项测试、构建通过；将构建出的导入命令单独复制到仓库外临时目录，使用临时旧数据验证实际执行成功。导入包含源/目标哈希、冲突保留、独占锁、崩溃锁恢复、进度清单、目标变化撤销完成标记、自定义脚本保留及虚拟环境重建标记。未读取或改写真实旧数据。全量验证中既有壁纸上传测试出现过一次临时文件异步清理时序失败，后续复跑通过；本批不修改该模块。
