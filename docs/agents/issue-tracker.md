# Issue tracker: Local Markdown

本仓库的任务和规格以 Markdown 文件保存在 `.scratch/`。

## 文件约定

- 每个功能使用 `.scratch/<feature-slug>/`。
- 规格文件为 `.scratch/<feature-slug>/spec.md`。
- 实现任务分别保存为 `issues/<NN>-<slug>.md`，从 `01` 编号。
- 分诊状态记录在任务文件顶部附近的 `Status:` 行；
  状态名称见 `triage-labels.md`。
- 评论与对话记录追加到文件末尾的 `## Comments` 下。

## 技能操作

技能要求“发布到任务跟踪器”时，在对应功能目录创建文件。
技能要求“获取相关任务”时，读取指定路径或编号对应的文件。

## Wayfinding

- 地图：`.scratch/<effort>/map.md`，记录笔记、已作决定和待探索问题。
- 子任务：`.scratch/<effort>/issues/NN-<slug>.md`。
- 类型：使用 `Type:`，值为 research、prototype、grilling 或 task。
- 依赖：在顶部附近使用 `Blocked by: NN, NN`。
- 领取：开始工作前写入 `Status: claimed`。
- 完成：在 `## Answer` 下追加结果，并写入 `Status: resolved`；
  将结果摘要和链接追加到地图中的已作决定部分。
- 可领取任务：依赖均已 resolved、自身未领取且未解决；
  按编号选择第一个。
