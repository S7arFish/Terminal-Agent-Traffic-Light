# Agent Light / Terminal Agent Traffic Light

Agent Light 是一个独立的 macOS 悬浮红绿灯，用来显示本机 AI 编码 Agent 的当前状态。Agent 工作时显示绿灯，等待权限或选择时显示黄灯，完成或失败时显示红灯。窗口可以拖到屏幕任意位置、始终置顶并跨桌面显示；平时收成 124×124 的小灯，需要操作时自动展开。

仓库同时保留原来的 VS Code 扩展 `Terminal Agent Traffic Light`，用于监控 VS Code 集成终端。

## Agent Light 功能

- 苹果 Control Center 风格的深色液态玻璃界面
- 透明无边框、始终置顶、跨工作区和全屏空间显示
- 124×124 紧凑模式，悬停显示拖动、展开、置顶和关闭按钮
- 多 Agent 会话栏，等待确认的会话自动排在前面
- 完整显示权限问题、命令、路径和可用选项
- Claude Code、Codex 和 OpenCode 的权限快捷回答
- 状态变化提示音、键盘焦点样式和 `prefers-reduced-motion`
- 本机随机端口、随机令牌和 SSE 实时状态同步

## 支持的 Agent

| Agent | 官方接入 | 状态监控 | 权限快捷回答 |
| --- | --- | --- | --- |
| Claude Code | Hooks | 会话、提示、通知、停止、失败 | 允许一次 / 拒绝 |
| Codex | Hooks | 会话、提示、工具、子 Agent、停止 | 允许 / 拒绝 |
| Cursor | Hooks | 会话、提示、工具、响应、停止、错误 | 暂不提供 |
| OpenCode | Plugin + SDK | 权限、会话、消息、工具 | 仅本次 / 本次会话始终允许 / 拒绝 |
| Hermes | Shell Hooks | 会话、LLM、工具、子 Agent、权限前后 | 暂不提供 |
| VS Code 终端 | Shell Integration | 命令输出与阻塞提示 | 固定安全回复 |

Codex 的 `PermissionRequest` 当前覆盖需要审批的 Bash、`apply_patch` 和部分 MCP 工具。Codex 桌面应用或 IDE 是否触发这些 Hook，取决于对应版本是否使用同一 Hook 引擎；Agent Light 不把尚未真实触发过的表面声明为完全支持。

## 安装独立 macOS 应用

当前产物支持 Apple 芯片 macOS：

```text
Agent Light.app
Agent-Light-0.3.0-darwin-arm64.dmg
```

打开 DMG，把 `Agent Light.app` 拖到 `/Applications`。当前开发包使用 ad-hoc 签名，尚未 Apple 公证；首次启动若被 Gatekeeper 拦截，请在 Finder 中右键应用并选择“打开”。

### 安装 Agent Adapter

将应用放入 `/Applications` 后，在终端执行：

```sh
APP="/Applications/Agent Light.app"
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/Agent Light" \
  "$APP/Contents/Resources/app/scripts/install-agent-adapters.mjs" all
```

也可以只安装一个接入：

```sh
# 可选值：claude、codex、cursor、opencode、hermes
APP="/Applications/Agent Light.app"
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/Agent Light" \
  "$APP/Contents/Resources/app/scripts/install-agent-adapters.mjs" codex
```

安装器会保留已有配置并原子更新以下位置：

- Claude Code：`~/.claude/settings.json`
- Codex：`~/.codex/hooks.json`
- Cursor：`~/.cursor/hooks.json`
- OpenCode：`~/.config/opencode/plugins/agent-light.js`
- Hermes：`~/.hermes/config.yaml`

安装后重启相应 Agent。Codex 还需要在 CLI 中运行 `/hooks`，审阅并信任新增 Hook；Hermes 第一次发现每组 shell hook 时会请求同意，可用 `hermes hooks doctor` 检查安装状态。

从源码开发时可以直接运行：

```sh
npm run install:adapters
node scripts/install-agent-adapters.mjs codex
```

测试安装脚本时应使用临时 `HOME`，不要拿真实用户配置做测试数据。

## 状态说明

| 状态 | 含义 |
| --- | --- |
| 🟢 绿灯 | Agent 正在运行，不需要操作 |
| 🟡 黄灯 | Agent 正在等待权限、确认或选项输入 |
| 🔴 红灯 | Agent 已完成、失败或异常停止 |
| ⚪ 灰灯 | Agent 空闲、离线或尚未连接 |

## 从源码运行 Agent Light

需要 Node.js 20 或更新版本以及 npm：

```sh
git clone https://github.com/S7arFish/Terminal-Agent-Traffic-Light.git
cd Terminal-Agent-Traffic-Light
npm install
npm run desktop
```

开发与验证：

```sh
npm run typecheck
npm run test:unit
npm run build
```

生成独立 App 和 DMG：

```sh
npm run package:app
```

输出位于 `releases/`。打包流程会重新执行类型检查、测试和构建，生成 `.icns` 图标，写入 `0.3.0` Info.plist，进行 ad-hoc codesign 并创建压缩 DMG。

## VS Code 扩展

VS Code 版本会监控当前集成终端，识别 `Proceed? (y/n)`、`[Y/n]`、覆盖确认、权限确认和编号选项，并在侧边栏或旧版悬浮窗中提供固定安全回复。

从源码按 `F5` 启动 Extension Development Host。可用命令包括：

- `Terminal Agent Traffic Light: Select Active Terminal`
- `Terminal Agent Traffic Light: Start Monitoring`
- `Terminal Agent Traffic Light: Stop Monitoring`
- `Terminal Agent Traffic Light: Show Dashboard`
- `Terminal Agent Traffic Light: Open Floating Window`
- `Terminal Agent Traffic Light: Close Floating Window`

生成 VSIX：

```sh
npm run package:mac
```

## 工作原理与隐私

Agent Light 只监听 `127.0.0.1` 的随机端口。连接信息写入 `~/Library/Application Support/Agent Light/connection.json`，权限为 `0600`，包含随机 32 字节令牌和 `agent-light/1` 协议版本。

Adapter 只把状态、权限问题、命令或路径发送到本机 Agent Light，不上传到云端。UI 的回复必须匹配当前会话、当前请求 ID 和 Adapter 明确提供的固定操作；任意文本不能通过这个接口注入 Agent。

官方接入文档：

- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Codex Hooks](https://developers.openai.com/codex/hooks)
- [Cursor Hooks](https://cursor.com/docs/hooks)
- [OpenCode Plugins](https://opencode.ai/docs/plugins/)
- [OpenCode Permissions](https://opencode.ai/docs/permissions/)
- [Hermes Event Hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/)

## 已知限制

- 独立安装包目前只有 Apple Silicon 版本，尚未公证，也没有自动更新。
- Cursor 和 Hermes 目前只做官方 Hook 生命周期监控，权限仍在它们自己的界面回答。
- Codex 非托管 Hook 安装后必须由用户信任；具体工具覆盖随 Codex Hook 引擎版本变化。
- VS Code 终端监控依赖 Shell Integration，SSH 子 shell 和复杂自定义终端可能无法识别。

## License

[MIT](LICENSE)
