# 贡献指南

欢迎缺陷修复、应用兼容性报告和小范围功能改进。提交较大的功能前，请先开 Issue 描述使用场景，避免增加常驻负担或破坏紧凑界面。

## 开发

使用 Windows 10/11 x64、Node.js 24、npm、Git、Python 和 Visual Studio 2022 的“使用 C++ 的桌面开发”工具（含 Windows SDK）。`npm ci` 会编译取词兼容补丁；应用用户无需这些开发工具。在仓库根目录运行：

```powershell
npm ci
npm run setup:electron
npm start
```

配置在设置页填写；项目不需要 `.env`，不要把真实 API Key、用户配置或数据库放进源码。

Linux x64 也可开发：使用 Node.js 24 和 Git，安装 Electron 与 selection-hook 的系统运行库，执行相同的 `npm ci`、`setup:electron` 和 `npm start`。Linux 直接使用上游原生预编译包，不构建 Windows 补丁。Wayland 需要兼容 data-control 的合成器和 XWayland；依赖、取词限制和路径见 [Linux 说明](docs/LINUX.md)。

`npm run test:clipboard-history` 检查 Windows 历史清理保护规则与系统接口。历史关闭或容量接近上限时跳过真实新增/删除测试，不会清空历史或修改系统开关；测试结束后仅移除本次生成的测试条目。

## 检查

```powershell
npm run check
# 窗口、IPC、原生取词和发布前，还需要在交互式 Windows 桌面运行：
npm run smoke
```

`check` 包含 TypeScript 检查、核心逻辑与设置状态测试和资源构建。GitHub Actions 在 Windows 上运行它及 `smoke:records`。`smoke` 将设置界面、记录/本地模型和原生取词分为三个独立 Electron 场景，每组使用隔离配置，不依赖真实 API Key。截图、报告、数据库写入忽略的 `work/` 目录；可用 `smoke:ui`、`smoke:records`、`smoke:native` 单独执行，最近一次调用的汇总见 `work/smoke-summary.json`。运行时避免操作测试窗口；UI Automation 受桌面会话和焦点影响，失败时先查看报告，不应仅反复重试以掩盖问题。普通 CI 不运行需要交互桌面的 UIA 测试。

已观察到原生 UIA 受控选区读取间歇性失败，原因尚未确认；再次运行成功不代表该问题已修复。

Linux CI 在 Xvfb 下运行 `check`、`smoke:records` 和解包版启动验证。完整 Linux `smoke` 应在隔离的交互桌面或嵌套合成器执行，并设置 `GLINT_TEST_DESKTOP=1` 确认该会话可丢弃，测试会替换 PRIMARY 选区；这个变量本身不会创建隔离。Wayland 的 portal 授权仍需人工检查。测试不能将缺少显示会话、协议或原生库的情况当作通过。

## 打包与发布

Linux 使用 `npm run package:linux` 生成 AppImage、tar.gz 和单独的校验文件；`npm run package:verify:linux -- --appimage` 检查归档、解包版与 AppImage 的显式 X11 和直接启动路径。现有自动 Release 流程仍仅发布 Windows 文件。

```powershell
npm run package
npm run package:verify
npm run package:verify-installer
```

`package` 使用 electron-builder 生成 Windows x64 安装版、单文件 portable 和 SHA-256 校验文件，输出到忽略的 `release/`。`package:verify` 检查归档内容和原生模块解包，并真实启动打包应用与 portable，验证取词引擎、沙箱接口和 SQLite 初始化，不依赖桌面选区。

完整测试场景独立编译到 `work/`，不再随正式包分发；原 `smoke:packaged` 已替换为开发 smoke 和打包启动自检两部分。`npm run verify:release` 依次执行代码检查、完整 smoke、打包和打包自检，任一步失败都会返回失败。更多内容见 [发布流程](docs/RELEASING.md)。

`package:verify-installer` 临时安装到 `work/installer-check-*`，验证开始菜单入口与应用启动后卸载，检查注册项清理。它会暂时添加当前用户的安装注册项和快捷方式，因此检测到已有安装版 Glint 时会拒绝运行；可使用干净 Windows 用户或 GitHub 的临时 runner。

`README.md` 和 `README.en.md` 面向产品用户，功能和下载说明应同步更新。源码构建、测试和内部结构说明放在本文件及 `docs/`。界面目前仍为中文，README 切换不改变界面语言。

## 设计边界

界面使用 React 与官方 Fluent UI React v9，入口为 `src/renderer.tsx`，页面、组件和状态管理位于 `src/ui/`，具体边界见 [架构说明](docs/ARCHITECTURE.md)。CSS 主要负责 Glint 的紧凑布局；控件交互、焦点和主题使用 Fluent，避免重新模拟原生控件。额外的官方动效预设集中在 `src/ui/motion.ts`，其 preview 依赖固定版本，升级时需要检查。前端库作为构建依赖打入 `dist/renderer.js`，不额外分发完整的前端 `node_modules`。

- 原生取词留在 utility process 中，避免 UIA 阻塞主线程。
- 渲染进程保持 sandbox、context isolation 和最小 preload 接口。
- 凭据、模型请求和数据库由主进程管理；日志不含密钥、原文或模型回复。
- 控件与动作图标统一使用离线 Lucide；品牌图形见 `docs/BRAND.md`。
- 修改数据库必须兼容旧记录并验证迁移；不得默认自动记录选中文字。
- 引用外部实现时记录来源并检查许可。不能直接复制 Cherry Studio 的 AGPL 应用代码后仍按 MIT 发布。

## Pull Request

描述问题、改动后的行为和验证结果。UI 截图只使用演示文字。功能、数据或依赖有变化时同步更新文档、锁文件、变更记录和许可说明。避免顺手全仓格式化。提交的原创贡献按本项目 MIT 许可证提供，请确认有权提交相应代码和素材。

报告取词问题时请包含目标应用版本、进程是否提权、触发方式和脱敏复现步骤；不要上传整个用户目录、完整配置或记录数据库。
