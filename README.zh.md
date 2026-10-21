# dsh-custom-center

[English](README.md)

一个独立的 **DSH Web GUI 插件**，在设置侧边栏里新增一个独立的「个性化中心」
页面，用来给 DeepSeek Harness 界面换肤：配色自动跟随画面主色调的自定义
图片 / 视频壁纸。

与「通用设置」里插入一行不同，本插件注册自己的一级 `settings.section` 条目，
因此它作为一个独立页面出现在设置导航中（和通用、模型、插件等并列）。

## 功能

- **壁纸库** — 点击图片打开壁纸库，分「图片」和「视频」两个标签。点网格里第一格的「上传」会把
  文件复制到 `<DSH home>/background/`（默认 `~/.dsh/background/`），自动归入
  `images/` 和 `videos/`；点缩略图即可使用。图片最大 50 MB，视频最大 512 MB，
  文件内容必须与扩展名一致。
- **自定义图片壁纸** — 任意 PNG / JPG / WebP，整套配色（背景、强调色、
  交互高亮）自动取自图片主色调。
- **视频动态壁纸** — MP4 / WebM 循环播放当背景，首帧取色生成配色。
- **左右两侧遮罩滑块** — 侧边栏和主区域的遮罩可分别调节，也可以勾选「左右同步」（与「正文加强」同一行）让两侧一起变化，说明在鼠标悬停时显示。
- **输入框不透明度滑块** — 独立调节输入框背景。
- **正文加强开关** — 给助手正文加一层轻磨砂底。
- **预览与保存** — 改动（壁纸、滑块、正文加强）只会修改草稿。点「预览」进入预览模式，草稿显示在当前
  界面，之后的所有更改立即生效但不保存；点「保存」才会持久化，点「退出预览」
  回到已保存的样子，点「撤销更改」同时丢弃草稿。
- **恢复默认** — 页面底部的按钮，清除壁纸、配色和所有已保存的设置。
- **上下文与压缩标签页** — 页面顶部新增「上下文与压缩」标签。读取当前默认模型的最大上下文与输出预留，并可为每个 agent preset 调整自动压缩阈值、压缩余量、近期保留方式（窗口比例或固定 tokens）与自动压缩开关。保存会通过 `configEditor` 写入当前 profile 的 `cordis.patch.yml` 并由 Loader 热应用；页面用与 DSH 相同的公式预览触发阈值与逐字保留预算。「应用范围」下拉框可选择单个模型、某个 provider 的全部模型，或一次应用到全部可编辑模型；模型列表由宿主通过 `llm.listProviders` / `llm.listModels` 枚举，浏览器不会提交模型 id 列表。「恢复推荐值」会填入最大上下文 272k、输出预留 32768、压缩阈值 0.8、压缩余量 16384（仍需保存）。

配色引擎在构造上保证对皮肤自身表面的 WCAG 对比度（文字、强调色、焦点色均经
对比度校正）。

壁纸之上的可读性是计算出来的，而不是假定的：

- 输入框光标、斜杠命令 chip、发送按钮和悬停行使用经过对比度校正的壁纸强调色，
  浅色或灰色强调色不会再融进输入框。
- 实心强调色底（设置页选中行、主按钮、开关）会取可读的文字色；强调色无法承载
  正文时退回淡色底。与面板几乎同色的强调色会被适度提亮到可见。
- 皮肤会保存壁纸的明暗分布。当宿主为浅色外观、而壁纸大部分区域即使加了遮罩也
  不适合深色文字时，配色切换为深色（浅色文字、深色输入框），并设置宿主的深色
  属性，让宿主自身的深色样式一并生效。其他壁纸保持宿主外观，深色宿主不会被切成
  浅色。更早保存的壁纸会自动补算该分布。

## 挂载方式

| 部分 | 状态 |
| --- | --- |
| Bundle 清单 | `dsh.bundle.patch` 指向 `cordis.patch.yml` |
| Loader 行 | `ui-custom-center` -> 包名 `dsh-custom-center` |
| Host 半区 | `src/index.ts`：`Config.enabled` 设置页 + 壁纸库路由（`src/host/library.ts`）+ 上下文/压缩路由（`src/host/tuning.ts`） |
| 浏览器半区 | `src/client/index.ts`：注册 `settings.section` 页面 |
| 共享逻辑 | `src/core/*`（配色、皮肤、取色、壁纸库规则）及其单测 |
| 构建 | `tsc` 声明 + `tsdown` host/client 产物 |

浏览器半区注册到 `settings.section` 插槽（带独立导航条目的完整设置页），
而不是 `settings.general.item`。

## 目录结构

```text
dsh-custom-center/
  cordis.patch.yml          # profile bundle 行（id ui-custom-center）
  icon.svg                  # 插件图标（展示元数据）
  src/
    index.ts                # host 半区（Node / Cordis）
    host/
      library.ts            # 回环路由：list、upload、file
      tuning.ts             # 回环路由：读取/写入上下文与压缩配置
      env.ts                # 精简的 host 服务类型
    client/
      index.ts              # 浏览器半区：settings.section 装配
      dsh-env.ts            # 精简的 DSH 服务类型 + SlotMap 增强
      controller.ts         # 命令式皮肤引擎（token、壁纸、持久化）
      wallpaper.ts          # DOM/localStorage/IndexedDB + 图片/视频解码
      CustomCenterPage.tsx  # 设置页（React 视图，含「外观 / 上下文与压缩」标签）
      TuningPanel.tsx       # 上下文与压缩标签的表单
      Select.tsx            # 自绘下拉框（替代原生 select）
      LibraryPicker.tsx     # 图片/视频标签、上传、缩略图
      library.ts            # 壁纸库路由的浏览器端客户端
      tuning.ts             # 上下文/压缩路由的浏览器端客户端
      styles.ts             # 注入的样式表
    core/
      color.ts              # 纯配色数学
      skins.ts              # 种子色 -> token 映射
      sample.ts             # 从像素网格纯取色
      media.ts              # 文件类别、命名规则、Range 解析
      config.ts             # 共享 host 配置默认值
      tuning.ts             # 校验、压缩预算公式、profile 配置变换
  tests/                    # vitest：color、skins、sample、config、tuning
```

## 开发安装

要求：Node.js 22+、pnpm，以及满足 `>= 0.2.1-rc.2` 的 DSH 宿主。

```sh
cd /Users/mac/Documents/code/dsh/dsh-custom-center
pnpm install
pnpm build
dsh plugin --profile web add link:$(pwd)
# 完成后刷新 DSH Web 界面
```

刷新后打开「设置」，侧边栏会出现「个性化中心」条目。点「选择图片 / 视频」设置壁纸，
先「预览」（预览中所有更改立即生效），满意再「保存」；「恢复默认」会清除全部设置。

卸载：

```sh
dsh plugin --profile web remove dsh-custom-center
```

## 常用命令

```sh
pnpm typecheck   # tsc -p tsconfig.json --noEmit
pnpm test        # vitest run
pnpm build       # 声明文件 + lib/index.js + lib/client.js
pnpm watch       # 开发时监听重建
```

## 构建产物

- `lib/index.js` — Host 半区，ESM、Node 平台；Cordis 与 Schemastery 保持
  external，由宿主提供。
- `lib/client.js` — 浏览器半区，包装为：

  ```js
  window.__ModuleLoader__.load({ id: 'dsh-custom-center', factory: (require) => { ... } })
  ```

  壳层模块表（`react`、`react/jsx-runtime` 等）保持 external，其余依赖内联。
- `lib/types/**` — 包 `exports` 引用的声明文件。

## 说明

- 不改 DSH 源码。卸载后恢复原生外观；壁纸库文件夹里的文件属于你，插件不会删除。
- 壁纸只在本机流转：选中的图片存 localStorage，选中的视频存 IndexedDB，原文件
  保存在壁纸库文件夹，不上传任何服务器。
- 壁纸库路由（`/custom-center/list`、`/upload`、`/file`）只接受回环 socket，
  经过 Connection 的 Host/Origin 校验和浏览器鉴权；`list` / `upload` 还要求带
  同源标记头。浏览器从不发送路径：文件用 `images/<名称>` 或 `videos/<名称>`
  标识，由服务端在自有目录内解析；符号链接和隐藏文件一律拒绝。
- 上下文/压缩路由（`GET` / `POST /custom-center/tuning`）同样只接受回环 socket、
  Connection 校验和同源标记头。它只接收模型窗口与压缩数字，不接受文件路径；
  写入通过 `configEditor` 落到当前 profile 的 patch，先由目标插件校验，再由
  Loader 热应用。
- 最大上下文是模型路由声明的容量，不是对单次对话的硬截断；压缩阈值按
  `min(最大上下文 × 压缩阈值, 最大上下文 − 输出预留 − 压缩余量)` 计算，公式与
  `compaction-basic` 一致。压缩设置按 agent preset 生效，修改只影响之后创建的
  Agent。
- 皮肤是叠加在宿主外观之上的正交层：不调用 `theme.setTheme`（浅色/深色由
  ui-theme 管理），并在每次 `theme/change` 后重新写回 token。
- 当前安装的 SDK 未发布 renderer 的 `SlotRegistry` 和 theme 服务类型，因此
  `src/client/dsh-env.ts` 声明了精简的结构化接口，并把 `settings.section` 增强
  进 `SlotMap`。若未来公共 SDK 扩展，可替换为真实导入。
- 许可证：[MIT](LICENSE)。
