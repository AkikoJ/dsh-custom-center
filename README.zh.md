# dsh-custom-center

[English](README.md)

一个独立的 **DSH Web GUI 插件**骨架，用于构建「自定义中心」：集中管理皮肤、
主题、背景、字体、预设等个性化资产。

本仓刻意保持很小：它是可运行的插件骨架，而不是完成品。Host 半区已经提供基于
schema 的 `enabled` 开关，浏览器半区可被加载但暂不渲染内容，并且两个半区都不依赖
`dsh-web` 检出即可构建。

## 当前状态

| 部分 | 状态 |
| --- | --- |
| Bundle 清单 | `dsh.bundle.patch` 指向 `cordis.patch.yml` |
| Loader 行 | `ui-custom-center` -> 包名 `dsh-custom-center` |
| Host 半区 | `src/index.ts`：`Config.enabled` 自动生成设置页 |
| 浏览器半区 | `src/client/index.ts`：兼容 loader 的空实现 |
| 共享逻辑 | `src/core/config.ts` 及其单测 |
| 构建 | `tsc` 声明 + `tsdown` host/client 产物 |
| UI / 路由 / 资产 | 尚未实现 |

## 目录结构

```text
dsh-custom-center/
  cordis.patch.yml       # profile bundle 行（id ui-custom-center）
  src/
    index.ts             # host 半区（Node / Cordis）
    client/index.ts      # 浏览器半区（__ModuleLoader__ 闭包工厂）
    core/config.ts       # 共享默认值与归一化
  tests/config.spec.ts   # 纯配置单测
  tsdown.config.ts       # host ESM + 浏览器 CJS 闭包工厂
  tsconfig.json          # 类型检查 program（src + tests）
  tsconfig.build.json    # 仅声明文件，输出到 lib/types
```

## 开发安装

要求：Node.js 22+、pnpm，以及满足 `>= 0.2.1-rc.2` 的 DSH 宿主。

```sh
cd /Users/mac/Documents/code/dsh/dsh-custom-center
pnpm install
pnpm build
dsh plugin --profile web add link:$(pwd)
# 完成后重启 dsh web
```

重启后插件行即挂载。Host 会根据 `enabled` schema 自动生成本条目的设置表单，
因此即使自定义中心还没有页面，开关也已经可见。

检查组合后的 profile：

```sh
dsh --profile web --dump-config
```

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

  壳层模块表（`react`、`@deepseek-ai/cordis`、slot/store 原语等）保持
  external，其余依赖内联。
- `lib/types/**` — 包 `exports` 引用的声明文件。

## 后续步骤

1. 在 `src/client/index.ts` 注册一级 `settings.section`（或侧栏座位），渲染
   自定义中心的卡片。
2. 在 Host 半区添加同源回环路由 `/api/dsh-custom-center/*`，用于资产清单与写入；
   绝不信任客户端提供的路径。
3. 在 `src/core/` 定义资产注册表契约（发现根、清单校验、原子安装/移除），让两个
   半区共享。
4. 在真正写文件之前，为注册表、路由门禁和失败路径补测试。
5. 若以后并入 `dsh-web` monorepo，改用 `shared/tsdown.client.ts`，在
   `aggregate.yml` 注册，并由聚合生成器管理 `web-ui-*` 行 id；不要把共享预设
   复制进包内。

## 说明

- 本骨架的类型检查与构建不需要 DSH 源码检出；类型只来自官方
  `@deepseek-ai/*` npm SDK 包。
- 浏览器半区目前无副作用，因此在 UI 尚未实现时启用插件行也不会破坏 GUI。
- 许可证：`UNLICENSED`（私有项目）。发布前请选择并添加许可证。
