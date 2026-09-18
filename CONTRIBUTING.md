# 贡献指南

欢迎缺陷修复、应用兼容性报告和小范围功能改进。提交较大的功能前，请先开 Issue 描述使用场景，避免增加常驻负担或破坏紧凑界面。

## 开发

使用 Windows 10/11 x64、Node.js 24 和 npm，在仓库根目录运行：

```powershell
npm ci
npm run setup:electron
npm start
```

配置在设置页填写；项目不需要 `.env`，不要把真实 API Key、用户配置或数据库放进源码。

## 检查

```powershell
npm run check
# 窗口、IPC、原生取词和发布前，还需要在交互式 Windows 桌面运行：
npm run smoke
```

`check` 包含 TypeScript 检查、核心行为测试和资源构建；GitHub Actions 在 Windows 上运行它。`smoke` 启动独立 Electron 实例，使用本地假模型和隔离配置，不依赖真实 API Key。它会打开测试窗口，截图、报告、数据库写入忽略的 `work/` 目录。运行时避免操作测试窗口；UI Automation 受桌面会话和焦点影响，失败时先查看报告，不应仅反复重试以掩盖问题。普通 CI 不运行需要交互桌面的测试。

## 设计边界

- 原生取词留在 utility process 中，避免 UIA 阻塞主线程。
- 渲染进程保持 sandbox、context isolation 和最小 preload 接口。
- 凭据、模型请求和数据库由主进程管理；日志不含密钥、原文或模型回复。
- 控件与动作图标统一使用离线 Lucide；品牌图形见 `docs/BRAND.md`。
- 修改数据库必须兼容旧记录并验证迁移；不得默认自动记录选中文字。
- 引用外部实现时记录来源并检查许可。不能直接复制 Cherry Studio 的 AGPL 应用代码后仍按 MIT 发布。

## Pull Request

描述问题、改动后的行为和验证结果。UI 截图只使用演示文字。功能、数据或依赖有变化时同步更新文档、锁文件、变更记录和许可说明。避免顺手全仓格式化。提交的原创贡献按本项目 MIT 许可证提供，请确认有权提交相应代码和素材。

报告取词问题时请包含目标应用版本、进程是否提权、触发方式和脱敏复现步骤；不要上传整个用户目录、完整配置或记录数据库。
