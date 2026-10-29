# 个性化中心按功能组织源码方案

状态：已定稿。用户已确认两轮设计决策及最终方案，设计讨论完成；尚未开始源码迁移。

## 背景与现状

插件提供外观、上下文与压缩、技能管理三个功能页面。
当前外观与上下文与压缩按浏览器、宿主和纯逻辑分布在 `src/client/`、`src/host/`、`src/core/`；
技能管理按功能集中在 `src/skills/`，其内部再划分浏览器和服务端职责。

前一轮重构保留稳定模块，在 Skills 内部拆分职责并转换界面为 TSX。
这解释了当前结构，但三个功能的顶层组织方式仍不一致。

本次讨论提出按功能组织源码的后续方案。
它与 [ADR-0001](adr/0001-behavior-preserving-modularization.md) 中“稳定模块保持原位”的范围约定不同：
用户已确认新一轮允许移动外观与上下文与压缩的稳定模块，同时保留其实现。
该后续范围决策记录在 [ADR-0002](adr/0002-feature-oriented-organization.md)。
原 [重构方案](refactoring-plan.md) 和 [验证记录](refactoring-validation.md) 继续描述前一轮工作，
不把本方案写成其已完成的实施结果。

## 已知约束

- 保持三个功能的功能、样式、导航、配置、接口和生命周期行为。
- 手写源码、样式、测试文件按物理行统计，每个文件不超过 800 行。
- 保持职责单一，避免空壳转发、无意义聚合和机械碎片化。
- 浏览器运行时不能依赖 Node 实现；SDK 类型来自正式 npm 包。
- 不修改 DSH 宿主源码。
- 验证采用非构建型检查和必要测试；构建须获得明确授权。
- 不自动提交或推送；以前的提交、合并授权不视为本轮授权。
- 保留工作区内用户已有的 `AGENTS.md` 和 `docs/agents/` 改动。

## 目标组织方式

用户已确认三个功能目录、内部层级、入口保留及共享内容整体迁移策略。

```text
src/
  appearance/
    client/           # 页面、控制器、壁纸存储与素材请求
    server/library.ts # 壁纸库接口
    color.ts
    skins.ts
    sample.ts
    tone.ts
    media.ts
  tuning/
    client/           # 页面、请求与专用 Select
    server/tuning.ts  # 调优接口
    tuning.ts         # 模型窗口与压缩参数纯逻辑
  skills/             # 整体保留既有内部结构
  shared/
    config.ts         # 插件总开关及 Skills 开关
    browser-env.ts    # 浏览器宿主适配类型及 slot 声明
    host-env.ts       # Node 宿主适配类型
    request.ts        # 两功能共用的请求标记与回环判断
    styles.ts         # 外观与调优现有整份样式及注入函数
  client/index.ts     # 保留真实浏览器装配入口
  index.ts            # 保留真实宿主装配入口
```

原 `src/core/`、`src/host/` 在文件迁走后移除；`src/client/` 只保留装配入口。
功能目录不新增 `index.ts` 聚合导出，不为纯逻辑额外加 `core/` 层。
`tuning/tuning.ts` 保留文件及声明名称，避免在移动时另做命名清理。

目录是源码归属，页面是用户导航入口，子插件是运行时注册和生命周期边界。
三者不要求数量相同，目录迁移不应自动引出新的子插件或运行时拆分。
这些属于设计约定，不将一般技术概念加入领域词汇表。

## 已核对的归属事实

| 功能或边界 | 当前文件与注意点 |
| --- | --- |
| 外观界面 | `client/AppearancePage.tsx`、`LibraryPicker.tsx`、`controller.ts`、`wallpaper.ts`、`library.ts`。 |
| 外观逻辑与接口 | `core/color.ts`、`skins.ts`、`sample.ts`、`tone.ts`、媒体规则，以及 `host/library.ts`。 |
| 上下文与压缩 | `client/TuningPanel.tsx`、`client/tuning.ts`、`client/Select.tsx`、`core/tuning.ts`、`host/tuning.ts`。Select 当前只有此功能使用。 |
| 技能管理 | 已在 `skills/` 内组织，未发现运行时依赖外观或上下文与压缩实现。 |
| 插件配置 | `core/config.ts` 定义全插件 enabled/skills 开关，不属于外观。 |
| 混合样式 | `client/styles.ts` 同时包含公共页壳、外观和调优规则，以单次注入工作。已确认整体保留，避免改变顺序。 |
| 宿主适配 | `client/dsh-env.ts` 与 `host/env.ts` 含公共适配及功能专属类型，已确认整文件迁移，避免拆出大量短类型文件。 |
| 共享请求约定 | `core/media.ts` 的 `MARKER_HEADER` 与 `isLoopbackAddress` 同时供外观和调优使用，其余主体是媒体逻辑。迁移时需避免调优反向依赖外观。 |

`tsdown.config.ts` 指定 `src/index.ts` 与 `src/client/index.ts` 为两个入口；
包类型入口包含 `lib/types/client/index.d.ts`，保留入口可避免扩大产物路径变动。
`tsconfig*.json` 递归包含源码，普通功能文件移动无需改 include。

`package.json` 通过 `./src/*` 暴露源码深路径；虽为 private 包，也不能把路径兼容问题视为不存在。
当前测试和中英文 README 引用了原目录，实施时须同步更新引用与目录说明。

本次只读盘点：Skills 之外有 22 个源码文件，全部小于 800 物理行，
最大为 `client/TuningPanel.tsx` 的 606 行。因此本轮以完整模块搬迁为主，不再拆稳定实现。
两个待提取声明不依赖 media 的其他声明，均不使用 DOM 或 Node API。

已排查可访问同级目录 `dsh-client-ui-skins`、`dsh-purge`、`dsh-skills-manager`、
`skills`、`.install-main`、`~`，未发现指向当前插件旧源码路径的深导入。
排查排除 node_modules、lib、.git 和锁文件；`.install-main` 的引用指向它自己的旧源码副本。
这个结果只覆盖当前本地可访问目录，不代表所有仓外消费者已被证明不存在。

## 决策树与访谈进度

第一轮已确认（用户答复“都同意”）：

1. 顶层采用 `appearance/`、`tuning/`、`skills/`，技术职责退到功能内部。
2. 只调整文件归属、引用、相关测试路径和文档；功能、样式、接口及生命周期保持不变。
   Skills 已完成的内部拆分保持稳定，包括子插件隔离与唯一写入队列。

第二轮已确认（用户答复“采用推荐”）：

- 保留 `src/index.ts` 与 `src/client/index.ts` 两个真实装配入口，构建及包入口路径不变。
- 外观、调优内部采用 `client/`、`server/`，功能纯逻辑直接置于功能根目录；不额外加 `core/` 层。Skills 不强制统一内部命名。
- 共享样式及宿主适配整文件迁入共享边界；只提取 `media.ts` 中确实跨功能的请求标记与回环判断，其他请求和守卫实现不统一。

继续沿用前一轮已确认的内部路径策略：允许移动内部源码路径并同步仓内引用，不新增空壳兼容文件。
实施前核对可访问消费者；若发现仓外消费者依赖旧源码路径，先报告实际影响，再决定是否扩大兼容范围。
`./src/*` 通配导出保持原配置，内部路径迁移不等于承诺旧源码子路径继续存在。

当前没有未决的架构分支；以下为已确认边界下的具体迁移方式、批次与验收要求。
最终共同理解已确认（用户答复“可以”），本次生成方案的任务完成。
源码迁移作为后续实施工作，当前未开始。

核对代码可以回答的事实由代码探索获得，不要求用户代查。
每轮确认均已记录；后续实施按本文件的范围、阶段和验收要求推进。

## 完整文件迁移表

下表路径均相对 `src/`；整文件迁移仅调整路径引用，不修改实现或导出名称。

| 原路径 | 目标路径 | 处理 |
| --- | --- | --- |
| `index.ts` | 不变 | 更新被迁模块的 import。 |
| `client/index.ts` | 不变 | 更新 import，保留装配内容与执行顺序。 |
| `client/AppearancePage.tsx` | `appearance/client/AppearancePage.tsx` | 整文件迁移。 |
| `client/LibraryPicker.tsx` | `appearance/client/LibraryPicker.tsx` | 整文件迁移。 |
| `client/controller.ts` | `appearance/client/controller.ts` | 整文件迁移。 |
| `client/wallpaper.ts` | `appearance/client/wallpaper.ts` | 整文件迁移。 |
| `client/library.ts` | `appearance/client/library.ts` | 媒体类型引用功能根目录，请求标记改引共享模块。 |
| `core/color.ts` | `appearance/color.ts` | 整文件迁移。 |
| `core/skins.ts` | `appearance/skins.ts` | 整文件迁移。 |
| `core/sample.ts` | `appearance/sample.ts` | 整文件迁移。 |
| `core/tone.ts` | `appearance/tone.ts` | 整文件迁移。 |
| `core/media.ts` | `appearance/media.ts` | 仅移出下表所列的两个共享声明，其余实现保留。 |
| `host/library.ts` | `appearance/server/library.ts` | 媒体规则引功能根目录，共享请求约定和宿主类型引 shared。 |
| `client/TuningPanel.tsx` | `tuning/client/TuningPanel.tsx` | 保留 TuningPage/TuningPanel 两组件及嵌套。 |
| `client/tuning.ts` | `tuning/client/tuning.ts` | 整文件迁移，共享请求标记改引 shared。 |
| `client/Select.tsx` | `tuning/client/Select.tsx` | 专供调优使用，不提为公共控件。 |
| `core/tuning.ts` | `tuning/tuning.ts` | 整文件迁移。 |
| `host/tuning.ts` | `tuning/server/tuning.ts` | 改引本功能纯逻辑、共享请求约定与共享宿主类型。 |
| `core/config.ts` | `shared/config.ts` | 插件级配置整文件迁移。 |
| `client/dsh-env.ts` | `shared/browser-env.ts` | 整体保留类型、slot 模块扩充和正式 SDK 引用。 |
| `host/env.ts` | `shared/host-env.ts` | 整体保留，包括调优服务适配类型。 |
| `client/styles.ts` | `shared/styles.ts` | CSS、拼接顺序与 ensureStyle 实现完整保留。 |
| `core/media.ts` 中两个声明 | `shared/request.ts` | 将 MARKER_HEADER、isLoopbackAddress 原定义移入；消费者直接改引此处。 |
| `skills/**` | 不变 | 不迁移、重命名或重新划分内部文件。 |

不在原路径留下转发模块，也不让 `appearance/media.ts` 为共享声明新增转发导出。
`shared/request.ts` 虽然较短，但拥有真实的跨功能请求约定职责；不以凑行数合并进媒体或配置模块。
共享宿主适配允许含功能专属服务形状，它的边界是与 DSH 对接，不是业务实现的汇集地。

## 依赖方向与装配

```text
src/index.ts -> appearance/server、tuning/server、skills/index、shared/config
src/client/index.ts -> appearance/client、tuning/client、skills/client、shared/styles
appearance/client -> appearance 纯逻辑、shared/browser-env、shared/request
appearance/server -> appearance 纯逻辑、shared/host-env、shared/request
tuning/client -> tuning 纯逻辑、shared/browser-env、shared/request
tuning/server -> tuning 纯逻辑、shared/host-env、shared/request
shared -> 平台或正式 SDK；不依赖任何功能目录或装配入口
skills -> 保持现有内部依赖方向
```

以上是允许方向，不要求增加未使用的 import。类型适配使用 type-only import；
`shared/host-env.ts` 的 Node 类型不得变成浏览器运行时依赖。
浏览器不可达任何 server 实现，appearance 与 tuning 不互相导入。
不要求 Skills 为统一形式复用 shared/request 或公共 CSS，不借此统一原本不同的守卫与样式。

两个装配入口继续承载原职责，不生成新的外观或调优子插件。
浏览器入口保留导航观察器、样式注入、控制器创建、插槽注册及清理的原顺序；
宿主入口保留配置 schema、按请求取服务、路由注册及 Skills 子插件挂载。

## 冻结的运行合同

- 保留插件名、注入服务、开关默认值及 Skills 缺失服务时的隔离行为。
- 保留三个导航项的标识、名称、图标、顺序、section 组件身份和挂载边界。
- 保留壁纸图片/视频存储、localStorage/IndexedDB 键、预览、保存与恢复时机。
- 保留 CSS 最终字符串、DOM、属性、受控输入、事件与计时器、主题订阅和清理。
- 保留 `/custom-center/list`、`/upload`、`/file`、`/tuning` 的完整原路径、方法、头、状态与返回字段。
- 保留请求守卫顺序、Range、大小限制、目录和链接校验，以及 DSH_HOME 求值时机。
- 保留模型窗口与压缩的校验、批量写入顺序、中途失败可能部分生效及当前错误显示行为。
- Skills 的 Provider、工具、唯一队列、HTTP、状态格式、文案、CSS 和生命周期保持原实现。
- 两个共享请求声明只搬运原逻辑；不改变地址判定范围、marker 值或引入新的通用请求层。

上轮记录的来源校验差异、保存提示和批量写入等既有问题继续单独处理，不在迁移中修复。
本轮不新增运行时依赖、状态库、缓存、协议或持久化格式，不做全仓格式化。

## 分阶段实施

| 阶段 | 工作 | 完成条件 |
| --- | --- | --- |
| 0：基线 | 保存当前 Git 状态、逐文件行数、现有测试结果；记录 CSS、路由、入口和运行声明基线；核对可访问消费者。 | noEmit 类型检查及现有测试基线明确，用户已有改动可区分。 |
| 1：共享边界 | 移动 config、styles、两份 env；提取两个请求声明；更新入口、尚在原位的功能和测试引用。 | 旧共享路径及原 media 的共享导出无消费者；样式字节不变，无依赖环。 |
| 2：外观 | 移动外观 client、server 与纯逻辑；同步引用和相关测试。 | 外观归属完整，调优不依赖 appearance，阶段检查通过。 |
| 3：调优 | 移动调优 client、server 与纯逻辑；保留专用 Select 和现有组件边界。 | 两入口正常解析，原 core/host 文件全部有唯一去向，阶段检查通过。 |
| 4：收尾 | 同步双语 README；按当前内容最小更新 AGENTS 的 Layout；完成全量行数和依赖检查，记录本轮结果。 | 所有自动验收及实际宿主验收分别记录，没有未解释差异。 |

阶段只表示可审阅的工作批次，不表示自动创建提交。
每阶段记录其修改路径和结果，失败先修复或撤回本次批次，不覆盖用户其他工作。
若更新 AGENTS，实施时先读取写作技能及最新文件，只改目录说明，保留用户新增规则。
无需因目录移动修改 tsdown、tsconfig、package.json、锁文件、许可证或已有产物。

## 测试与非构建验收

实施前重新读取脚本，确认 `pnpm typecheck` 为 `tsc -p tsconfig.json --noEmit`，
`pnpm test` 为不触发构建的 Vitest 测试。测试使用临时目录，不写用户真实壁纸或技能目录。

| 时机 | 检查 |
| --- | --- |
| 阶段 0 | `pnpm typecheck`、`pnpm test`，记录当次基线，不沿用前一轮结果。 |
| 阶段 1 | 类型检查；config、media、library、host-tuning、tuning 相关测试；检查共享声明依赖和 CSS 原值。 |
| 阶段 2 | 类型检查；color、skins、sample、media、library 相关测试；核对外观组件及控制器原实现。 |
| 阶段 3 | 类型检查；tuning、host-tuning 相关测试；核对页面、请求与接口原实现。 |
| 阶段 4 | `pnpm typecheck`、完整 `pnpm test`、差异空白检查、逐文件物理行数、路径残留及依赖图检查。 |

既有测试文件留在 tests 原位，只调整它们的源码 import；不按迁移后的目录重排测试。
`media.spec.ts` 的媒体断言和共享请求断言可保持同一测试文件，分别导入新所属模块。
不为每次移动新增镜像测试；如发现既有测试缺少关键行为覆盖，再补必要场景。
当前静态盘点为 14 个测试文件、132 个 it 声明，不是本次执行通过的结果。
针对性测试使用 `pnpm exec vitest run tests/<name>.spec.ts ...`，按阶段表列出完整文件参数。
其中 library 测试会监听本地 HTTP 端口；环境限制导致无法监听时，单独报告或使用授权的运行方式，
不能将环境失败写成测试通过，也不为绕过限制改变产品接口行为。

全量结构验收要求：

- `src/`、`tests/` 内全部手写源码、声明和样式及根 TS 配置逐个统计物理行数，任何文件 >800 失败。
- 报告总文件数、最大行数和超限文件；不以压缩行、删除空行等方式过关。
- 移动文件的运行声明与基线一致，仅允许 import 路径及两个声明所属模块变化。
- 对 shared 样式的最终 CSS 字符串记录摘要并与阶段 0 对比，注入条件和执行顺序同时核对。
- 检查 Skills 既有 CSS、词典及行为测试继续通过，Skills 源码没有无关改动。
- 解析运行时 import/export 图，确认无环、shared 不依赖功能、跨功能无反向依赖、浏览器不达 Node/server。
- 检查源码、测试、配置和当前 README 的旧路径残留；历史方案与验证记录中的旧路径保留。
- 两个入口、包导出配置和预期产物路径不变；非构建检查不宣称已经验证最终 bundle。

真实宿主验收核对三个页面导航、外观预览/保存/恢复、图片/视频壁纸、调优范围与预设操作、
Skills 基本操作、键盘焦点、浅深主题、窄宽窗口及热重载清理。
使用相同数据、主题、窗口和宿主版本对照；若运行新源码需要构建，先获得明确构建授权。
缺少真实宿主或对照基线时记录未完成，不据自动检查宣称视觉及运行时完全一致。

## 文档与最终交付

README.md 与 README.zh.md 成对更新目录及开发路径说明，不改变产品功能描述。
旧 ADR-0001 和上一轮验证记录保留历史；新建 `docs/feature-organization-validation.md` 记录本轮结果。
当前 AGENTS 的目录说明与迁移后的结构有差异，实施时作最小同步，不覆盖用户未提交内容。

已新增 ADR-0002 记录顶层组织与后续确认的入口、内部层级和共享边界。
当前没有新领域术语，`GLOSSARY.md` 保持不变，不将目录层级等技术概念加入业务词汇表。

实施完成后报告实际移动及提取的文件、共享边界、行数统计、类型和测试结果、依赖检查、
真实宿主验收及未完成项，不复用旧轮次测试数量或行数作为本轮证据。
本方案文档阶段只检查路径、链接、映射覆盖、行数和差异，不运行源码测试或构建。
