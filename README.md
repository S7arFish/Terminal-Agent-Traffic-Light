# Terminal Agent Traffic Light

一个面向 VS Code Vibecoding / Terminal Agent 工作流的状态提醒扩展。

它会监控 VS Code 集成终端：Agent 正在运行时显示绿灯，需要你确认或选择时显示黄灯，命令结束或失败时显示红灯。除了 VS Code 侧边栏，它还能打开一个独立、可拖动、始终置顶的 macOS 悬浮窗。切去浏览器、视频或其他软件时，也能随时看到 Agent 是否在等待你。

## 主要功能

- 监控当前 VS Code 集成终端的命令输出
- 识别 `Proceed? (y/n)`、`[Y/n]`、覆盖确认、权限确认及编号选项
- 黄灯时显示 Agent 的完整问题和对应选项
- 可直接在面板或悬浮窗中发送安全的固定回复
- 独立于 VS Code 的桌面悬浮红绿灯
- 悬浮窗可拖动、置顶，并可显示在 macOS 全屏空间
- 平时保持紧凑尺寸，鼠标悬停时显示工具栏
- 需要确认时自动展开，回复后自动收回
- 问题较长时根据内容自适应面板高度
- 支持 VS Code 启动时自动打开悬浮窗

## 状态说明

| 状态 | 含义 |
| --- | --- |
| 🟢 绿灯 | Agent 或终端命令正在运行，暂时不需要操作 |
| 🟡 黄灯 | Agent 正在等待确认、权限或选项输入 |
| 🔴 红灯 | 命令已经结束或执行失败 |
| ⚪ 灰灯 | 当前终端无法监控或尚未选择终端 |

## 安装

### 从 VSIX 安装

1. 下载对应平台的 `.vsix` 安装包。
2. 打开 VS Code 的“扩展”页面。
3. 点击右上角 `…`，选择“从 VSIX 安装…”。
4. 选择安装包并在安装完成后重新加载 VS Code。

也可以在终端执行：

```sh
code --install-extension terminal-agent-traffic-light-0.2.0-darwin-arm64.vsix
```

当前桌面悬浮窗发行包支持 **Apple 芯片 macOS（M1/M2/M3/M4/M5）**。Intel Mac、Windows 和 Linux 版本尚未发布。

### 从源码运行

需要 Node.js、npm 和 VS Code：

```sh
git clone https://github.com/S7arFish/Terminal-Agent-Traffic-Light.git
cd Terminal-Agent-Traffic-Light
npm install
npm run build
```

用 VS Code 打开项目，然后按 `F5` 启动 Extension Development Host。

## 使用方法

1. 在 Extension Development Host 或已安装扩展的 VS Code 中打开集成终端。
2. 扩展默认监控当前活动终端。
3. 点击 Activity Bar 中的红绿灯图标查看侧边栏状态。
4. 按 `Cmd+Shift+P` 打开命令面板，运行：

```text
Terminal Agent Traffic Light: Open Floating Window
```

悬浮窗打开后可以拖到屏幕任意位置。鼠标移到紧凑红绿灯上会显示移动、置顶和关闭工具；检测到需要交互的问题时，窗口会展开并显示问题与选项。

其他可用命令：

- `Terminal Agent Traffic Light: Select Active Terminal`
- `Terminal Agent Traffic Light: Start Monitoring`
- `Terminal Agent Traffic Light: Stop Monitoring`
- `Terminal Agent Traffic Light: Show Dashboard`
- `Terminal Agent Traffic Light: Close Floating Window`

## 设置

在 VS Code 设置中搜索 `Terminal Agent Traffic Light`：

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `terminalAgentTrafficLight.enabled` | `true` | 启用终端监控 |
| `terminalAgentTrafficLight.autoSelectActiveTerminal` | `true` | 自动跟随活动终端 |
| `terminalAgentTrafficLight.playSound` | `true` | 需要操作时播放提示音 |
| `terminalAgentTrafficLight.autoOpenFloatingWindow` | `false` | VS Code 启动后自动打开悬浮窗 |
| `terminalAgentTrafficLight.maxBufferedCharacters` | `8000` | 内存中保留的最大终端字符数 |
| `terminalAgentTrafficLight.customPromptPatterns` | `[]` | 自定义需要确认的正则表达式 |
| `terminalAgentTrafficLight.showCompletionAsRed` | `true` | 命令结束后显示红灯 |

## 测试黄灯与长问题

简单确认：

```sh
node -e 'process.stdout.write("Proceed? (y/n) "); process.stdin.once("data", d => { console.log("received:", d.toString().trim()); process.exit(0) })'
```

带多个选项的长问题：

```sh
node -e 'process.stdout.write("Claude needs permission to continue the database migration. Choose how this command should proceed:\n1. Yes, run it once\n2. Yes, and remember this choice\n3. No, cancel\nEnter your choice: "); process.stdin.once("data", d => { console.log("selected:", d.toString().trim()); process.exit(0) })'
```

## 开发与打包

```sh
npm run typecheck
npm run test:unit
npm run build
```

生成 Apple 芯片 macOS 安装包：

```sh
npm run package:mac
```

输出文件位于：

```text
releases/terminal-agent-traffic-light-0.2.0-darwin-arm64.vsix
```

打包脚本会将 Electron macOS 运行时压缩后放入 VSIX。安装扩展后，首次打开悬浮窗时会把运行时解压到 VS Code 的扩展存储目录。

## 工作原理与隐私

扩展依赖 VS Code Shell Integration 的命令执行 API，只读取命令开始后产生的输出。bash、zsh、fish 和 PowerShell 通常可以使用；SSH 子 shell、复杂自定义启动配置、未启用 Shell Integration 的终端或某些任务终端可能无法监控。

终端内容仅保存在内存中的最后一段缓冲区，不写入日志，也不会上传到网络。桌面端只连接本机 `127.0.0.1`，每次扩展启动都会生成新的随机令牌。快捷回复会验证终端、命令区块和固定选项 ID，悬浮窗不能向终端写入任意文本。

## 已知限制

- 只能监控 VS Code 集成终端，不能直接监控 VS Code 外部的独立终端。
- 识别效果取决于 Agent 实际输出的提示格式，可通过自定义正则补充规则。
- 当前带桌面悬浮窗的发行包仅提供 Apple 芯片 macOS 版本。

## License

[MIT](LICENSE)
