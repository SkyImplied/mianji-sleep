# UX Contract

## Product context

- Audience: 中文个人用户，以 iPhone 主屏幕应用进行短时、高频健康记录。
- Primary jobs: 记录睡眠、噗噗与补钙；查看趋势；在不同设备间同步同一账号的数据。
- Target market(s): 中文个人使用场景，不宣称医疗诊断或特定监管适用性。
- Active locales: `zh-CN`。
- Timezone/calendar policy: 日期和时间按设备本地时间保存；日期字段不进行时区换算；公历。
- Accessibility target: WCAG 2.2 AA。

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Permission model | `CLOUDBASE.md` | Permission policy / verified RLS schema | 2026-09-01 |
| Data lifecycle and cloud merge | `CLOUDBASE.md` | Data contract | 2026-09-01 |
| Local backup and deletion copy | `DESIGN.md` | Maintained product context | 2026-09-01 |

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`。
- Token ownership model: `styles.css :root` 是运行时唯一来源，`DESIGN.md` 镜像接受的值。
- Supported themes: 单一暖色纸面主题；系统强制色保留可操作性。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Date | 原生 `date` / `time` 输入 | `DESIGN.md` | native | iOS 与桌面浏览器 |
| Form | 共享 `.form-field`、底部弹层与应用校验 | 本文件 | create / edit / login | 浏览器表单流程 |
| Scrollbar | `styles.css` 全局基线 | `DESIGN.md` | stable gutter | computed style |
| Toast | `#toast` + `showToast` | 本文件 | success / info / error | live-region |
| CRUD | `app.js` 本地缓存 + CloudBase 同步队列 | `CLOUDBASE.md` | local-only / cloud-synced | 完整流程 |

## Dataset navigation

- 日常记录按月分组，每页固定 20 条；页码写入 `historyPage` URL 参数。
- 空数据、页码边界和删除后的页码收敛由同一历史列表负责。

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| 短信登录 | 未登录启动自动弹窗／登录并同步 | 发送按钮倒计时；登录按钮稳定尺寸忙碌 | 关闭登录弹窗 | 云端账号状态 | 手机号或验证码错误留在表单内，可重试 | 云同步卡或首次同步弹窗 | `CLOUDBASE.md` |
| 账号登录 | 登录弹窗切换到账号密码 | 稳定尺寸忙碌按钮 | 关闭登录弹窗 | 云端账号状态 | 表单内通用错误，可重试 | 云同步卡或首次同步弹窗 | `CLOUDBASE.md` |
| 首次同步 | 合并并上传 | 弹窗按钮忙碌 | 设置页 | 已同步 | 本机数据不变，可重试 | 云同步卡 | `CLOUDBASE.md` |
| 新增/编辑 | 保存记录 | 本机先落盘，云端状态同步中 | 关闭记录弹层 | 已同步或待同步 | 持久队列重试 | 触发按钮 | `CLOUDBASE.md` |
| 删除 | 删除 | 应用确认弹窗 | 当前有效列表 | 已删除；云端状态独立 | 持久队列重试 | 下一上下文 | `CLOUDBASE.md` |
| 退出登录 | 退出登录 | 稳定尺寸忙碌按钮 | 设置页 | 已切换为仅本机 | 队列保留，下次登录继续 | 登录按钮 | `CLOUDBASE.md` |

## Navigation and responsive behavior

- 页面标题格式为 `{页面} · {专属名称}专属`。
- 三个主视图使用底部导航；编辑、设置、登录和确认使用应用自有弹层。
- 弹层限制在视觉视口和安全区内，长内容内部滚动；关闭后焦点返回触发控件。
- 移动端视口固定为 1 倍并禁止手势缩放；输入框字号不得低于 16px，避免 iOS 聚焦自动放大。

## Overlays and feedback

- 所有弹层复用 `.sheet-backdrop` 的遮罩、Escape、焦点圈闭和恢复行为。
- 删除使用应用自有确认弹窗，不调用浏览器 `alert`、`confirm` 或 `prompt`。
- Toast 固定在底部导航上方；关键的离线、登录和同步失败状态保留在云同步卡中，不只依赖 Toast。
- 层级顺序：基础内容 < 底部导航 < 遮罩 < 对话框 < Toast。

## Async and resilience

- Mutation default: 本机缓存即时提交，云端使用显式 queued 状态；只有云端确认后显示“已同步”。
- 队列按登录用户 ID 隔离并持久化，顺序执行；同一记录的后续操作替换旧的待处理操作。
- 离线或请求失败时不清空本机内容，不无限重试；支持手动“立即同步”。
- 首次同步由用户明确授权；已完成首次同步且本机无待提交更改时，云端为跨设备读取的权威来源。
- 会话过期时保留本机内容和队列，回到登录状态。
- 云端组件可用且当前没有有效会话时，启动后默认打开短信登录弹窗；用户仍可关闭弹窗并继续使用仅本机模式。

## Validation

- 所有表单使用 `novalidate`，错误在应用内展示；短信验证码使用 `autocomplete="one-time-code"` 且只保存在内存，发送后保持 60 秒重发倒计时。密码默认遮罩并提供可访问的显示/隐藏按钮。
- 登录失败使用通用错误文案，不透露账号是否存在；不记录、持久化或输出密码。
- 新手机号通过验证码后由 CloudBase 自动创建账户；手机号登录与账号密码登录共享同一套登录后同步和首次合并流程。
- 按钮忙碌时禁止重复提交并保持尺寸稳定。

## Verification

- Required static commands: JavaScript 语法检查、DESIGN.md lint、premium strict audit。
- Browser matrix: 402 × 874 主视口、桌面窄窗、键盘、减少动态效果、离线/失败、空数据与大量记录。
- Canonical sibling flow: 现有睡眠/噗噗/补钙底部表单与设置弹层。
