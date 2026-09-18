# 安全报告

项目处于源码预览阶段。安全修复优先针对默认分支；尚无承诺维护的历史版本或固定响应时限。

请勿在公开 Issue 中提交可利用漏洞的完整细节、API Key、真实划词内容或个人数据库。仓库启用 GitHub Private Vulnerability Reporting 后，可在 **Security → Advisories → Report a vulnerability** 私下报告。

若尚无该入口，请开一个仅请求建立私密联系渠道的 Issue，不包含漏洞细节，待维护者提供渠道后再发送完整报告。发布维护者需按 `docs/RELEASING.md` 启用私密报告功能。

报告应包含受影响提交或版本、Windows 版本、最小复现、预期影响和使用虚构数据的示例。普通取词兼容问题请使用缺陷模板。

## 安全边界

渲染进程不具有 Node 权限；主进程验证 IPC 来源并管理凭据与网络请求；模型输出按纯文本显示。API Key 通过 Windows safeStorage 加密保存，这不能抵御已控制当前用户会话的恶意程序。

用户手动保存的 SQLite 原文、结果和进程名没有加密。配置的模型服务和搜索引擎会接收相应操作所需文本，详见 [隐私说明](docs/PRIVACY.md)。
