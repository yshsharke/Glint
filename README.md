<img src="docs/assets/glint.svg" width="64" alt="Glint logo">

# Glint

选中文字，即刻行动。

一个面向 Windows 的可定制划词助手原型，使用 **Electron + TypeScript + selection-hook**。

A customizable selection assistant for Windows. Select text, then translate, polish, search or copy from a compact toolbar. Source prototype; Windows 10/11 x64, Node.js 24, MIT license.

当前版本 **0.1.0 / 源码预览**，尚无安装包，也尚未测定常驻内存基线。支持平台为 Windows 10/11 x64；其他平台未验证。

<img src="docs/assets/settings.png" width="760" alt="Glint 动作设置与划词浮条预览">

<img src="docs/assets/result.png" width="480" alt="翻译结果卡片，底部含停止、重试、复制和记录按钮">

截图来自隔离测试环境，仅包含演示文字。

## 启动

需要 Node.js 24（含 npm）和 Windows 10/11 x64。克隆本仓库或下载源码后，在项目根目录打开 PowerShell：

```powershell
npm ci
npm run setup:electron
npm start
```

`npm start` 会重新构建并启动。当前是源码原型，尚未制作安装包。

`npm ci` 按锁文件安装依赖；当前 Electron 版本需要随后显式运行 `npm run setup:electron` 下载桌面运行时。若下载中断，恢复网络后重新运行该命令。通常不需要自行编译 C++：selection-hook 提供 Windows x64 预编译模块。

## 使用

1. 在「动作」中新增、删除、排序或停用动作；AI 提示词使用 `{text}` 引用选中文字，修改后保存。
2. 在「模型」中填写 OpenAI 兼容 API 根地址、模型 ID 和可选 API Key，并保存。
3. 在其他应用中选择文字，或按 `Ctrl+Alt+G` 呼出浮条。
4. 点击复制、Google 搜索，或翻译/解释/润色等自定义 AI 动作。

浮条左侧的 Glint 图标可直接打开设置页。

设置页面的「测试浮条」使用固定演示文字，不代表已验证其他应用取词。点击其 AI 动作时会使用你配置的模型。

关闭设置窗口后划词继续在托盘运行，并释放设置窗口的渲染进程；关闭前请保存更改。双击托盘图标重新打开，通过托盘菜单或左下角「退出 Glint」完整退出。

## 当前能力

- 自动划词和快捷键取词；应用排除名单；可选剪贴板回退。
- 自定义动作名称、图标、提示词、启用状态和顺序，最多 12 个动作。
- 图标统一使用 Lucide：点击「更换图标」可选常用图标或搜索全库；支持中文常用关键词、英文名称和标签。离线使用，分页显示，搜索索引按需加载。
- 紧凑的 Windows 风格设置界面；默认跟随系统主题，支持浅色、深色、四种强调色和两种浮条密度。
- 浮条宽度按动作计算，横向滚动支持溢出动作。
- OpenAI 兼容模型的流式输出、取消和结果复制。
- 结果卡片使用可拖动的自定义顶栏，同一行显示功能和来源进程；右上角关闭，翻译和润色卡片底部按「停止、重试、复制、记录」排列，其他动作仅显示前三个按钮。「记录」使用主题色，将当前卡片的原文、结果和来源进程保存到本地 SQLite；生成期间或结果为空时不可记录。记录后显示「已记录」，同一卡片重试后可再次点击，更新原记录的结果，不新增副本；停止生成后可手动保存已有的部分结果。
- 独立取词进程；手动取词超时可隔离；支持重新启动引擎。
- 诊断信息仅含来源应用、取词方式、字符数等；原文和结果仅在手动点击「记录」后持久化。

## 数据与限制

- 正常配置保存在 `%APPDATA%\Glint\settings.json`。API Key 使用 Electron safeStorage（Windows 系统保护）加密保存。
- 原文记录数据库启动时初始化于 `%LOCALAPPDATA%\Glint\data\`：翻译使用 `translations.sqlite`，润色使用 `polishing.sqlite`，两者完全独立。`records` 表保存卡片 ID、原文 `original_text`、结果 `result_text`、划词来源进程 `process_name` 和 UTC 首次记录时间 `created_at`。不保存密钥。旧版数据库自动升级，保留旧记录，未曾存储的结果和进程名留空。验证运行使用`work/smoke-profile/data/` 下的独立测试数据库。
- 首次升级会从项目 `work/` 的两个旧库迁移记录，逐条核对原文和时间，不覆盖冲突记录；迁移成功后不再重复导入。旧库保留为备份，新记录仅写入 AppData。
- 正式运行日志位于 `%LOCALAPPDATA%\Glint\logs\glint.log`，每个文件上限约 1 MiB，保留 3 个轮换备份。记录生命周期、模型请求状态/耗时/错误码及数据库写入状态，不包含原文、回复正文或密钥。测试日志位于 `work/smoke-profile/logs/`。
- 只有点击 AI 动作时才将选中文字发送至配置的 API；搜索会将查询交给默认浏览器中的 Google。
- 复制取词默认关闭。终端默认排除；开启回退仍受目标应用和权限限制，不能保证所有应用成功。
- 开发模式会过滤 `electron.exe` 以避免自身界面触发；其他以这个进程名运行的开发版 Electron 应用也会被过滤。
- 暂不支持 OCR、原位替换、多轮对话、每动作独立模型、自动更新和打包安装。
- 结果采用纯文本渲染，模型输出不会作为 HTML 执行。
- 尚未对第三方应用做完整兼容矩阵验证，也未承诺常驻内存上限。

详细的数据流、存储位置和删除方法见 [隐私说明](docs/PRIVACY.md)。

## 常见问题

- **没有浮条**：检查托盘是否仍在运行、目标应用是否被排除；尝试 `Ctrl+Alt+G`，并在「诊断」查看引擎状态。部分 PDF、终端、受保护或提权窗口无法提供可访问文本，快捷键和剪贴板回退也不能保证成功。
- **`fetch failed`**：核对地址、端口和 `http://` / `https://`，确认模型服务可达。当前使用 Node.js `fetch`，没有内置代理设置，不保证自动使用 Windows 系统代理。HTTP 401 通常需检查凭据，HTTP 502 则需进一步检查服务端或上游。
- **退出后找不到设置窗口**：关闭窗口会保留托盘进程，双击托盘图标可重新打开；彻底退出使用托盘菜单或设置页左下角按钮。

## 验证

```powershell
npm run check
npm run smoke
```

`check` 执行类型检查、核心边界测试和构建。`smoke` 使用隔离配置与本地假模型，验证原生模块启动、受控文本框的真实 UI Automation 取词、设置保存、不抢焦点的浮条和流式结果；截图与报告位于 `work/`。不会使用真实密钥或向外部模型发送测试文字。

已知验证限制：原生 UI Automation 测试曾出现间歇性读不到受控选区、再次运行通过的情况，原因尚未确认。请在交互式桌面运行并保留失败信息；CI 目前仅运行 `check`，不将桌面取词测试标为稳定覆盖。

## 结构

```text
src/main.ts            窗口、托盘、IPC、模型请求、凭据
src/records.ts         原文、结果、进程 SQLite 记录与旧库迁移
src/runtime-paths.ts   正式数据和测试目录隔离
src/logger.ts          运行日志与轮换
src/selection-host.ts  独立原生取词进程
src/preload.ts         受限界面接口
src/core.ts            类型、设置校验、坐标、SSE
src/renderer.ts       动作编辑、设置、浮条和结果卡片
src/styles.css        主题与组件样式
tests/                核心行为测试
docs/REFERENCES.md    上游参考与许可边界
```

参考 Cherry Studio 的划词架构与兼容处理，直接使用 MIT 许可的 selection-hook。详见 [参考记录](docs/REFERENCES.md)。

## 参与与许可

- [贡献指南](CONTRIBUTING.md)：开发环境、验证与项目边界。
- [安全报告](SECURITY.md)：如何报告安全问题。
- [变更记录](CHANGELOG.md) · [发布检查](docs/RELEASING.md)。
- Glint 原创代码和品牌图形采用 [MIT](LICENSE)；依赖保留各自许可证，见 [第三方声明](THIRD_PARTY_NOTICES.md)。

`package.json` 的 `private: true` 仅用于防止误发布到 npm，不影响源码公开或 MIT 授权。
