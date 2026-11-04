# 两套抖音插件并行启动

本次只修改 dsh-custom-center，保留 dsh-douyin-tools（包名 dsh-douyin-life）。原迁移版共用旧插件的注册名称，存在 Loader、工具、HTTP 和界面覆盖风险；中心版现在使用独立命名空间。

| 项目 | 旧插件 | 个性化中心版 |
| --- | --- | --- |
| Loader 与设置 ID | `douyin-life` | `custom-center-douyin` |
| 宿主模块 | `dsh-douyin-life` | `dsh-custom-center/douyin` |
| 设置导航名称 | 刷抖音 | 刷抖音（中心版） |
| 会话视频视图 ID | `douyin-watched` | `custom-center-douyin-watched` |
| 工具 | `dy_status` 等 35 个 `dy_*` | `cc_dy_status` 等 35 个 `cc_dy_*` |
| HTTP 前缀 | `/api/douyin-duty` | `/api/custom-center/douyin` |
| 默认数据根 | `~/.dsh/douyin-duty` | `<DSH_HOME>/dsh-custom-center/douyin`，未设置 DSH_HOME 时使用 `~/.dsh` |
| 数据根环境变量 | `DSH_DOUYIN_HOME` | `DSH_CUSTOM_CENTER_DOUYIN_HOME` |
| 手动连接 Chrome 的默认端口 | `9222` | `9223` |
| 手动连接 Chrome 的用户目录 | 系统 Chrome 用户目录 | 中心版数据根下 `browser/cdp` |

工具参数、HTTP 后缀和七个业务页签保持原合同。中心版不注册旧工具名或旧 HTTP 地址的别名，因此不会截获旧插件请求。面向模型的交叉引用已使用中心版工具名。后台 MCP 工具保留 `douyin_*` 协议；章程中的 `dy_*` 和 `cc_dy_*` 都会转换为该子进程可用的工具名。

中心版宿主忽略全局 `DSH_DOUYIN_HOME`，避免与旧插件指向同一目录。它只为自己启动的 Python 子进程同时设置两个数据根变量；不修改宿主环境。中心版随包 Python 使用 `DSH_CUSTOM_CENTER_DOUYIN_HOME` 解析数据根。此前若用 `DSH_DOUYIN_HOME` 指定中心版自定义目录，升级后需将相同路径设置到新变量。

默认 Python 浏览器调试端口已按中心版数据根生成，避开旧宿主派生的持久浏览器端口范围 `9300–9899`（旧 Python 的独立默认值为 `9333`）。手动连接 Chrome 则使用中心版独立用户目录与 `9223`，不要求关闭全部系统 Chrome。两种浏览器入口的登录态可能不同，首次使用各自入口时需要登录。

## 启用与升级

1. 构建中心版，并通过官方插件管理器安装或更新它。已链接安装的中心版也应先构建，再按管理器返回的步骤加载新模块。
2. 保留旧 bundle；分别启用 `dsh-douyin-life` 和 `dsh-custom-center`。若 profile 以前覆盖了中心版旧 Loader 行，应将中心版自己的配置放到新行 `custom-center-douyin`；旧行 `douyin-life` 现在只属于旧插件，不能批量改名。
3. 按管理器的 `nextStep` 完成重启（若要求），刷新原有 GUI。设置导航应能同时区分两套入口，模型应能看到两个前缀的工具。
4. 中心版原有默认目录保持不变；只改环境变量名时保持路径一致。配置文件、账本和报告不会因为命名空间调整而迁移或删除。
5. 若曾导入旧配置，检查 `cdpUrl`、`cdpPort` 和工作区等显式设置。导入保留用户值，已有 `9222` 或旧 CDP 地址不会自动改写。中心版若需独立浏览器，将 `cdpUrl` 清空、`cdpPort` 设为 `9223`，再使用中心版连接入口。

两套插件可以同时加载，但各自拥有账本、额度和定时任务；它们不会协调同一账号的动作或去重记录。对同一账号开启两套相同自动任务可能产生重复操作。需要并行运行自动化时应分别配置账号和授权范围。手动给两套插件设置相同数据根或 CDP 地址，会主动取消对应资源的隔离。

旧目录离线导入仍要求先停止来源插件、浏览器和后台任务。该要求只约束复制快照的过程；导入完成后可按上述独立配置同时加载。导入不会同步两套运行后的新账本。

## 验证范围

离线测试使用真实 Cordis 生命周期和旧版冻结合同建立冲突检测注册器，先占用旧版 35 个工具和 32 条路由，再装卸中心版，检查旧注册完整保留。浏览器端同样在旧设置和会话视图已占位时注册中心版；另有双设置行保存隔离、客户端请求前缀、章程转换和专用 Chrome 参数测试。

已通过 `pnpm typecheck`、309 项测试、`pnpm build` 和 `pnpm douyin:check-package`。在中心版源码仓库中另可运行：

```sh
pnpm douyin:check-coexistence /path/to/dsh_douyin_tools
```

该脚本在临时目录加载旧仓库与中心版构建产物的真实宿主入口，分别验证「先旧后新」和「先新后旧」。本次两种顺序均成功注册 70 个工具、旧版 1 个 HTTP 前缀路由与中心版 32 条精确路由；卸载中心版后旧版注册保留，网络请求和子进程启动次数均为 0。

当前 profile 的两套 bundle 都已链接安装，均处于停用状态；本次没有改变启用状态，也未完成真实 GUI 或账号验收。功能与界面的完整对齐仍按[修复清单](douyin-parity-repair.md)单独推进；本次共存修复不表示其中的缺失功能已经补齐。
