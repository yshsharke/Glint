# 代码结构与维护边界

Glint 使用 Electron、TypeScript 和 Fluent UI React v9。主进程拥有配置、凭据、模型请求和数据库；沙盒渲染进程通过 preload 中的具名方法访问它们。

## 主进程与通信

- `src/main.ts`：应用生命周期、窗口与托盘协调、请求和 IPC 注册。
- `src/selection-host.ts`：独立 utility process 中的系统取词。不要将同步 UIA 调用移回主进程。
- `src/selection-config.ts`：取词后端配置。Windows 使用 Glint 原生补丁；Linux 使用上游 PRIMARY 后端，不调用 Windows 专用复制接口。Wayland 无来源进程，禁止接受无效的应用排除设置。
- `src/platform.ts`：会话识别、平台默认设置、保存配置与会话实际配置的转换、能力校验、密钥环策略和原生坐标有效性检查。平台信息通过现有快照传入沙盒界面。Wayland 的触发选择以配置文件顶层的 `waylandTrigger` 独立保存；当前会话不支持的排除规则和取词偏好保留在磁盘上，不传入原生配置。
- `src/ipc-contract.ts`：将内部通道与 `GlintAPI` 的参数、返回类型关联；main 和 preload 共用此约束。
- `src/preload.ts`：仅暴露白名单方法。类型检查不能替代 IPC 参数校验、来源检查或窗口权限检查。
- `src/records.ts`：单个动作数据库的查询、写入、删除及旧数据迁移。
- `src/package-check.ts`：发布包中的最小启动自检，使用隔离目录。

动作的 `englishName` 是首次保存后固定的持久化标识。修改显示名称或图标不得改变数据库映射；删除动作不得连带删除数据库。配置和数据库格式的变化应单独设计迁移。

Windows 上，当前 `selection-hook` 的快捷键取词先按鼠标所在窗口识别进程并应用排除列表，再查询 UIA 焦点。因此仅聚焦文本框并不足以确定取词目标；鼠标停在其他进程上可能造成过滤或来源信息不一致。原生测试必须将测试窗口放到真实鼠标下方，并同时确认窗口焦点；不移动用户鼠标、不启用剪贴板兜底，报告只保存位置、进程、取词方式和匹配结果，不保存选中文字。

## 界面与状态

Linux Wayland 下，Electron 窗口以 XWayland 运行，以保留浮条定位；启动器在 Chromium 初始化前传入 `--ozone-platform=x11`。utility process 保留 Wayland 环境，仍直接读取 Wayland PRIMARY。Windows/Linux 原生坐标均转换为 DIP，无效坐标不参与定位或全局点击关闭。Linux 浮条提供显式关闭按钮，避免依赖可能不可用的全局输入事件。能力及兼容限制见 [LINUX.md](LINUX.md)。

- `src/renderer.tsx`：启动、主题及窗口视图选择。
- `src/ui/renderer-store.ts`：草稿编辑、保存、撤销、选中动作、后台快照与通知的状态转换，无 React/Electron 运行时依赖。
- `src/ui/state.ts`：将状态模块接入 React 订阅，并提供统一的异步错误提示。
- `Settings.tsx`、`Actions.tsx`、`IconPicker.tsx`、`Toolbar.tsx`、`Result.tsx`：各自负责对应的界面。
- `History.tsx`：历史列表与详情布局；`useHistoryRecords.ts`：分页、请求竞争、复制删除及记录变更订阅。
- `Icon.tsx`、`controls.tsx`、`motion.ts`：共享图标、表单控件及 Fluent 动效边界。

组件只读取状态快照，通过状态模块的操作更新草稿，不直接修改快照。未保存的草稿不随状态广播重置；保存期间禁止继续编辑；失败时保留草稿与待更新密钥。新增这些规则时同时扩展 `renderer-store.test.ts`。

## 验证

- `tests/*.test.ts`：纯逻辑、状态转换、SQLite、迁移和协议解析测试，由 `npm run check` 运行。
- `tests/electron/smoke.ts`：真实 Electron 的设置界面、记录/本地 SSE、原生取词三组测试；Windows 验证 UIA 和复制模式，Linux 验证 PRIMARY、自动触发及暂停恢复。
- `scripts/smoke.mjs`：为每组创建独立目录，编译测试入口到 `work/`，汇总各组结果；不接触用户配置或调用外部模型。
- `scripts/build.mjs`：正式构建关闭 `GLINT_TEST_BUILD`；检查构建依赖图，禁止测试场景进入正式包。
- `scripts/verify-package.mjs`：验证安装资源、portable 和解包版启动，以及 Windows 短路径启动。
- `scripts/verify-linux-package.mjs`：验证 Linux 资源与当前构建一致，检查解包版显式 X11 启动与直接启动重启路径；`--appimage` 增加 AppImage 解压启动验证。

界面测试应等待 React 提交、控件状态和有限时长动画结束，不依赖一段固定休眠后恰好完成。UIA 的系统焦点要求与普通界面测试分组处理，失败时保留独立报告，不能将跳过的场景报告为通过。发布步骤见 [RELEASING.md](RELEASING.md)。
