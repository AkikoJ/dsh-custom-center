# dsh-custom-center 代码拆分与 TSX 重构方案

状态：阶段 0–7 的代码迁移已实施，自动验收通过；真实宿主界面验收尚未完成。实测结果见 [重构验证记录](refactoring-validation.md)。

## 1. 已确认的约束与设计决策

| 决策 | 约定 |
| --- | --- |
| 工作范围 | 只重构代码组织和表达方式，功能、样式和实际运行行为保持不变。 |
| 文件上限 | 本插件全部手写源码、样式和测试按物理行统计，任何文件不得超过 800 行。 |
| 文件粒度 | 新拆业务模块目标 100–650 行；不足 100 行优先并回职责相近模块。禁止空壳转发、机械按行切块、压缩排版或注释空行凑数。 |
| 前端语法 | 被拆分的 Skills 界面组件同时转换为 TSX；不更换 React、状态管理或请求技术。 |
| 拆分深度 | 保留职责清晰且符合上限的稳定模块，不统一重命名整个仓库。 |
| 内部路径 | 允许调整内部源码路径、合并短文件，仓内引用同步更新，不为旧内部路径新增薄兼容层。 |
| 运行兼容 | 保留宿主/浏览器入口、插件标识、服务注入、HTTP、工具、数据格式及生命周期语义。 |
| 执行限制 | 不自动构建、不自动提交、不自动推送；按用户本次实施授权执行。 |

100 行是新业务文件的规划目标，不是要求给入口、SDK 声明、稳定配置和已有测试补行。
800 行是硬限制，包含导入、类型、注释和空行；依赖、锁文件及生成产物不计。
650 行是预警线，超过时先审查职责；超过 800 行必须重新划分真实职责。
第 3 节保留原规划预算和迁移前行数；第 10 节及验证记录列出实施后的实测值，不用预算代替验收。

## 2. 迁移前结构及本轮范围

迁移前 `src` 约 16,114 行，Skills 约 10,748 行。
主要超限文件为 `src/skills/client.ts`（4,649 行）和 `src/skills/core.ts`（3,958 行）。
其他源码均低于 800 行，保留宿主、浏览器、纯逻辑、Skills 子插件的总体分层。

本轮完成四件事：

1. Skills Node 核心按业务能力拆分，宿主入口与 HTTP 分派分离。
2. Skills 主界面按状态、数据、列表、弹窗等职责拆分，并转换界面表达为 TSX。
3. 合并确定属于同一职责的现有极短文件。
4. 建立现状行为基线及行数、依赖方向、界面一致性的验收清单。

本轮保留以下现状，另行提出后续修复任务：

- Skills 与壁纸、调优路由的来源校验差异，以及旧 `/browse`、路径式 `/import` 接口。
- 外观保存时的失败吞掉方式、保存快照及界面提示的更新时机。
- 调优批量写入顺序及中途失败后可能部分生效的结果。
- Skills 快照的扫描、内容摘要及重复刷新行为。
- 当前错误文本、状态码、宽泛请求体处理方式和不同模块的 URL 解析差异。
- 两套导航观察器、已有未使用类型、既有防御分支和未触发的辅助逻辑。

以上问题不能混入本轮修复，否则无法把差异限定为结构和 TSX 表达变化。
用户本次纯重构要求优先；仓库 AGENTS 的路由规则差异单独记录，不借重构改变授权范围。

## 3. 目标目录及模块边界

新结构是在 `skills` 内部增加 `server` 和 `client` 目录，其余稳定目录不搬迁。

```text
src/
  index.ts                         # 保持宿主入口
  host/                            # 现有壁纸、调优服务，保留
  client/                          # 现有外观与调优界面，保留并合并薄页面
  core/                            # 现有纯逻辑，保留
  skills/
    index.ts                       # 宿主生命周期、Provider、工具、唯一队列
    core.ts                        # 查询/Provider 读模型编排，含实质实现
    client.ts                      # 浏览器插件装配、语言/插槽/清理
    types.ts                       # 领域、操作及精确的数据合同
    host-types.ts                  # 宿主服务适配类型
    client-types.ts                # 前端跨模块合同
    readonly-discovery.ts          # 现有只读遍历器
    destination-picker.ts          # 目标选择工厂及其专属类型
    source-select.ts               # 来源选择工厂及 Escape 行为
    sidebar-entry.ts               # 现有侧边栏入口
    settings-nav-icon.ts           # 现有导航适配
    primitives.d.ts                # SDK 声明边界
    server/                        # Node 内部实现，见下表
    client/                        # TSX 界面及浏览器逻辑，见下表
```

`skills/client.ts` 与 `skills/client/` 可以同时存在；所有引用写明确的文件路径。
不添加目录 `index.ts` 聚合导出，不增加全局 `utils.ts`、`helpers.ts` 或巨型 context。

### 3.1 服务端完整拆分表

以下原行段按本次分析时的 `src/skills/core.ts` 与 `src/skills/index.ts` 定位。
行段用于定位函数，不作为机械切割边界；每个原函数及其重载、常量、类型都须登记唯一归属。

| 目标文件 | 预算行数 | 原代码归属与单一职责 |
| --- | ---: | --- |
| `skills/core.ts` | 380–550 | 保留 `state`、`workspaceSkills`、`listProviderCandidates`、`getProviderSkill` 的查询与 Provider 读模型编排；主要来自原 3259–3397、3729–3890。保留相关导出，不退化为纯转发入口。 |
| `skills/server/source-roots.ts` | 330–420 | 原来源定义及排序、117–355 的环境目录与用户来源、558–577 的管理目录、根身份与逻辑路径辅助。只负责来源定义、稳定 key/rank 和逻辑目录。 |
| `skills/server/workspaces.ts` | 230–330 | 原 356–379、401–557、3671–3728：最近项目根、登记索引、目标解析、项目来源和折叠列表。负责宿主登记工作区到技能根的映射。 |
| `skills/server/root-access.ts` | 190–280 | 原 380–400、只读拒绝结果、701–788、822–835、1788–1824：来源安全、可写根、安装根及策略根验证。原有不同检查保持分别存在。 |
| `skills/server/file-operations.ts` | 380–540 | 原路径基础函数、1000–1086、1096–1148、2109–2122、2562–2698 中的底层部分：真实路径、链接、名称路径、原子写、重试、暂存复制和备份替换。包含文件操作诊断构造及相关限制。 |
| `skills/server/skill-document.ts` | 180–280 | 原 887–999、1087–1095、1221–1290、3147–3150：名称、frontmatter、标量、调用策略和文档解释；保持纯逻辑。 |
| `skills/server/skill-scan.ts` | 170–260 | 原 1291–1439：完整/元数据扫描、真实路径去重及重载。调用现有 `readonly-discovery.ts`，不引入缓存。 |
| `skills/server/entry-access.ts` | 280–390 | 原 578–670、1149–1220、1440–1450、3209–3258、3903–3952：浏览、定位、详情读取、系统文件夹打开。 |
| `skills/server/policy-store.ts` | 270–380 | 原 1451–1697、1743–1769：状态默认值、格式校验、迁移、分类规范化、读写及侧边栏偏好。只管理已有磁盘合同。 |
| `skills/server/policy.ts` | 220–330 | 原 1698–1742、1770–1787、1825–1927、3606–3670：启停、覆盖优先级、同名选择和回退标记。 |
| `skills/server/categories.ts` | 190–290 | 原 1928–2108：分类创建、改名、删除、归属、排序、整组启停。分类持久化规范化仍归 `policy-store`。 |
| `skills/server/trash.ts` | 340–460 | 原 2123–2444：回收站元数据、暂存发布、删除、恢复、永久删除及对应分类清理。 |
| `skills/server/skill-import.ts` | 400–540 | 原 2445–2561、2699–2911、3151–3208，以及原 `preflightCandidates`：来源分析、导入预检、冲突处理、发布和创建。创建属于同一新技能发布能力，不单独建约 60 行文件。 |
| `skills/server/upload-import.ts` | 250–360 | 原 2912–3146：上传路径、Base64、ZIP、临时来源与清理，复用现有导入流程。 |
| `skills/server/skill-sync.ts` | 230–340 | 原 3400–3605：同步记录、摘要算法、目标映射、同步状态和逐条复制。 |
| `skills/index.ts` | 280–390 | 原宿主装配：日志、会话/登记路径适配、Provider、Agent Provider、工具注册、失效通知、唯一队列和路由 effect。 |
| `skills/server/router.ts` | 400–560 | 原 index 的 73–237 及 handler：请求解析、原守卫、JSON/HEAD 响应、请求级作用域与完整分派。通过参数接收宿主能力，不反向导入 `index.ts`。 |

未单独列出的原顶层声明按下列规则归位：

- 来源数组、rank、项目 key 表达式和来源身份（含 `isDshRoot`）归 `source-roots`；底层 `file-operations` 不反向依赖来源模块。
- `readonlyError`、根重叠及写入域检查归 `root-access`，不重复归入来源定义。
- 文件和 ZIP 限制归实际执行对应检查的模块，跨模块使用原值并显式导出，禁止复制两份。
- `SourceAnalysis` 归 `skill-import`，扫描元数据类型归 `skill-scan`；`TrashMetadata` 由服务端与浏览器共同消费，实际归纯合同 `types.ts`，回收站读写仍归 `trash`。
- 跨浏览器和宿主使用的 `WorkspaceRow`、快照和详情数据合同归现有 `types.ts`。
- `ProviderCandidate` 等宿主内部推导类型可留 `core.ts`，不得成为浏览器运行时依赖。
- 旧 `core.ts` 函数按原名称导出或从所属模块重导出；文件自身保留查询编排的实质职责。
- 共享函数只保留一个实现；不为了避开依赖循环复制校验和路径代码。

### 3.2 服务端依赖规则

以下方向表示上层依赖下层，type-only 合同不产生运行时反向依赖。

```text
index -> router / core / 必要的命令模块
core -> 查询所需的各职责模块
categories -> policy / policy-store / workspaces / entry-access / skill-scan
skill-sync -> workspaces / skill-scan / root-access / trash / file-operations
upload-import -> skill-import / file-operations
skill-import -> root-access / source-roots / skill-document / file-operations
trash -> workspaces / root-access / entry-access / policy-store / file-operations
policy -> policy-store / root-access / workspaces / entry-access / skill-document
entry-access -> workspaces / skill-scan / source-roots / root-access / file-operations
workspaces -> root-access / source-roots / skill-scan / file-operations
skill-scan -> source-roots / skill-document / readonly-discovery / file-operations
policy-store -> source-roots / file-operations
root-access -> source-roots / file-operations
source-roots -> file-operations
file-operations / skill-document / readonly-discovery -> types / 平台基础能力
```

内部职责模块禁止反向运行时导入 `core.ts` 或入口。
`router` 直接依赖所属命令模块，通过参数接收队列、通知、trustedHosts 读取器、宿主适配及 `state` / `workspaceSkills` 查询；对 `core.ts` 仅有类型引用，不反向运行时依赖入口或查询编排。
遇到循环，回查共享函数的归属；不采用延迟 import、全局容器或额外转发层掩盖循环。

### 3.3 前端完整拆分表

以下原行段均指本次分析时的 `src/skills/client.ts`。
界面文件使用 `.tsx`，纯请求、状态、选择器和文案数据保持 `.ts`。
稳定的选择器/侧边栏工厂不为语法统一扩大转换范围。

| 目标文件 | 预算行数 | 原代码归属与单一职责 |
| --- | ---: | --- |
| `skills/client.ts` | 100–180 | 原 1691–1707、4586–4649 等插件装配：当前会话适配、语言注册、插槽挂载、导航/侧边栏接入与清理。真正的界面移入 TSX。 |
| `skills/client/locales/zh.ts` | 310–360 | 原 DICT 的完整中文词典，键、文本和顺序保持。按语言分文件，不按几十个键切碎。 |
| `skills/client/locales/en.ts` | 310–360 | 原 DICT 的完整英文词典，保持原有转义后的字符串值。 |
| `skills/client/styles.ts` | 180–280 | 原 753–769 的完整 CSS，以及原拼接组成的导出。分割源码字符串便于阅读，拼接结果逐字节不变。 |
| `skills/client/api-client.ts` | 140–220 | 合并旧 `api-base.ts`，原 113–117、806–829、1749–1758：基址、响应解析、mutation headers、普通及 session 请求适配。 |
| `skills/client/messages.ts` | 220–320 | 原 771–805、839–912、1002–1029、1708–1721：翻译兜底、错误、时间、来源和结果摘要；组合中英文词典及目的地/侧边栏语言片段。保留 localeService 读取语义。 |
| `skills/client/selectors.ts` | 170–260 | 原 830–838、913–1001、2063–2099、2719–2736 的纯派生部分：查询、筛选、计数、状态和来源可见性。 |
| `skills/client/uploads.ts` | 180–260 | 原 1030–1191 及相关类型：文件选择验证、目录遍历、Base64 与上传载荷构造。 |
| `skills/client/controls.tsx` | 180–300 | 原按钮、开关、Modal、焦点/Tab 辅助，合并旧 `plugin-ui.ts` 的 Input/TextArea/箭头适配；只桥接现有宿主基础控件。 |
| `skills/client/icons.tsx` | 200–360 | 原 1246–1288、1370–1631 和各列表/页签中的 SVG、品牌资源及图标包装，所有资源内容保持。 |
| `skills/client/useWorkspaceCatalog.ts` | 190–310 | 原工作区状态/refs、2100–2213 列表与详情加载、目标定位：登记列表、按路径详情、epoch/request 和过期响应处理。 |
| `skills/client/useSkillManager.ts` | 480–650 | manager 状态及命令：刷新、post、详情、创建、导入、同步确认、复制、分类批量提交、操作锁与结果归属。保持现有 useState，不改 reducer/状态库。 |
| `skills/client/manager-page.tsx` | 150–280 | 原 1722–1746 会话隔离外壳、主视图组装及反馈/告警/加载区域；无条件调用 hooks，并在原位置组合各 renderer。 |
| `skills/client/scope-panels.tsx` | 240–420 | 原 3309–3446、3484–3648：作用域页签、统计、筛选、工作区与回收站展示。 |
| `skills/client/skill-rows.tsx` | 230–420 | 原 2292–2309、2325–2408、2457–2718、2873–2884：原生/外部技能行、操作菜单、开关、状态及拖放标记。 |
| `skills/client/source-tree.tsx` | 320–530 | 原 2737–2823、2885–3308：来源、分类树、展开和来源级操作；依赖 rows，rows 不反向依赖树。 |
| `skills/client/editor-dialogs.tsx` | 180–330 | 原 3715–4006：创建和导入弹窗，共用目的地选择；业务状态留在 manager 生命周期。 |
| `skills/client/skill-dialogs.tsx` | 160–310 | 原 4007–4247：详情、同步、移入回收站、永久删除弹窗。 |
| `skills/client/category-dialogs.tsx` | 220–400 | 原 4248–4582：分类创建/改名、批量添加、删除的界面表达。 |
| `skills/client-types.ts` | 200–360 | 原前端合同及顶部 ModalState/ResultMessage 等共享类型。跨模块类型放这里，单个 renderer 的局部 props 留在使用文件。 |

icons 的行段与 rows/tree 的原始区段存在位置包含关系：实际迁移时先提取图标表达，行/树只保留调用。
manager 和 workspace 的行段也存在交织：按状态归属提取，不复制原状态或创建第二套请求缓存。
每个旧 helper、state、ref、effect、事件处理函数和 JSX 子树登记唯一去向，迁移末尾逐项核销。

CSS 当前约 20,203 字符，包含很长的单行规则。
采用可阅读的字符串片段及拼接表达，不把巨型单行原样移出后冒充合理粒度。
字符串分片不得插入新字符；最终 `destinationCss + sidebarEntryCss + ownCss` 的内容及顺序不变。
仍在原 section 的同一 `<style key="css">` 位置注入，不迁移到 head，不改用 CSS Modules。

### 3.4 前端状态归属和依赖

| 状态或能力 | 唯一拥有者 | 生命周期要求 |
| --- | --- | --- |
| scope、savedFilters、expanded | 原 section 外壳，保留在 `manager-page.tsx` | 会话切换时保留/重置关系与当前完全相同。 |
| snapshot、busy、result、modal、form、upload、detail、复制反馈和操作锁 | `useSkillManager` | 与原带 session key 的 manager view 一起挂载、重置和卸载。 |
| 工作区列表、选中路径、详情缓存、request number、epoch | `useWorkspaceCatalog` | 由原 manager 层无条件调用，保持按路径缓存及旧响应丢弃。 |
| 菜单打开、焦点等控件本地状态 | 现有选择器/Modal 实现 | 工厂实例保持稳定，不能放进 render 重新创建。 |
| 插件级 locale/导航/侧边栏资源 | `skills/client.ts` 及对应适配 | 注册和清理顺序保持，不增加重复监听。 |

```text
client 入口 -> manager-page -> hooks / scope-panels / dialog renderers
scope-panels -> source-tree -> skill-rows -> controls / icons
hooks -> api-client / uploads / selectors / messages
messages -> locales / 既有目的地与侧边栏语言片段
styles -> 既有目的地与侧边栏 CSS 片段
```

底层模块不反向导入 page、hooks 或入口。
每个 renderer 只接收其使用的数据和命令，不传可任意读写全部状态的万能对象。
`useSkillManager` 超过 650 行时优先把纯派生移到 selectors、文件处理移到 uploads；仍超限再按完整命令组拆分，不把 hook 任意切成多个薄 hook。
拆出的 UI 优先采用无 hooks 的 `renderX(props)` 返回 TSX，并在原树位置直接调用。
不把普通 helper 一律替换成新增 React 组件，以免引入不必要的 Fiber/挂载边界。

### 3.5 现有短文件合并

| 原文件 | 当前行数 | 去向 |
| --- | ---: | --- |
| `skills/api-base.ts` | 44 | 合入 `skills/client/api-client.ts`，不留兼容转发。 |
| `skills/plugin-ui.ts` | 31 | 合入 `skills/client/controls.tsx`。 |
| `skills/source-select-model.ts` | 16 | 合入 `skills/source-select.ts`，约 130–160 行；Escape 捕获属于菜单自身行为。 |
| `skills/destination-types.ts` | 32 | 合入 `skills/destination-picker.ts`，约 170–210 行；专属类型与工厂放一起。 |
| `client/TuningPage.tsx` | 23 | 合入 `client/TuningPanel.tsx`，约 610–650 行；同文件保留 TuningPage 和 TuningPanel 两个原组件，入口更新 import。 |

调优页合并保留原页面框架与独立 Panel 组件身份，不改变 JSX 嵌套、文案或表单状态。
删除内部文件前查询全仓引用并同步更新；本次允许内部路径改变，不保证旧源码深导入路径继续存在。
包的宿主入口、浏览器入口及其声明入口不变，`package.json` 的发布/加载配置不调整。

### 3.6 其余源码逐项去向

所有未在拆分表中的源码均在本表，避免方案只覆盖两个大文件。

| 现有文件 | 当前行数 | 本轮处理 |
| --- | ---: | --- |
| `src/index.ts` | 86 | 保留，宿主入口和 schema/服务装配边界完整。 |
| `src/host/env.ts` | 106 | 保留，宿主服务合同。 |
| `src/host/library.ts` | 282 | 保留，完整壁纸资源 HTTP 服务。 |
| `src/host/tuning.ts` | 546 | 保留，调优服务查询与写入编排；不为行数强拆。 |
| `src/core/color.ts` | 259 | 保留。 |
| `src/core/config.ts` | 37 | 保留，独立默认值与纯配置归一化边界；不与带 SDK 副作用的入口混合。 |
| `src/core/media.ts` | 172 | 保留。 |
| `src/core/sample.ts` | 139 | 保留。 |
| `src/core/skins.ts` | 366 | 保留。 |
| `src/core/tone.ts` | 103 | 保留。 |
| `src/core/tuning.ts` | 564 | 保留，现有纯调优规则不改算法或排版。 |
| `src/client/AppearancePage.tsx` | 259 | 保留。 |
| `src/client/LibraryPicker.tsx` | 222 | 保留。 |
| `src/client/Select.tsx` | 197 | 保留。 |
| `src/client/TuningPanel.tsx` | 591 | 合并薄 TuningPage，见上表。 |
| `src/client/controller.ts` | 470 | 保留，外观引擎及状态时序不改。 |
| `src/client/dsh-env.ts` | 86 | 保留，SDK 桥接与 SlotMap 声明。 |
| `src/client/index.ts` | 128 | 仅更新调优页面 import，其他装配逻辑保持。 |
| `src/client/library.ts` | 108 | 保留。 |
| `src/client/styles.ts` | 163 | 保留，不与 Skills 样式合并。 |
| `src/client/tuning.ts` | 93 | 保留，完整调优传输职责，不并入壁纸请求。 |
| `src/client/wallpaper.ts` | 366 | 保留。 |
| `src/skills/types.ts` | 256 | 保留原路径；归入精确共享数据合同后预算 330–480 行。 |
| `src/skills/host-types.ts` | 127 | 保留，不顺手删除已无 UI 的旧 updater 类型。 |
| `src/skills/readonly-discovery.ts` | 153 | 保留，底层只读递归发现。 |
| `src/skills/primitives.d.ts` | 92 | 保留，声明文件不与业务实现混合凑行。 |
| `src/skills/settings-nav-icon.ts` | 115 | 保留，不整合观察器。 |
| `src/skills/sidebar-entry.ts` | 283 | 保留，继续提供原 CSS、词典与装配能力。 |

配置、清单、锁文件、许可和图标保持原内容。移植代码的许可证说明随代码保留。
README 不改功能描述；实施完成后若需要同步目录表，同时更新中英文目录说明。

## 4. 类型和协议提取方式

将浏览器确实消费的快照、详情、工作区、创建结果等数据形状归入现有 `skills/types.ts`。
严格复制当前必填、可选、null、错误联合及数组形状，不借类型收口改变返回字段。
`client-types.ts` 改为从纯类型合同引用，避免界面合同依赖 Node 编排函数的返回推导。
实施前使用类型检查器记录旧返回类型；迁移后检查双向结构兼容，必要时保留精确别名。

本轮不新增运行时请求校验、不收紧输入、不统一响应信封、不改变错误处理。
普通 callApi 和 sessionApi 保留不同的请求行为，不统一三类页面的 fetch 实现。
浏览器不得新增 Node 或服务端实现的值导入；原 type-only 引用问题按类型提取解决。

## 5. 必须冻结的运行行为

### 5.1 界面、样式与 TSX

- DOM 层级、元素顺序、className、style、data/ARIA 属性、SVG 和品牌 data URI 不变。
- key、ref、children 数组及 Fragment 的位置不变，不新增 DOM 包装。
- 保留 h/React.createElement 的 props 覆盖顺序，TSX spread 前后顺序与原语义一致。
- 显式保留原字符串、空白文本节点及 null/undefined/false 的渲染语义。
- 不把 defaultValue 改成 value，不修改受控/非受控输入行为。
- JSX 特殊字符和字符串须对照原运行值，不能让实体或缩进改变可见文案。
- 保留 Input.TextArea 的属性过滤和 `Object.assign(HostInput, { TextArea })` 既有副作用。
- CSS 内容、选择器、声明顺序、特异性、媒体/容器条件和注入位置不变。
- DICT 的 namespace、键、文本和 Object.assign 覆盖顺序不变。
- `createSourceSelect` 和 destination kit 保持原模块级稳定身份，不移进 render。

### 5.2 前端异步与生命周期

- 保留 section 外壳和 `sessionId || "no-session"` 对应 view 的原重挂载边界。
- modal、form、upload 等原父级状态不能移进关闭时卸载的弹窗。
- setResult 继续绑定操作发起时的 scope，旧结果不串到新页签。
- post 的锁、提示、并行刷新、catch/finally 顺序不变，不借重构减少请求。
- 工作区列表/详情继续使用普通 callApi；其他原有 session 请求保持原 headers。
- 工作区 request number、epoch、按路径缓存和过期响应丢弃规则不变。
- 分类批量操作继续逐项串行，不改 Promise.all。
- 菜单 Escape 的 capture、阻止传播、焦点恢复和 listener 清理时机不变。
- 文件选择 focus listener、0ms release、30s timeout、复制反馈 1500ms 保持原值。
- source/category 展开 key 的序列化字段顺序及默认展开规则不变。

### 5.3 服务端与磁盘

- 宿主插件 name、inject、skills 子插件隔离、create_skill 注册和执行确认要求不变。
- index 继续拥有唯一 mutationQueue，工具和原 POST 共用它。
- detail/workspace-skills 等原 POST 读操作继续在队列里；browse、GET/HEAD 保持队列外。
- rootByKey 保持 apply 时捕获，trustedHosts 保持按请求读取，不统一缓存策略。
- 原 host/origin、Connection、方法、mutation header、content-type 和 body 校验顺序不变。
- 路由路径、方法、HEAD Content-Length、状态码、错误文本和响应包装不变。
- 上传 body 88 MiB、普通 body 1 MiB 及 ZIP/文件/目录限制不变。
- afterWrite 的调用条件、失效通知、错误吞掉方式及 effect/dispose 所有权不变。
- 路径归一、真实路径复验、符号链接/Windows junction、大小写和重叠规则不变。
- 原生来源、其他 Agent 来源、公共 Agent 及项目来源的可操作差异不变。
- Provider rank、去重、同名覆盖和回退采用原排序规则；不统一 localeCompare 与精确比较。
- getProviderSkill 每次加载仍复验 locator，不缓存或省略检查。
- state、workspaceSkills、扫描和内容摘要的原调用及并发结构不变。
- digest 文件排序、逐文件 SHA256 和外层 JSON/SHA256 算法不变。
- import 覆盖继续备份替换；sync 覆盖继续先进回收站，不合并为统一事务。
- state 迁移、缺字段补全、不可读策略 fail-closed、旧 trash 格式和同步记录保持兼容。
- 所有环境变量保持原读取时机，不把函数内求值移到模块初始化。
- 临时目录、失败清理、回滚次序、日志格式和错误中的路径保持原行为。

## 6. 分阶段迁移

每阶段是一个可独立审阅和验证的工作单元，不意味着自动生成 Git 提交。

| 阶段 | 改动 | 完成条件 |
| --- | --- | --- |
| 0：冻结基线 | 记录当前路由/工具/数据合同、CSS 与词典摘要、典型页面状态和关键失败路径。 | 对基线实现的验证通过；原有缺陷按现状记录。 |
| 1：服务端底层 | 提取文档、文件操作、来源、根验证和扫描，保持 core 原导出可用。 | 无运行时依赖环；相关旧测试及类型检查通过。 |
| 2：服务端能力 | 提取工作区、条目、状态、策略、分类、回收站、导入、上传和同步。 | 临时目录行为和结果差分一致；core 只剩查询/Provider 编排。 |
| 3：宿主路由 | 提取 router；日志、Provider、工具、队列仍归 index。 | 方法/守卫/状态码/HEAD/队列与通知基线一致。 |
| 4：前端叶子 | 提取词典、CSS、API、文案、selectors、uploads、icons 和 controls。 | CSS/词典一致；请求 URL/headers/body 与基线一致。 |
| 5：TSX 展示 | 按 rows -> tree -> scope -> dialogs 提取并转换；保持原父级状态。 | DOM/样式/属性/key 和交互基线一致，没有新挂载边界。 |
| 6：状态与装配 | 提取 workspace hook、manager hook、页面与真实入口。 | 会话切换、工作区竞态、操作锁、提示归属、清理一致。 |
| 7：收尾 | 合并短文件、更新内部引用、归入共享类型，必要时更新双语目录表。 | 全量手写文件不超 800 行，无新增薄文件，全部验收通过。 |

同一阶段不同时做算法优化、数据迁移、格式统一和缺陷修复。
TSX 提取按完整子树逐批进行，每批保留可比较的基线，避免先重写完整界面再一次验证。
某阶段回归时只撤回该批本次改动，不覆盖用户其他工作，不依赖自动提交实现回退。

## 7. 验证方案

迁移前基线：类型检查通过，既有测试共 9 个文件、102 个测试通过。
迁移后实测：`pnpm typecheck` 通过；完整 `pnpm test` 共 14 个文件、132 个测试通过。新增 5 个行为测试文件、30 个测试。未执行构建。
依赖图、共享类型合同、183 个运行时声明 AST 和 34 个界面场景的对比结果及限制见验证记录，不能据此代替真实宿主验收。

### 7.1 自动检查与针对性测试

| 检查 | 覆盖内容 |
| --- | --- |
| 类型检查 | `pnpm typecheck`，确认脚本仍为 noEmit，不触发产物生成。 |
| 既有测试 | `pnpm test` 及阶段相关测试，保留现有测试意图。 |
| 行数统计 | 逐个统计 src 和 tests 的手写文件及样式，任何 >800 失败；新业务文件 <100 审查归属。 |
| 依赖检查 | 检查运行时 import 图；浏览器无 Node 值导入、内部实现不反向导入入口或 core。 |
| 静态资源基线 | 对最终 CSS 字符串及两种语言最终词典记录哈希/固定数据，迁移后比对。 |
| 数据合同 | 对固定输入比较响应字段、错误、状态码、序列化结果和既有缺省值。 |
| IO 行为 | 使用临时目录和可控故障，比较导入/覆盖/回收/恢复/同步的结果及文件树。 |
| 异步行为 | 可控 fetch、Promise 与计时器验证队列、旧响应、锁、刷新顺序、作用域结果和清理。 |

已新增下列按行为分组的测试；原目标为每文件 120–650 行，不为每个抽出函数单建测试。实际 94–195 行，按完整行为组组织，不为达到目标补行。

| 测试文件 | 目标内容 |
| --- | --- |
| `tests/skills-routes.spec.ts` | origin/Connection/方法/header/body 顺序，GET/HEAD/POST，队列和工具共用，错误及通知。 |
| `tests/skills-state.spec.ts` | 旧状态迁移、不可读策略、分类/排序、工作区作用域、同名去重和 Provider 回退。 |
| `tests/skills-files.spec.ts` | 创建、普通/ZIP/文件夹导入、冲突、链接、临时发布失败、回收/恢复及清理。 |
| `tests/skills-client-data.spec.ts` | URL、普通/session 请求、上传选择、筛选、文案和固定资源摘要。 |
| `tests/skills-client-lifecycle.spec.ts` | 可控异步下的工作区乱序、scope 提示、会话重挂载、锁与清理。 |

现有 `tests/skills-sync.spec.ts` 继续承担同步算法回归，必要时增加覆盖，不复制到新测试。
已有 color/config/host-tuning/library/media/sample/skins/tuning 测试保留。
测试夹具按完整场景组织；不复制两个超过 800 行的旧实现进入 fixture 来绕过约束。
只为尚未被覆盖的兼容风险增加测试，不写与实现逐行对应的测试。
新增测试适配尽量沿用 Vitest 和现有依赖，不引入新的运行时库或修改构建配置。

### 7.2 真实宿主界面验收

TSX 转换必须有真实宿主界面核对，类型检查和静态快照不能单独证明视觉一致。
使用相同宿主版本、窗口尺寸、主题、语言、数据及展开状态比较重构前后：

- 三个设置页的导航名称、顺序、图标和现有外观/调优显示。
- 技能页各 scope 的空态、加载、错误、警告、筛选、统计和列表。
- 项目列表、同名不同路径项目、失效工作区、展开状态和详情。
- 来源/分类展开、手动排序拖放、启停、只读标记和同步状态。
- 创建、导入、详情、同步、删除、回收站及分类弹窗的布局和按钮状态。
- 菜单 Escape、Tab、焦点恢复、输入保留、弹窗关闭/重开及会话切换。
- 中英文、浅深色、窄宽窗口，以及宿主热重载后的清理与重新挂载。

静态区域在固定条件下比较 DOM、计算样式和截图；动态时间文本、光标等控制变量单独处理。
截图有差异须定位具体原因并解释，不能以“看起来差不多”替代样式不变要求。
如果缺少真实宿主或旧版基线，标记该项未完成，不能宣称已证明完全一致。
若启动或验证需要构建，遵守用户规则，先取得明确构建授权。本次未启动构建，也未执行真实宿主视觉及键盘交互验收。

## 8. 最终完成标准

- 两个超限文件的全部职责已迁移，core/client/index 仍具有清晰的实质装配或编排职责。
- 所有手写源码、样式、测试文件不超过 800 物理行，未用压缩代码规避限制。
- 新业务模块不存在几行转发文件；小于目标粒度的稳定边界有明确理由。
- 全部原始函数、类型、常量、state/ref/effect 和界面子树均有唯一去向，无遗漏复制。
- 宿主/浏览器入口和外部运行合同兼容；内部删除文件无残留引用。
- CSS、词典、资源、DOM 结构、组件状态及异步时序通过对应基线核对。
- 未顺手修复或改变本方案列出的现有行为，没有新增运行时技术或数据格式。
- 类型检查、适用测试和真实宿主验收分别报告结果及实际限制。
- 无未授权构建、自动提交、宿主源码修改或与本轮无关的清理。

## 9. 决策状态

已由用户确认：行数口径、Skills 界面转换 TSX、稳定模块保留、内部源码路径允许调整。
本方案细化这些约束下的模块归属、迁移顺序和验收条件。
用户已授权按阶段实施；实际职责归属和预算差异记录如下，未扩大到行为修复。
相关领域词汇见根目录 `GLOSSARY.md`；架构取舍见 `docs/adr/0001-behavior-preserving-modularization.md`。

## 10. 实施结果与预算差异

全部 83 个手写源码、样式、测试及根配置文件均不超过 800 行，最大为 `useSkillManager.ts` 的 634 行。
服务端提取 14 个业务模块和独立 router；Skills 展示树及弹窗已转换 TSX。稳定模块保留原位。
所有逐文件行数见 [验证记录](refactoring-validation.md)，以下列出需说明的预算差异。

| 文件或归属 | 实测 | 说明 |
| --- | ---: | --- |
| `skills/core.ts` | 339 | 保留查询和 Provider 读模型编排，原公开导出仍可用。 |
| `skills/index.ts` | 273 | 宿主装配、工具、Provider、唯一队列和清理；路由查询经参数注入。 |
| `skills/client.ts` | 75 | 真实浏览器插件装配与原公开导出；会话适配随 section 归 `manager-page.tsx`，不为入口补行。 |
| `skills/client/api-client.ts` | 72 | 已合并 api-base，完整承担 URL、响应、普通及 session 请求边界；与展示或上传没有合并理由。 |
| `skills/client/manager-page.tsx` | 301 | section 状态和主视图组装；普通 renderer 保留原树边界。 |
| `skills/client/source-tree.tsx` | 596 | 完整来源及分类树，依赖 rows；低于 650 预警线，不按行机械切割。 |
| `skills/client/scope-panels.tsx` | 424 | 作用域、统计、筛选和工作区/回收站表达保留在同一职责内。 |
| `skills/client/editor-dialogs.tsx` | 336 | 创建与导入共用目的地选择，保留完整弹窗表达。 |
| `skills/types.ts` | 325 | 精确共享合同，含 `TrashMetadata`；浏览器无 Node 运行时依赖。 |
| `client/TuningPanel.tsx` | 606 | 吸收薄页面，保留原两个组件及嵌套。 |

其余新业务文件均至少 100 行。新增数据测试 94 行、状态测试 118 行属于完整行为组，不通过排版或无意义测试扩行。
已删除的 5 个短内部文件无旧路径引用，未添加兼容转发层。
自动检查已完成，真实宿主中的截图、计算样式、键盘焦点及热重载清理仍是未完成的验收项。
