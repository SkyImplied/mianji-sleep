# CloudBase 数据与权限约定

本应用使用腾讯云 CloudBase PostgreSQL 保存登录用户的个人记录。网页端只包含可公开使用的 Publishable Key；服务端 API Key、`service_role`、SecretId 和 SecretKey 不得写入仓库或网页。

## 环境

- 环境 ID：`mianji-sleep-d5g85og5ebf8495c3`
- 地域：`ap-shanghai`
- 生产 Web 安全域名：`app.mianjisleep.site`
- 登录方式：短信验证码为默认入口，验证码通过后允许 CloudBase 自动创建新手机号用户；已有用户名与密码登录保留为备用入口

## 表与权限

- `public.health_records`：睡眠、噗噗和补钙三类记录，主键 `id`，所有权字段 `owner_id`。
- `public.user_profiles`：专属名称与最晚入睡时间，主键 `owner_id`。
- 两张表均启用 RLS；`authenticated` 只能查询、增加、修改和删除 `owner_id` 等于当前 JWT `sub` 的行。
- `anon` 无表权限；`service_role` 仅用于受信任的服务端管理，不进入客户端。

## 同步与隐私

- 未登录时，记录继续保存在当前浏览器的 `localStorage` 中。
- 云端组件可用且没有有效会话时，网页启动会自动打开登录弹窗；用户仍可关闭并继续仅本机使用。
- 短信验证码和密码只存在于当前输入与请求流程中，不写入本机存储、同步队列或日志。
- 首次登录且本机存在记录时，必须由用户明确选择“合并并上传”，不得自动上传健康数据。
- 合并时，云端同 ID 数据优先；本机独有记录上传。睡眠记录按日期去重，云端同日记录优先。
- 登录并完成首次同步后，增删改以本机缓存即时落盘，并写入按用户隔离的持久同步队列；成功提交云端后才显示“已同步”。
- 请求失败时保留本机数据和队列，显示“待同步”，由手动同步、重新联网或下次启动重试。
- 云端删除使用记录 ID 和 RLS 双重约束。退出登录不删除本机记录，也不丢弃待同步队列。

## 上线检查

1. `app.mianjisleep.site` 位于 CloudBase HTTP 网关的跨域安全域名列表。
2. 只发布 `cloud-config.js` 中的 Publishable Key，不发布任何服务端密钥。
3. 在“身份认证 → 登录方式”启用短信验证码；使用一个新手机号验证自动创建用户、首次合并、保存、删除、退出和再次登录，并复测备用的用户名密码登录。
4. 在 CloudBase SQL 表中确认每行 `owner_id` 属于当前登录用户。
