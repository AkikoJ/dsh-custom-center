# 三功能源码组织验证记录

日期：2026-10-29。对应 `.scratch/feature-organization/issues/01` 至 `04`。

## 基线

- 基准提交：`b5431b6707471abfc2ccff02c96e25de2980bf04`（分支 `main`）。
- 初始工作区：`AGENTS.md` 已修改；`.scratch/`、`docs/agents/`、ADR-0002 与定稿方案未跟踪。保留这些用户内容。
- 逐文件行数、SHA-256、Git 初始状态和用户差异见 [基线清单](../.scratch/feature-organization/baseline.json)。
- 已确认 `pnpm typecheck` 使用 `tsc --noEmit`；`pnpm test` 仅运行 Vitest，无构建钩子，`vitest.config.ts` 无产物构建流程。
- 不执行构建、提交或推送；不修改依赖、锁文件、构建配置及已有产物。

## 阶段结果

| 阶段 | 命令与检查 | 实际结果 |
| --- | --- | --- |
| 0 基线 | `pnpm typecheck` | 通过，无产物。 |
| 0 基线 | `pnpm test`（沙箱） | 13 文件 / 119 测试通过；壁纸库 13 测试因 `listen EPERM 127.0.0.1` 被跳过，hook 超时，整体失败。 |
| 0 基线 | `pnpm test`（授权沙箱外重试） | 14 文件 / 132 测试全部通过。 |
| 1 共享 | `pnpm typecheck` | 通过，无产物。 |
| 1 共享 | `pnpm exec vitest run tests/config.spec.ts tests/media.spec.ts tests/library.spec.ts tests/tuning.spec.ts tests/host-tuning.spec.ts`（授权沙箱外） | 5 文件 / 67 测试全部通过。 |
| 1 共享 | 声明、导入绑定、CSS、依赖图与既有产物比对 | 81 个既有源码/测试文件逻辑保持一致，54 个受保护文件字节一致，163 个既有产物一致；无依赖边界错误及环。 |
| 2 外观 | `pnpm typecheck` | 通过，无产物。 |
| 2 外观 | `pnpm exec vitest run tests/color.spec.ts tests/skins.spec.ts tests/sample.spec.ts tests/media.spec.ts tests/library.spec.ts`（授权沙箱外） | 5 文件 / 57 测试全部通过。 |
| 2 外观 | 声明、导入绑定、CSS、依赖图与既有产物比对；`git diff --check` | 全部通过；外观纯逻辑、浏览器与宿主接口完整迁移，Skills 字节未改。 |
| 3 调优 | `pnpm typecheck` | 通过，无产物。 |
| 3 调优 | `pnpm exec vitest run tests/tuning.spec.ts tests/host-tuning.spec.ts` | 2 文件 / 34 测试全部通过。 |
| 3 调优 | 声明、导入绑定、CSS、依赖图与既有产物比对 | 全部通过；5 个功能模块迁移，旧 `src/core/` 与 `src/host/` 已空并移除。 |
| 4 集成 | `pnpm typecheck` | 通过，无产物。 |
| 4 集成 | `pnpm test`（授权沙箱外，Vitest 4.1.12） | 14 文件 / 132 测试全部通过；无跳过、无失败。 |
| 4 集成 | 全量物理行数、旧路径、运行时与类型依赖、静态等价和差异空白检查 | 通过；详情如下。 |

### 共享边界

- `config.ts`、整份样式、浏览器适配与 Node 适配分别移动至 `src/shared/config.ts`、`styles.ts`、`browser-env.ts`、`host-env.ts`。
- 仅将 `MARKER_HEADER` 与 `isLoopbackAddress` 原定义移入 `src/shared/request.ts`；所有消费者直接引用，媒体模块无转发。
- CSS 最终字符串为 15,240 字节，迁移前后 SHA-256 均为 `72bf68a6bd43001357861694a947856b1af49bade766b20f452de308a9527403`；样式模块除位置外字节不变，注入函数及入口执行顺序未改。
- 已复核可访问同级 `dsh-client-ui-skins`、`dsh-purge`、`dsh-skills-manager`、`skills`、`.install-main` 和 `~`，排除依赖、产物及 Git 目录，未发现当前包旧源码深导入；此结论不涵盖不可访问的仓外消费者。

## 实际迁移

以下为本轮实际移动，模块名与原声明保留，只有两份环境适配按方案更名。

| 原路径 | 当前路径 |
| --- | --- |
| `src/core/config.ts` | `src/shared/config.ts` |
| `src/client/styles.ts` | `src/shared/styles.ts` |
| `src/client/dsh-env.ts` | `src/shared/browser-env.ts` |
| `src/host/env.ts` | `src/shared/host-env.ts` |
| `src/client/AppearancePage.tsx` | `src/appearance/client/AppearancePage.tsx` |
| `src/client/LibraryPicker.tsx` | `src/appearance/client/LibraryPicker.tsx` |
| `src/client/controller.ts` | `src/appearance/client/controller.ts` |
| `src/client/wallpaper.ts` | `src/appearance/client/wallpaper.ts` |
| `src/client/library.ts` | `src/appearance/client/library.ts` |
| `src/core/color.ts` | `src/appearance/color.ts` |
| `src/core/skins.ts` | `src/appearance/skins.ts` |
| `src/core/sample.ts` | `src/appearance/sample.ts` |
| `src/core/tone.ts` | `src/appearance/tone.ts` |
| `src/core/media.ts` | `src/appearance/media.ts` |
| `src/host/library.ts` | `src/appearance/server/library.ts` |
| `src/client/TuningPanel.tsx` | `src/tuning/client/TuningPanel.tsx` |
| `src/client/Select.tsx` | `src/tuning/client/Select.tsx` |
| `src/client/tuning.ts` | `src/tuning/client/tuning.ts` |
| `src/core/tuning.ts` | `src/tuning/tuning.ts` |
| `src/host/tuning.ts` | `src/tuning/server/tuning.ts` |

另外，从原 `src/core/media.ts` 原样提取 `MARKER_HEADER`、`isLoopbackAddress` 至 `src/shared/request.ts`；媒体规则不转发共享声明。外观与调优的浏览器请求、宿主守卫仍各自保留实现。所有仓内消费者及既有测试导入已更新，未增加聚合入口、兼容包装或新子插件。

## 静态等价与边界

- [声明和资源比对结果](../.scratch/feature-organization/equivalence.json)：针对迁移前 81 个源码/测试文件，逐个比较去除 import 后的顶层声明文本与规范化 import 绑定；只容许既定文件位置变化、必要导入改写和两个共享声明的归属变化。两入口的注册、控制器创建、样式注入、服务求值与清理代码均未改，页面 TSX、事件和存储合同声明亦保持一致。
- 45 个 `src/skills/` 文件逐字节一致；测试只调整迁移模块导入，无新增断言或框架。54 个受保护文件（Skills 与依赖、锁文件、入口配置、许可证等）逐字节一致；163 个既有 `lib/` 文件的路径集合及摘要一致。未更新 SDK、`package.json`、两份 tsconfig、tsdown/Vitest 配置、profile 或许可证。
- [依赖图结果](../.scratch/feature-organization/dependencies.json)：68 个源码模块，241 条运行时边、85 条纯类型边；静态 import/export、动态 import/require 和 import 类型均纳入解析。无未解析的相对路径、运行时环、共享反向边或外观与调优交叉依赖。
- 浏览器入口运行时可达 40 个源码模块，无 Node、宿主适配或 `server/` 实现；显式外部运行时依赖仅 `react`、`@deepseek-ai/dsh-client-ui-primitives`。图不计 JSX 自动注入的 `react/jsx-runtime`；该编译运行时的原有 external 配置未变，最终打包未验证。SDK 类型继续来自正式 npm 包，未引入 DSH 源码路径别名，两份环境适配通过纯类型 import 使用。
- `src/core/` 与 `src/host/` 已移除，`src/client/` 仅保留真实入口 `index.ts`。当前源码、测试、根配置、README 和项目规则均无迁移前旧路径引用；相对导入由图解析及类型检查再次核对。历史方案、ADR 与上一轮验证文档保留旧路径的历史含义。
- 中英文 README 的挂载表、目录树与浏览器适配说明同步更新；原错误的独立 `TuningPage.tsx` 条目改为真实 `TuningPanel.tsx` 内的页面声明。项目规则仅更新 Layout，初始用户追加的 Agent skills 内容保留；词汇表、历史文档无无关改动。
- `git diff --check` 通过。迁移文件还对照快照检查空白，覆盖 Git 尚未跟踪的新目录；不存在通过压缩行数规避限制的改写。

## 物理行数

[逐文件清单与摘要](../.scratch/feature-organization/line-counts.json)包含导入、声明、注释与空行，文件末尾换行不另计为空行。

- 84 个手写源码、声明、样式、测试和根 `.ts` 配置文件；另计 2 个根 `tsconfig*.json`，合计 86 个。
- 最大文件 `src/skills/client/useSkillManager.ts`：634 行；全部低于或等于 800 行，超限 0 个。
- 对比初始 83 个手写文件，只增加真实共享职责 `src/shared/request.ts`；没有继续拆分稳定 Skills 模块。

## Skills 回归证据

以下 6 个既有测试文件纳入本轮全量 14 文件 / 132 项通过结果，共 38 项 Skills 测试：

| 测试文件 | 本轮通过的既有覆盖 |
| --- | --- |
| `skills-state.spec.ts` | 策略迁移、缺失/损坏状态拒绝、分类顺序、用户与项目作用域隔离、Provider 定位与策略 |
| `skills-files.spec.ts` | 创建、预检、覆盖、独立/文件夹/ZIP 导入、二进制内容、路径与符号链接拒绝、回收站元数据与恢复冲突 |
| `skills-sync.spec.ts` | 只读来源、同步状态、同名冲突、手动覆盖、批量同步与 Provider 隔离 |
| `skills-routes.spec.ts` | 守卫顺序、按请求读取信任配置、HTTP 合同、HTTP/工具唯一队列、通知与注册清理 |
| `skills-client-data.spec.ts` | URL、请求头与响应、上传结构、错误回退、最终 CSS 和双语词典字节 |
| `skills-client-lifecycle.spec.ts` | 会话切换与重挂载、作用域归属、过期响应、卸载失效、变更锁、串行批量失败与刷新 |

这些既有测试和静态比对未发现本轮新增的行为覆盖缺口，因此未增加逐文件镜像测试。测试证据不替代真实宿主验收。

## 双轴代码审查

按 code-review 技能完成 Standards 与 Spec 两项独立审查，固定基准为本轮初始提交，并覆盖未跟踪迁移文件；原用户规划文件及规则追加以初始快照区分。

- Standards：0 项硬性违规、0 项新增代码异味；确认迁移及必要引用调整、共享边界、用户规则保留和双语说明一致。
- Spec：发现 1 项 P3 旧路径注释遗漏，`src/appearance/client/wallpaper.ts` 仍将配色逻辑描述为位于 `src/core`；已改为 `src/appearance`，无运行逻辑变更。未发现其他规格遗漏或范围扩张。
- 修正后重新比对声明、导入绑定、CSS、Skills、配置、既有产物及依赖图，并重新统计行数、检查旧路径与差异空白；全部通过。仅修正文档和注释，未重复运行已通过的完整测试。
- 真实 DSH、最终 bundle 与视觉交互保留为未完成项；04 不标记为 resolved。

## 真实宿主验收与未完成项

未完成：尚无相同宿主版本、数据、主题、窗口的运行前后对照；本轮未创建新 bundle，不宣称最终 bundle、视觉及真实交互已验证。已有产物保持原样，不能作为本轮源文件迁移的运行证据。

- [ ] 对照相同宿主版本、数据、主题及窗口条件，运行迁移前后版本。
- [ ] 检查三个导航项、外观草稿预览与退出恢复、保存、重新打开、图片及视频壁纸。
- [ ] 检查调优的单模型/供应商/全部模型应用范围与 Agent 预设压缩操作。
- [ ] 检查 Skills 基本操作、焦点与 Escape、浅深主题、窄宽窗口、热重载后监听与资源清理。
- [ ] 如验收需要生成新产物，先取得明确构建授权，再验证最终 bundle 与上述交互。

01–03 的结构迁移及自动回归已完成；04 的自动验收与文档已交付，真实宿主验收待人工完成。不执行构建、提交或推送。
