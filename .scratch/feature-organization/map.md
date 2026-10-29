# 三功能组织实施地图

日期：2026-10-29。父规格：[按三个功能组织个性化中心源码](spec.md)。

## 任务结果

- [01 共享边界整理与行为基线](issues/01-shared-boundaries.md)：resolved。
- [02 外观功能完整迁移](issues/02-appearance-migration.md)：resolved。
- [03 上下文与压缩功能完整迁移](issues/03-tuning-migration.md)：resolved。
- [04 三功能整体验收与文档交付](issues/04-integration-validation.md)：ready-for-human；自动检查与文档完成，真实宿主验收待完成。

## 已作决定与证据

- 沿用定稿方案与 ADR-0002，仅调整源码归属、必要引用及当前文档；Skills、CSS、依赖配置和既有产物保持不变。
- 两个请求约定直接归属 shared；保留两个真实装配入口，不增加兼容转发或功能子插件。
- 无产物类型检查及全量 132 项测试通过；双轴审查唯一 P3 注释遗漏已修正。
- [验证记录与人工清单](../../docs/feature-organization-validation.md)记录基线、阶段检查、等价性、依赖图与行数证据。

## 待完成

- 在相同 DSH 版本、数据、主题和窗口条件下完成三功能视觉、交互及热重载清理验收。
- 如需新产物，先取得用户明确构建授权；本次不构建、提交或推送。
