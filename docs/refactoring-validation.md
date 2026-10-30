# 重构验证记录

> 历史记录：以下路径和结论对应当时阶段。最新文件职责见[当前架构](architecture.md)，后续拆分见[职责重构验证记录](responsibility-refactoring-validation.md)。

验证日期：2026-10-29。代码迁移已完成，自动检查通过；真实宿主界面验收未完成。
本次只调整模块归属和 Skills 的 TSX 表达，未执行构建、提交或推送。

## 改动范围

- 原 3,958 行 Skills core 按来源、文件操作、扫描、工作区、策略、分类、导入、同步和回收站等能力拆分，保留查询/Provider 编排与原公开导出。
- 路由从宿主入口提取；HTTP 与工具继续共用入口持有的唯一 mutation queue，查询通过参数传入 router。
- 原 4,649 行 Skills client 拆为 TSX 展示、状态 hook、API、文案、上传、词典和样式。section/view 的 session key、状态所有权和模块级选择器工厂保持原边界。
- 合并 api-base、plugin-ui、source-select-model、destination-types 和 TuningPage；保留稳定模块、旧行为及移植许可。
- 浏览器数据合同移入纯 types.ts，新增 5 个按行为组织的测试文件。

## 自动验证结果

| 检查 | 结果与范围 |
| --- | --- |
| `pnpm typecheck` | 通过；实际脚本为 `tsc -p tsconfig.json --noEmit`。 |
| `pnpm test` | 14 个文件、132 个测试全部通过，含新增 30 个测试。原 library 测试需要临时监听 localhost，完整测试已在获准的沙箱外运行。 |
| 物理行数 | src/tests 共 81 个 TS、TSX、声明及 CSS 文件，加上根目录 2 个 TS 配置文件共 83 个；最大 634 行，超过 800 行为 0。 |
| 运行时依赖图 | 内存转译去除 type-only 后的静态 import/export 图无环；server 内部无 core/index 值依赖。 |
| 浏览器边界 | 从两个浏览器入口可达 39 个模块，无 Node、server 或 Skills core 值依赖。 |
| 精确共享合同 | 快照、技能详情、项目技能、创建结果、工作区行与实际服务端返回类型双向可赋值；错误分支按必填 error 字段剔除，保留原推导类型。检查文件仅存在于编译器内存。 |
| 服务端基线差分 | 原 core/index 的 183 个运行时声明均有唯一归属且 AST 一致；router handler 与原 inline handler、host apply 除 handler 提取外的函数体 AST 一致。 |
| 界面基线差分 | 34 个场景的归一化 React 树一致，包含元素、props、children、key、class/style、SVG 和 data 资源；事件函数归一为占位符，交互时序另由行为测试覆盖。 |
| 静态资源 | 最终 CSS 和中英 DICT 与迁移前基线哈希一致，已固化在 skills-client-data 测试。 |
| 内部路径与补丁 | 已删除文件无旧路径引用；`git diff --check` 通过。 |

基线 AST、依赖图、合同和 React 树核对使用本次迁移保留的原始源码及临时检查脚本，通过 TypeScript 内存转译/分析执行，没有输出构建产物。它们属于本次验收证据；常驻回归检查为仓内类型检查和 Vitest 测试。

CSS SHA256：

```text
61cd43171ab7045da90dacc352e13173bc463018e61c76408a592dd7939d0bea
```

最终中英 DICT 的 JSON SHA256：

```text
c8e043712b82d1792cff49b98ef520295500795d1aa6b7291a70abd473a2a172
```

## 新增行为回归覆盖

| 测试文件 | 测试数 | 主要行为 |
| --- | ---: | --- |
| skills-client-data | 7 | 代理基址、响应及错误、普通/session 请求、上传字节、词典/CSS、摘要文案。 |
| skills-client-lifecycle | 6 | 工作区竞态、路径缓存、epoch、卸载、session key、post 锁、scope 结果和分类串行部分失败。 |
| skills-files | 6 | 创建、预检/跳过/覆盖、来源消失、文件/目录/ZIP 上传、遍历/链接拒绝、回收/恢复冲突。 |
| skills-state | 5 | 旧状态迁移、损坏 fail-closed、分类排序/删除清理、同名项目隔离、Provider locator 复验。 |
| skills-routes | 6 | 守卫顺序、动态 trustedHosts、HEAD 长度、POST 读入队、错误/通知、body 上限、真实工具/HTTP 共用队列及 disposer。 |

原有同步与其他页面测试保留，没有用新测试替换既有测试意图。
34 个树对比场景覆盖各 scope 空态、原生/外部/回收站条目、展开来源与分类、筛选、加载/错误/警告、有内容详情、创建 busy、三类选中上传、项目列表/详情错误及有内容项目、分类选择、同步 overwrite/busy 和全部弹窗。

## 验收限制

没有可用的同条件真实宿主前后对照，本次未做宿主截图、计算样式、真实键盘焦点、主题/语言/窗口组合及热重载验收。归一化树一致及 CSS 字节一致不能单独证明真实宿主中的全部视觉和交互一致。
树比较同时观察到原实现已有的列表缺 key 警告，按纯重构要求保留。现有路由来源校验差异、保存提示和批量部分生效等行为也未夹带修复。

## 全量物理行数

统计包含导入、注释和空行，不包含依赖、锁文件和生成产物；原规划预算与实测差异见 refactoring-plan.md 第 10 节。

| 文件 | 行数 |
| --- | ---: |
| `src/client/AppearancePage.tsx` | 259 |
| `src/client/LibraryPicker.tsx` | 222 |
| `src/client/Select.tsx` | 197 |
| `src/client/TuningPanel.tsx` | 606 |
| `src/client/controller.ts` | 470 |
| `src/client/dsh-env.ts` | 86 |
| `src/client/index.ts` | 128 |
| `src/client/library.ts` | 108 |
| `src/client/styles.ts` | 163 |
| `src/client/tuning.ts` | 93 |
| `src/client/wallpaper.ts` | 366 |
| `src/core/color.ts` | 259 |
| `src/core/config.ts` | 37 |
| `src/core/media.ts` | 172 |
| `src/core/sample.ts` | 139 |
| `src/core/skins.ts` | 366 |
| `src/core/tone.ts` | 103 |
| `src/core/tuning.ts` | 564 |
| `src/host/env.ts` | 106 |
| `src/host/library.ts` | 282 |
| `src/host/tuning.ts` | 546 |
| `src/index.ts` | 86 |
| `src/skills/client/api-client.ts` | 72 |
| `src/skills/client/category-dialogs.tsx` | 288 |
| `src/skills/client/controls.tsx` | 247 |
| `src/skills/client/editor-dialogs.tsx` | 336 |
| `src/skills/client/icons.tsx` | 296 |
| `src/skills/client/locales/en.ts` | 280 |
| `src/skills/client/locales/zh.ts` | 280 |
| `src/skills/client/manager-page.tsx` | 301 |
| `src/skills/client/messages.ts` | 177 |
| `src/skills/client/scope-panels.tsx` | 424 |
| `src/skills/client/selectors.ts` | 115 |
| `src/skills/client/skill-dialogs.tsx` | 248 |
| `src/skills/client/skill-rows.tsx` | 400 |
| `src/skills/client/source-tree.tsx` | 596 |
| `src/skills/client/styles.ts` | 175 |
| `src/skills/client/uploads.ts` | 184 |
| `src/skills/client/useSkillManager.ts` | 634 |
| `src/skills/client/useWorkspaceCatalog.ts` | 174 |
| `src/skills/client-types.ts` | 170 |
| `src/skills/client.ts` | 75 |
| `src/skills/core.ts` | 339 |
| `src/skills/destination-picker.ts` | 162 |
| `src/skills/host-types.ts` | 127 |
| `src/skills/index.ts` | 273 |
| `src/skills/primitives.d.ts` | 92 |
| `src/skills/readonly-discovery.ts` | 153 |
| `src/skills/server/categories.ts` | 188 |
| `src/skills/server/entry-access.ts` | 298 |
| `src/skills/server/file-operations.ts` | 380 |
| `src/skills/server/policy-store.ts` | 281 |
| `src/skills/server/policy.ts` | 238 |
| `src/skills/server/root-access.ts` | 171 |
| `src/skills/server/router.ts` | 405 |
| `src/skills/server/skill-document.ts` | 200 |
| `src/skills/server/skill-import.ts` | 432 |
| `src/skills/server/skill-scan.ts` | 165 |
| `src/skills/server/skill-sync.ts` | 216 |
| `src/skills/server/source-roots.ts` | 332 |
| `src/skills/server/trash.ts` | 334 |
| `src/skills/server/upload-import.ts` | 255 |
| `src/skills/server/workspaces.ts` | 241 |
| `src/skills/settings-nav-icon.ts` | 115 |
| `src/skills/sidebar-entry.ts` | 283 |
| `src/skills/source-select.ts` | 130 |
| `src/skills/types.ts` | 325 |
| `tests/color.spec.ts` | 91 |
| `tests/config.spec.ts` | 21 |
| `tests/host-tuning.spec.ts` | 291 |
| `tests/library.spec.ts` | 165 |
| `tests/media.spec.ts` | 133 |
| `tests/sample.spec.ts` | 46 |
| `tests/skills-client-data.spec.ts` | 94 |
| `tests/skills-client-lifecycle.spec.ts` | 195 |
| `tests/skills-files.spec.ts` | 127 |
| `tests/skills-routes.spec.ts` | 155 |
| `tests/skills-state.spec.ts` | 118 |
| `tests/skills-sync.spec.ts` | 155 |
| `tests/skins.spec.ts` | 71 |
| `tests/tuning.spec.ts` | 317 |
| `tsdown.config.ts` | 73 |
| `vitest.config.ts` | 8 |
