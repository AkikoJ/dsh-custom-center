# 职责重构验证记录

日期：2026-10-30。代码拆分及自动验证已完成，真实宿主视觉/交互和最终 bundle 未验证。
当前逐文件职责与开发定位见[架构文档](architecture.md)。

## 范围

用户授权仅重构代码，不能更改功能和样式。本轮在既有按功能目录组织的基础上，
进一步拆开状态编排、持久化、宿主适配、HTTP 协议、业务操作、领域类型和界面展示。

- 外观：controller 保留状态与生命周期，持久化、DOM/主题/视频资源、媒体解码各归其模块。
- 调优：拆开合同、校验/预算、配置变换、目标选择、宿主模型查询、快照、保存和路由；表单与区域展示分离。
- 技能 Host：入口只装配；查询/Provider、命令队列、工具、宿主适配、HTTP 策略/作用域分别归属。
- 技能 Browser：页面直接组合独立目录、命令、筛选、创建、导入、详情、同步与分类流程；弹窗按用例拆分。
- 类型：领域、跨端合同、页面/控件、浏览器/宿主/服务端类型分开。
- 样式：基础、外观、调优分开归属，最终注入仍按原顺序拼接；Skills 样式保留原定义。

保留两个包入口、Skills 子插件、组件身份和 session 重挂载边界。
未修改依赖、锁文件、构建配置、包入口配置、profile 或宿主源码；用户已有 `.gitignore`、`AGENTS.md` 修改保留。
没有执行构建、提交或推送。

## 主要迁移映射

| 原文件/职责 | 当前归属 |
| --- | --- |
| `appearance/client/controller.ts` 中的配置、存储、DOM 副作用 | `model.ts`、`storage.ts`、`host-appearance.ts`；controller 继续持有状态与订阅。 |
| `appearance/client/wallpaper.ts` 中的存储能力 | `storage.ts`；wallpaper 保留解码/采样。 |
| `tuning/tuning.ts` | `contracts.ts`、`rules.ts`、`config-mapping.ts`、`targets.ts`。 |
| `tuning/server/tuning.ts` | `host-env.ts`、`model-access.ts`、`snapshot.ts`、`save.ts`、`routes.ts`。 |
| `tuning/client/tuning.ts` | `api-client.ts`。 |
| `tuning/client/TuningPanel.tsx` 的表单与区域 | `useTuningForm.ts`、`fields.tsx`、`ModelWindowPanel.tsx`、`CompactionPanel.tsx`；原组件继续负责装配。 |
| `skills/types.ts`、`skills/client-types.ts` | `model.ts`、`contracts.ts`、`browser-host.ts`、`server/types.ts`、`client/manager-types.ts`、`client/widget-types.ts`；翻译类型归 messages。 |
| `skills/core.ts` | `server/provider.ts`、`queries.ts`、`skill-create.ts`、`sync-records.ts`、`content-digest.ts`、`content-limits.ts`、`audit-log.ts`。 |
| `skills/index.ts` 中的宿主/工具/队列 | `server/host-integration.ts`、`create-skill-tool.ts`、`commands.ts`。 |
| `skills/server/router.ts` 中的协议策略、作用域与任务 | `http-policy.ts`、`request-scope.ts`、`commands.ts`；router 保留协议分发。 |
| `skills/client/useSkillManager.ts` | `useSkillCatalog.ts`、`useSkillCommands.ts`、`useSkillFilters.ts`、`useSkillCreate.ts`、`useSkillImport.ts`、`useSkillDetail.ts`、`useSkillSync.ts`、`useSkillCategories.ts`。 |
| `skills/client/editor-dialogs.tsx`、`skill-dialogs.tsx` | `create-dialog.tsx`、`import-dialog.tsx`、`detail-dialog.tsx`、`sync-dialog.tsx`、`delete-dialogs.tsx`。 |
| 分类树/弹窗中的流程回调 | `client/useSkillCategories.ts`；展示模块调用原语义回调。 |
| `client/index.ts` 中的导航观察器 | `client/settings-nav.ts`。 |
| `shared/styles.ts` 的功能样式与注入 | `appearance/client/styles.ts`、`tuning/client/styles.ts`、`client/styles.ts`；shared 仅保留跨功能基础样式。 |

旧内部文件删除后，源码、测试和 README 中的引用已同步；历史方案与 ADR 保留旧路径的历史含义。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过；脚本为 `tsc -p tsconfig.json --noEmit`，不生成构建产物。 |
| `pnpm test` 最终全量复跑 | 16 文件 / 145 测试通过，无跳过。 |
| 架构约束 | 相对导入解析、功能/shared 归属、实现不反向依赖入口、运行时无环、浏览器无 server/Node 运行时依赖通过。 |
| 物理行数 | src/tests 共 127 个手写 TS/TSX/声明文件，其中 src 111 个、测试 16 个；最大 source-tree.tsx 为 545 行，超过 800 行为 0。 |
| 旧内部路径 | 源码、测试、中英文 README 无已删除模块引用。 |
| 差异空白 | `git diff --check` 通过；新增未跟踪文件另行扫描尾随空白与文件末尾空行。 |
| 保护范围 | Git 差异中无依赖、锁文件、构建配置、profile 或已跟踪 lib 产物变更。 |

复查中曾出现一次 `library.spec.ts` 的既有测试偶发失败：无效上传返回 415 后，
立即读取目录仍看到了 `.upload-*.part`。该文件本轮只调整 type-only 导入，运行实现未变；
未修改的原测试单独重跑 13 项通过，随后全量 145 项通过。
本轮不夹带修复，也不据重跑通过认定该偶发现象已消除。

## 新增行为覆盖

在原有 14 文件 / 132 测试基础上增加 13 项，原业务测试保留：

| 文件 | 新增覆盖 |
| --- | --- |
| `tests/architecture.spec.ts`（4 项） | 文件行数、依赖归属、无环与浏览器运行时边界。 |
| `tests/appearance-controller.spec.ts`（7 项） | 草稿/预览/主题恢复、pending 保存的状态顺序、保存与重置的不同失败语义、清理与定时器、视频异步恢复及过期结果忽略。 |
| `tests/skills-routes.spec.ts`（2 项） | 错误前缀路径不匹配创建操作但仍按 POST 入队；工具失败后共用队列继续执行 HTTP。 |

原有 Skills 生命周期测试改为组合实际拆出的 hook，继续覆盖 session 状态边界、锁、刷新与分类部分失败行为。
既有调优、技能文件/状态/同步、HTTP 合同、样式与词典测试同步到新归属后仍通过。

## 与重构前基线的静态核对

基线为本轮实施前保存的完整 src/tests 副本。
检查脚本使用 TypeScript AST/词法分析并在内存处理，没有生成 bundle 或声明产物。
临时基线和脚本是本轮一次性核对工具，不作为仓库中可长期依赖的测试设施。

- 外观/调优最终 CSS_TEXT：前后逐字符一致，均为 15,240 字符，级联顺序不变。
- Skills CSS 与中英文词典：既有内容摘要测试通过，顶层样式声明核对一致。
- JSX：前后各 374 个元素，其中 371 个在归一化后完全匹配；其余 3 处人工核对为分类回调提取和调优普通渲染函数调用，原 section/控件结构保留。
- JSX 比较包含标签、属性、class/style、key/ref、事件表达式和直接子节点；仅消除既定流程对象取值、类型断言及括号等表达差异。
- 原 91 个嵌套具名函数/对象方法中，84 个函数体归一化完全一致；其余 7 个涉及持久化/DOM 提取、分类回调提取、确认回调改名及工具委托，已逐项核对。
- 原路由 22 个操作与新 commands 的任务、作用域、dryRun、成功通知逐项核对，保留队列和异常语义。

重点保留的行为包括：

- 外观持久化前状态更新、save 吞异常/reset 传播异常、document guard、视频恢复失效机制。
- 调优模型/预设保存顺序与部分成功、宿主能力校验先于 body 读取。
- 所有非 browse 的 Skills POST 共用工具队列，包含读取/未知操作；HTTP 和工具的通知异常处理仍有原有差别。
- Skills 的 scope 结果归属、session key、共享 inflight、普通 post 刷新后解锁、分类首错停止且先解锁后刷新。
- 创建打开保留输入/成功清空、导入打开重置、原生 picker 焦点/超时与复制反馈时间。

## 验证边界

静态资源/结构一致及自动回归能够支持本次纯重构的判断，但不等价于真实宿主视觉实测。
未运行构建，因此没有验证最终 bundle、真实宿主页面、计算样式、键盘焦点、主题/窗口组合及 HMR。
后续如需此类验收，应先获得明确构建授权，再在同版本宿主与相同数据条件下对照。
