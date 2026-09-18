<img src="docs/assets/glint.svg" width="64" alt="Glint">

# Glint

**选中文字，即刻行动。**

**简体中文** · [English](README.en.md)

Glint 是一款可定制的 Windows 划词助手。阅读时遇到外语、写作时想调整措辞，选中文字即可翻译、润色、搜索或复制，无需来回切换应用。

[下载 Glint](https://github.com/yshsharke/Glint/releases) · [反馈问题](https://github.com/yshsharke/Glint/issues) · [更新记录](CHANGELOG.md)

<img src="docs/assets/settings.png" width="760" alt="Glint 设置：自定义动作、提示词和浮条">

## 下载与安装

适用于 **Windows 10 / 11 x64**。下载版已包含运行所需组件，无需安装 Node.js、Python 或其他开发工具。

在 [Releases](https://github.com/yshsharke/Glint/releases) 中选择版本，展开 **Assets**：

| 文件 | 适合你，如果…… |
| --- | --- |
| `Glint-版本号-windows-x64-portable.exe` | 想免安装使用：放到喜欢的文件夹，双击运行即可。启动需要短暂解压。 |
| `Glint-版本号-windows-x64-setup.exe` | 想常驻使用：按向导选择安装位置，通过开始菜单启动，并可在 Windows 设置中卸载。 |

GitHub 自动生成的 **Source code** 是源码，不是应用下载包。目前发布的是未签名的预览版本，Windows 可能提示“未知发布者”。请从本仓库 Releases 下载；可用同页的 `SHA256SUMS.txt` 核对文件。

**Portable 是免安装版，设置和记录仍保存在当前 Windows 用户的 AppData 中，不随 exe 移动。** 安装版和 portable 版共享这些数据，同一用户同时只运行一个 Glint。

## 一分钟上手

1. 打开 Glint，在「模型」中填写服务商提供的 API 地址、模型名称和 API Key，点击「保存设置」。支持 OpenAI 兼容接口，也可以连接本地模型服务。Glint 不提供内置模型或额度。
2. 在其他应用里选中文字，浮条会自动出现。也可以按 **Ctrl + Alt + G** 主动取词。
3. 点击「翻译」「润色」等动作，结果会显示在独立的小卡片里。复制和搜索无需配置模型。

浮条左侧的 Glint 图标可打开设置。关闭设置窗口后，Glint 会继续在系统托盘运行；双击托盘图标重新打开，使用托盘菜单或设置左下角「退出 Glint」完全退出。

## 把浮条变成自己的工具

- **不止翻译。** 修改提示词，添加自己的 AI 动作；最多 12 个动作，自由排序、启用或隐藏。
- **统一的图标。** 从内置 Lucide 图标库中搜索和选择，离线可用。
- **控制触发方式。** 选择自动划词或快捷键模式，排除不想触发的应用；需要时开启剪贴板回退。
- **贴近 Windows 的外观。** 浅色、深色或跟随系统，搭配四种强调色和两种浮条密度。

在「动作」中编辑提示词时，用 `{text}` 表示选中的文字。例如：

> 将下面这段话改写得简洁、自然，保留原意，只输出修改后的文本：{text}

## 结果随手处理

<img src="docs/assets/result.png" width="480" alt="翻译结果卡片：停止、重试、复制和记录">

结果逐步显示，可以停止、重试或一键复制。卡片顶部显示功能和来源应用，原文可展开查看。

内置「翻译」和「润色」还提供 **记录** 按钮，把原文、结果和来源进程保存在本机。两类记录分开保存；同一卡片重试后再次记录，会更新已有结果。当前尚无记录浏览和搜索界面。

## 数据由你掌握

只有点击 AI 动作才会将文字发送给你配置的模型服务；点击搜索会在浏览器中交给 Google。Glint 不包含遥测，选中文字不会自动存入记录数据库。

API Key 使用 Windows 系统保护加密保存；手动记录的原文和结果保存在未加密的本地 SQLite 数据库中。设置位于 `%APPDATA%\Glint`，记录和日志位于 `%LOCALAPPDATA%\Glint`。更多内容见 [隐私说明](docs/PRIVACY.md)。

## 常见问题

**选中文字后没有浮条？** 先尝试 `Ctrl + Alt + G`，检查「触发」中的排除名单和「诊断」中的引擎状态。部分 PDF、终端、受保护或管理员窗口不提供可读取的文本；Glint 暂不支持 OCR，不能保证所有应用都能取词。

**模型连接失败？** 核对 API 地址、端口、模型名称和密钥。本地服务可能使用 `http://` 而非 `https://`；当前没有内置代理配置，不保证自动使用 Windows 系统代理。

**如何更新？** 当前需要手动下载新版。先完全退出 Glint，再运行新版安装程序，或替换 portable exe；同一 Windows 用户的设置和记录会保留。暂无自动更新。

**如何卸载？** 安装版可从 Windows「已安装的应用」卸载；portable 版退出后删除 exe 即可。两者都会保留个人数据，如需一并清除，请按 [隐私说明](docs/PRIVACY.md#删除与备份) 操作。

当前界面为中文。其他平台、ARM64、OCR、原位替换和多轮聊天暂不支持；尚未承诺常驻内存上限。

## 开源与致谢

Glint 采用 [MIT 许可证](LICENSE)。感谢 [selection-hook](https://github.com/0xfullex/selection-hook)、[Electron](https://github.com/electron/electron) 和 [Lucide](https://lucide.dev)；划词架构参考了 Cherry Studio 的思路，详见 [参考记录](docs/REFERENCES.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。

想参与开发？请阅读 [贡献指南](CONTRIBUTING.md)。安全问题请查看 [安全报告说明](SECURITY.md)。
