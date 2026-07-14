# Changelog

## 0.4.0

- 新增首次启动和后续启动时的本机 Agent 自动发现与自动连接。
- 新增 macOS 原生应用菜单、`⌘,` 设置窗口与手动扫描/连接 Agent 控制。
- 将悬浮灯和设置页升级为柔雾蓝粉、暖白卡片的日间液态玻璃视觉。
- 自动安装仅作用于检测到的 Agent，并可在应用移动或 Agent 后安装后幂等修复接入。
- 修改已有 Hook 配置前保留一次性 `*.agent-light.bak` 备份，相同内容不重复写入。
- 将桌面端代码纳入 TypeScript 检查，并补齐自动发现、真实安装器调用和失败隔离测试。

## 0.3.0

- 新增独立的 Apple Silicon macOS 应用 Agent Light，以及 `.app` 和 DMG 打包流程。
- 新增本机 AgentHub、SSE 多会话状态同步和请求级权限决策队列。
- 新增 Claude Code、Codex、Cursor、OpenCode、Hermes 官方 Hook/Plugin Adapter。
- 新增 Claude Code、Codex、OpenCode 权限快捷回答。
- 新增临时 HOME 安装测试、AgentHub HTTP/SSE 集成测试和权限端到端测试。
- 将悬浮窗升级为多 Agent 液态玻璃界面，并加入会话栏、动态尺寸和状态提示音。

## 0.2.0

- 新增可拖动、始终置顶、跨 macOS 桌面显示的 Electron 悬浮窗。
- 新增紧凑模式、窗口位置记忆和桌面端安全快捷回复。

## 0.1.0

- 首次发布：Shell Integration 监控、阻塞提示检测、安全快捷回复与红绿灯侧边栏。
