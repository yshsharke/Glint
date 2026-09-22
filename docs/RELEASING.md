# 发布流程

仓库：https://github.com/yshsharke/Glint 。发布物为 Windows x64 安装版、portable 和 `SHA256SUMS.txt`。当前为未签名预览版本，不提供自动更新。

Linux x64 可通过 `npm run package:linux` 本地构建 AppImage、tar.gz 和 `SHA256SUMS-linux.txt`，再运行 `npm run package:verify:linux -- --appimage` 检查解包版与 AppImage 解压启动。Linux 发布前应在目标发行版测试 FUSE 挂载、系统运行库、portal 和原生取词，并完成 AppImage 上游工具集所带运行库的许可、声明和对应源码审计（见 [第三方说明](../THIRD_PARTY_NOTICES.md)）；启动验证不能代替许可审计。现有 GitHub Release workflow 仍仅发布 Windows 文件。详见 [Linux 说明](LINUX.md)。

## 本地验证

```powershell
npm ci
npm run setup:electron
npm run check
npm run smoke
npm run package
npm run package:verify
npm run package:verify-installer
```

- `release/Glint-<version>-windows-x64-setup.exe`：当前用户安装，可选择目录，创建开始菜单入口，支持卸载。
- `release/Glint-<version>-windows-x64-portable.exe`：单文件免安装启动器，运行时解压到临时目录；配置与数据仍在 AppData。
- `release/SHA256SUMS.txt`：两份下载文件的 SHA-256。
- `release/win-unpacked/`：用于调试的完整应用目录，不上传到源码仓库。`dist/` 单独不能运行。

构建只包含白名单应用资源、生产依赖和许可；selection-hook 的 Windows x64 原生模块放在 `app.asar.unpacked`，不要改成随意打包整个项目目录。默认关闭代码签名，保留 exe 图标和版本信息。

`npm run verify:release` 串行执行代码检查、完整 smoke、构建和打包启动验证；安装与卸载验证仍需在没有安装 Glint 的干净 Windows 账户中单独运行。

`smoke` 使用单独编译到 `work/` 的测试入口，依次运行设置界面、记录与本地模型、原生取词三组测试。每组使用独立临时配置和数据库；某组失败不会阻止其余组执行，任一组失败则整体失败。也可分别运行 `smoke:ui`、`smoke:records`、`smoke:native`。结果及测试目录见 `work/smoke-summary.json`。系统取词测试需要交互式 Windows 桌面。

`package:verify` 检查归档、原生模块和许可，并分别启动应用与 portable，确认引擎、preload 接口及 SQLite 可用。正式包只保留最小启动自检，不携带完整测试场景；原先的 `smoke:packaged` 已由开发测试和打包自检分别替代。打包启动验证不能替代完整 smoke 或第三方应用的手动兼容性检查。

## GitHub Release

1. 确认 `package.json` 和锁文件版本一致，更新 CHANGELOG 与 `docs/releases/<version>.md`，同步中英文 README。
2. 完成本地验证，检查 `npm audit`、第三方许可和提交内容；不提交生成文件、个人数据和签名凭据。
3. 提交并推送代码，再创建对应的 `v<version>` 标签并推送该标签。不要移动已经公开发布的标签。
4. `Release` workflow 会在 Windows 构建、验证打包应用，上传构建产物；随后核对 SHA-256，建立包含两个 exe 与校验文件的 GitHub 预览 Release。标签必须与 package.json 的版本一致。
5. 验证 GitHub Release 三份附件均可下载，README 的 Releases 链接可访问。手动下载后，可用 `Get-FileHash <文件> -Algorithm SHA256` 对照校验值。

推送 `main` 或手动运行 Release workflow 且选择 `main` 时，只构建并保留 Actions artifacts，不创建公开 Release。先确认分支构建通过，再推送版本标签进入发布流程。发布任务使用 GitHub 内置令牌，只有发布任务获得 `contents: write`；不需要个人访问令牌。

若上传中断而留下草稿，先确认该 tag 没有公开版本，再由维护者处理草稿和重新运行；流程不会自动覆盖已发布的附件。当前每个版本均标记为 prerelease，准备稳定版时需明确修改此策略。

## 维护

保留 `dist/licenses/` 及 Electron 原有的 LICENSE/Chromium 声明。新增运行依赖要更新许可证收集和归档验证。安装版与 portable 使用相同的应用 ID 和 AppData 路径；更改它们前需设计迁移，卸载默认保留用户数据。

启用仓库的私密漏洞报告、Dependabot alerts，以及可用的 secret scanning/push protection；这些设置不能单靠提交文件开启。新功能发布前补充第三方应用取词检查，签名、ARM64 和自动更新属于后续工作。
