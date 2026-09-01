---
version: alpha
name: "薯条脆脆日常健康手帐"
description: "为 iPhone 竖屏日常使用设计的温暖、安静且高密度的个人健康记录工具"
colors:
  background: "#F7F1E8"
  surface: "#FFFDF9"
  ink: "#2D2520"
  muted: "#8B7D73"
  deep: "#3A2924"
  accent: "#E78157"
  accent-soft: "#F8D8C5"
  sage-soft: "#DCE9E1"
  gold: "#E8B86A"
  danger: "#BD5353"
typography:
  display:
    fontFamily: "Songti SC, STSong, serif"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Display, PingFang SC, Microsoft YaHei, sans-serif"
  numeric:
    fontFamily: "Avenir Next, SF Pro Display, sans-serif"
rounded:
  sm: "0.625rem"
  md: "0.9375rem"
  lg: "1.25rem"
  xl: "1.75rem"
spacing:
  page-inset: "1.25rem"
  compact-gap: "0.1875rem"
  card-gap: "0.5rem"
  section-gap: "1.5625rem"
components:
  summary-card:
    alignment: "center"
  calendar-cell:
    aspectRatio: "1"
  bottom-sheet:
    maxWidth: "23.875rem"
  bottom-navigation:
    itemCount: "3"
  history-list:
    pageSize: "20"
  cloud-sync-card:
    primaryActionCount: "1"
    offlineFallback: "local-first"
  cloud-login-dialog:
    defaultMethod: "sms"
    passwordFallback: "true"
---

# 薯条脆脆日常健康手帐 Design System

## Overview

### Creative North Star

界面像一本每天放在床头、随手能填的健康手帐：米色纸张、深棕墨迹、少量桃色与鼠尾草绿标记。它首先是高频工具，不是装饰型健康报告。

### Product context and register

- **Audience and primary job:** 中文用户在睡前或日常快速记录睡眠、噗噗和补钙，并用月历查看是否持续。
- **Target market(s) and evidence:** 当前产品内容与用户反馈面向中文个人使用场景；未假设特定国家的医疗或监管范围。
- **Locale(s) and language policy:** `zh-CN`，界面文案保持简短、自然，不混用英文状态词；`Ca` 和 `mg` 作为固定科学单位例外。
- **Usage scene:** iPhone 16 Pro 竖屏（402 × 874 CSS px）是主验收视口，单手、短时、高频使用。
- **Register:** 产品型界面；清晰、稳定和触控准确性优先。
- **Memorable signature:** 深棕夜色睡眠卡与暖色手帐纸面之间的对比。
- **Restraint:** 表单、统计卡和月历保持安静，避免额外介绍文案、重复入口和装饰动效。
- **Anti-references:** 不做医疗仪表盘、社交打卡应用或大面积霓虹渐变；避免小卡片内出现不同对齐逻辑。
- **Token ownership/runtime mapping:** 成熟代码中的 `styles.css :root` 是运行时唯一来源，本文件按语义镜像已接受的值；组件直接消费 CSS 变量，不生成第二份主题文件。

## Colors

`background` 和 `surface` 构成纸张层次；`ink`、`muted` 负责文本层级；`deep` 仅用于高强调操作和底部导航选中态；`accent`、`sage-soft`、`gold` 分别服务睡眠、补钙和时间提示。危险操作仅使用 `danger`，不把强调色当作错误色。

## Typography

宋体只用于少量品牌或大标题；正文、表单和按钮使用系统中文字体栈；时间、时长和剂量使用数字字体栈并启用等宽数字。小卡片里的标签、数值和说明必须共享中心轴，不能依赖不同字体的默认行框实现视觉居中。

## Layout

主内容左右安全边界为 20px，并叠加 iOS safe-area。页面宽度以 402px 为主视口，所有三列卡片使用同一个等分网格；日历保持七列正方形单元格并采用紧凑间隔。底部导航和弹层必须避开 Home Indicator，长弹层内部滚动，页面不得产生横向溢出。按当前产品决定，移动端视口固定为 1 倍并禁止用户缩放；所有文本输入字号至少为 16px，避免 iOS 聚焦时自动放大。

## Elevation & Depth

层级主要依靠明度、边框和少量低透明阴影。静态小卡片不使用重阴影；弹层只保留一层阴影和纯色遮罩，不叠加高成本背景模糊。

## Shapes

小控件采用 `sm`/`md` 圆角，卡片采用 `lg`，底部弹层采用 `xl`。同一网格内的卡片必须等宽等高，图标容器与文字共享光学中心。

## Components

### Foundational visual states

可点击控件提供默认、按压与 `focus-visible` 状态；选中态同时通过背景、边框和文字权重表达。减少动态效果偏好下关闭非必要过渡。

### Buttons and actions

每个操作区只保留一个深棕主按钮。危险删除与保存动作分离。图标按钮保持可访问名称和至少 40px 的触控区域。

### Navigation and data display

底部固定三项导航。趋势页首屏只保留周期切换、睡眠／噗噗／补钙三张摘要卡和月历；记录页直接进入按月时间线，不重复页面说明。历史记录继续按月分组，并固定每页展示 20 条，通过底部分页浏览，避免长期使用后出现无限长页面。

### Hidden message

记录页左上角的专属名称承载一处克制的隐藏互动：短时间内连续点按五次，打开应用自有的无障碍消息弹窗。它不改变主流程，也不在普通界面增加提示或装饰。

### Forms and overlays

原生日期与时间选择器被明确接受为 iOS 平台所有；关闭态输入框由应用负责等宽、垂直居中和边界约束。记录表单使用同一底部弹层、字段密度、保存按钮和关闭动作。

CloudBase 登录使用应用自有居中弹窗。未登录且云端组件可用时，应用启动后自动打开该弹窗；短信验证码是默认入口，新手机号验证成功后自动创建账户，账号密码作为备用入口。手机号允许保留在当前页面内，短信验证码与密码不持久化；密码始终默认遮罩。发送、倒计时与登录错误留在表单内；首次合并必须通过独立确认弹窗取得明确同意。同步卡只展示当前账户、同步状态和当下可执行的动作，不复制完整账号设置。

### Iconography

线性 SVG 用于导航和设置，尺寸保持 16–20px；`噗`、`Ca` 是类别标记而不是装饰图标，必须始终配文字标签。
主屏幕图标使用项目根目录的 `logosleep.png`，并从同一源图生成 Apple Touch Icon 与 PWA 图标，保持爱心薯条标识一致。

### Data safety and backup

应用会向支持的浏览器请求持久存储，但不把本机空间描述为永久云备份。备份操作沿用设置页的单一数据出口。文件名始终由“当前专属名称 + 健康记录 + 导出日期”组成；iPhone 优先交给系统分享面板，让用户选择 iCloud 云盘或“在我的 iPhone 上”，其他浏览器再使用文件选择器或下载回退。

云端同步采用 local-first：任何新增、编辑和删除先写入本机，再进入按用户隔离的同步队列。首次登录检测到本机数据时不得自动上传，必须明确选择“合并并上传”；失败或离线时保留本机副本并持续显示“待同步”。退出登录不删除本机记录。前端只允许使用 Publishable Key，数据隔离由 PostgreSQL RLS 策略负责，服务端密钥绝不进入静态文件。

### Motion

按压反馈约 150ms，弹层约 220ms，只使用 opacity 与 transform；不使用会导致 iPhone 掉帧的多层 blur。

### Content and data visualization

文案从用户任务出发：记录、查看和设置。数值携带明确单位；月历颜色必须同时配图例，不能只靠颜色传递意义。

## Do's and Don'ts

- **Do:** 让三列摘要卡、五列质量卡和七列日历各自拥有严格一致的内部中心轴。
- **Do:** 在 402 × 874 视口逐屏检查边界、触控目标和空状态。
- **Don't:** 在记录页或趋势页重复首页已有的新增入口与解释性标题。
- **Don't:** 用额外留白、复杂阴影或不同字号行框破坏小卡片的垂直居中。
