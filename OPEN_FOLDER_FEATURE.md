# 打开文件夹功能

## 功能说明

为 dsh-custom-center 插件的技能管理器添加了"打开文件夹"功能，允许用户直接在系统文件管理器中打开技能所在的文件夹。

## 使用方法

1. 打开 DSH 设置界面
2. 导航到"技能"页面
3. 在技能列表中右键点击任意技能
4. 选择"打开文件夹"选项
5. 系统文件管理器将自动打开技能所在的文件夹

## 技术实现

### 后端（src/skills/core.ts）

添加了 `openSkillFolder` 函数：

- 接受 `RootInput` 类型的 root 参数（技能来源）
- 接受 `string` 类型的 name 参数（技能名称）
- 通过 `rootDefinition` 获取技能根目录定义
- 通过 `visibleEntryForRoot` 获取技能条目
- 使用 `node:child_process` 的 `spawn` 调用系统命令打开文件夹：
  - macOS: `open`
  - Windows: `explorer`
  - Linux: `xdg-open`

### API 路由（src/skills/index.ts）

添加了 `/api/dsh-custom-center/skills/open-folder` 路由：

- 接受 POST 请求
- 参数：`root`（技能来源）、`name`（技能名称）
- 通过 `requestRoot` 获取技能根目录
- 调用 `openSkillFolder` 执行操作

### 前端（src/skills/client.ts）

添加了"打开文件夹"菜单项：

- 在技能右键菜单中添加了"打开文件夹"选项
- 图标：`FolderOpen`（lucide-react）
- 点击后通过 `post` 方法调用后端 API
- 显示操作结果（成功或失败消息）

### 国际化（i18n）

添加了中英文 locale：

**中文：**
- `btn.open.folder`: "打开文件夹"
- `result.folder.opened`: "已打开文件夹"

**英文：**
- `btn.open.folder`: "Open Folder"
- `result.folder.opened`: "Folder opened"

## 平台支持

- ✅ macOS
- ✅ Windows
- ✅ Linux（通过 xdg-open）

## 错误处理

函数会处理以下错误情况：

1. 未知技能来源（`error.root.unknown`）
2. 技能不存在（`error.skill.notFound`）
3. 打开文件夹失败（`error.open.failed`）

所有错误都会返回结构化的错误响应，包含错误代码和错误消息。

## 测试

所有现有测试通过：

```
Test Files  9 passed (9)
     Tests  102 passed (102)
```

## 构建状态

✅ TypeScript 编译通过
✅ tsdown 构建成功
✅ 所有测试通过
