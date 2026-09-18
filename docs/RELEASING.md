# 发布检查

当前目标是发布可自行运行的源码预览。`dist/` 只是构建输出，依赖 Electron 和外部原生模块，不能直接当作便携版或安装包发布。

## 第一次公开仓库

1. 创建空 GitHub 仓库，避免额外生成与本地冲突的 README/LICENSE。确认公开的仓库名称和维护者身份，再添加真实 remote；不要在文档中填虚构地址。
2. 检查 `git status --short` 和 `git ls-files --cached --others --exclude-standard`。源码、文档和锁文件应包括在内；`work/`、`dist/`、`node_modules/`、配置、日志和数据库应排除。忽略规则不会移除已经提交过的敏感文件；若曾泄漏密钥，应撤销密钥并清理历史。
3. 使用 GitHub 仓库预期的实际地址更新 `package.json` 的 repository、bugs 和 homepage 信息；当前尚未配置这些字段。
4. 在干净目录按 README 执行 `npm ci`、`npm run setup:electron`、`npm run check`，在交互式 Windows 桌面执行 `npm run smoke`；再用无敏感信息的第三方应用文字验证真实取词。
5. 审阅提交内容，创建首个提交并推送。确认 GitHub 的 `Windows checks` 成功后，再设为默认分支保护的必需检查。
6. 启用 GitHub Private Vulnerability Reporting、Dependabot alerts 和可用的 secret scanning/push protection。仓库设置需要仓库维护权限，源码文件不会自动开启这些功能。

## 后续版本

- 同步 `package.json`、`package-lock.json` 和 CHANGELOG 版本；将“待发布”替换为实际发布日期。
- 检查 `npm audit`，评估依赖升级，不运行未经审阅的 `npm audit fix --force`。
- 执行完整验证，检查旧数据库迁移和记录内容，发布截图只用演示数据。
- 审核 `THIRD_PARTY_NOTICES.md` 和 `dist/licenses/`。新增运行时依赖后更新构建的许可证收集列表，保留完整版权及第三方声明。
- 依赖和 GitHub Actions 更新由 Dependabot 提出 PR，经过检查和审阅再合并。
- 创建与实际发布版本一致的 tag 和 GitHub Release，说明已验证平台及已知限制。

## 提供安装包之前

另外实现并验证打包流程：包含 selection-hook 预编译模块并正确处理原生文件、Electron/Chromium 许可、应用图标、升级及卸载行为。测试全新 Windows 用户环境，决定代码签名方式并记录签名状态。当前仓库没有自动上传 Release、安装包或签名流程。
