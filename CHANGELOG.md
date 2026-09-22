# Changelog

## Unreleased

- 新增 Linux x64 的 X11 / Wayland PRIMARY 取词与 XWayland 浮条支持，保留独立取词进程；Wayland 默认快捷键触发，不支持来源应用排除。
- Linux 设置与诊断按实际能力显示，浮条提供关闭按钮；记录和日志采用 XDG 目录，API Key 必须使用系统密钥环加密。
- 切换桌面会话时保留应用排除规则和取词偏好，独立保存 Wayland 触发方式；Linux 原生 smoke 需显式确认使用可丢弃桌面。
- 修复 AppImage 提取启动后的 XWayland 重启路径，并拒绝 Linux 启动器静默关闭 Chromium 沙箱。
- 新增 Linux AppImage/tar 打包与启动验证、平台单元测试、Linux 原生 smoke 和 CI 检查，补充中英文使用与开发文档。

- Add Linux x64 PRIMARY capture on X11 and compatible Wayland compositors, with XWayland floating windows and an isolated native host. Wayland defaults to shortcut capture and does not support app exclusions.
- Reflect Linux capabilities in settings and diagnostics, add explicit toolbar dismissal, use XDG data/log paths and require a real system keyring for API keys.
- Preserve capture preferences and exclusions across desktop sessions, save Wayland trigger choices separately, and require disposable-desktop acknowledgement for Linux native smoke.
- Preserve AppImage extraction through XWayland relaunch and refuse Linux launchers that silently disable Chromium's sandbox.
- Add Linux AppImage/tar packaging and startup verification, platform tests, Linux native smoke coverage, CI checks and documentation.

## 0.5.0 — 2026-09-21（预览版）

- 触发页新增「辅助接口」「复制取词」「按需复制」三种全局取词方式；旧剪贴板开关自动迁移，切换方式会重启取词引擎并丢弃旧选区。
- 复制取词直接绕过辅助接口，解决 Zotero PDF 返回错误选中文字的场景；复制完成后恢复剪贴板，复制失败不回退使用辅助接口文字。
- 恢复旧内容时标记为不进入 Windows 剪贴板历史；尝试按 ID、时间与内容清理本次临时取词记录，无法确定归属或期间有其他复制时保留记录。
- 修复多显示器下结果卡片打开在错误屏幕的问题；新建和复用卡片都跟随选区所在屏幕。
- 浮条执行动作时校验选区编号，拒绝过期选区；补充仅包含元数据的取词和模型请求日志。
- 将 selection-hook 兼容补丁纳入可重复构建流程，增加三种取词方式、剪贴板恢复及打包原生模块校验。

- Add three global capture modes: accessibility, direct copy, and copy on demand. Migrate the previous clipboard preference and discard in-flight selections when switching modes.
- Direct copy bypasses accessibility providers, addressing incorrect selected text in Zotero PDFs. Restore the clipboard afterward and never accept accessibility text after a failed direct copy.
- Exclude restored content from Windows clipboard history and attempt to remove only the temporary capture entry, preserving ambiguous records and concurrent copies.
- Keep new and reused result cards on the display containing the selection.
- Reject stale toolbar selections and add metadata-only capture and model-request diagnostics.
- Build the selection-hook compatibility patch reproducibly and test capture strategies, clipboard restoration, and the packaged native binary.

## 0.4.0 — 2026-09-20（预览版）

- 历史记录支持单条删除；详情采用独立滚动的上下两栏，顶部集中提供复制原文、复制结果和删除按钮。
- 动作、触发、诊断页面充分利用窗口高度；优化结果卡片按钮间距、原文展开按钮和请求中的圆点动画。
- 拆分界面组件，集中管理设置草稿、保存和撤销，统一图标与 IPC 类型约束。
- 完整测试从正式构建中分离，按界面、记录/模型与原生取词分组；补充状态回归测试和发布验证入口。
- 修正原生取词测试的鼠标目标定位，检查真实 UIA 取词及来源进程，避免桌面焦点与鼠标位置不一致造成误报。

- Delete individual history entries; read source and result in independently scrollable panes with header actions.
- Improve full-height settings layouts, result-card button spacing, source toggle styling, and loading dots.
- Separate UI components and centralize settings draft/save/revert state, shared icons, and typed IPC contracts.
- Keep full test scenarios out of production builds; add isolated smoke groups, state regression tests, and a release verification command.
- Position the native test fixture under the OS pointer and verify UIA capture and source-process metadata to avoid failures caused by mismatched focus and pointer targets.

## 0.3.0 — 2026-09-18（预览版）

- 移除浮条复制动作，动作类型统一为「指令」「搜索」；升级时自动清理旧复制动作，保留结果卡片和历史记录的复制功能。
- 所有指令动作均支持独立 SQLite 记录，包括解释和自定义动作；新增动作时填写显示名称和唯一英文名称，自动兼容旧配置及翻译、润色数据库。
- 新增「历史」页，按指令动作分类浏览本地记录，标签同步动作名称和图标，分页查看原文、结果、来源进程和时间，支持复制与刷新。

## 0.2.0 — 2026-09-18（预览版）

- 将设置页、划词浮条和结果卡片迁移到 React 与官方 Fluent UI React v9，保留紧凑布局和 Lucide 动作图标。
- 使用 Fluent 输入框、下拉菜单、开关、标签导航、图标选择弹窗和通知；接入页面淡入、原文展开与加载动画，遵循减少动态效果设置。
- 保留编辑期间的输入焦点与未保存设置，修正弹层背景遮挡和小尺寸布局；补充键盘、焦点恢复及弹层检查。
- 构建自动收集前端依赖的完整许可证；React 与 Fluent 打包到界面资源，无需用户额外安装。
- 统一导航、动作列表与关闭按钮的交互颜色，优化动作编辑和浮条密度选择布局；诊断页仅最近事件列表内部滚动。
- 设置页自动显示项目完整版本号，避免页面版本与安装包版本不一致。
- 托盘左键单击打开设置；右键菜单提供打开设置、停止或启用划词以及退出。

## 0.1.2 — 2026-09-18（预览版）

- 首个 Windows 安装版与 portable 下载版本。
- 修复 Windows 短路径中的 `~` 被不同 URL 编码方式处理后，portable 界面 IPC 被拒绝的问题；同时严格拒绝名称相似的其他文件。
- 为短路径、编码路径和非受信来源添加回归测试。

## 0.1.1 — 2026-09-18（源码；二进制发布未通过检查）

- 修正打包启动检查的时序问题：等待界面完成异步初始化，避免把仍在渲染的界面误判为启动失败。
- 自动检查失败时保留完整错误堆栈，便于诊断。

## 0.1.0 — 2026-09-18（源码；二进制发布未通过检查）

- Windows 自动划词、快捷键触发、应用排除与可选剪贴板回退。
- 可定制动作、离线 Lucide 图标、紧凑浮条和 Windows 风格设置界面。
- OpenAI 兼容模型流式结果、停止、重试和复制。
- 翻译与润色分别记录到本地 SQLite，保存原文、结果、来源进程和时间。
- 独立原生取词进程、受限 IPC、加密密钥、AppData 数据和轮换日志。
- MIT 许可、贡献与隐私说明、第三方许可随构建输出、Windows CI。
- Windows x64 安装向导与单文件 portable，Release 自动构建和 SHA-256 校验文件。
- 面向用户的中英文 README，通过顶部链接切换。

当前二进制未签名，尚未提供自动更新或完整第三方应用兼容矩阵。Portable 免安装但仍将数据保存在 AppData。
