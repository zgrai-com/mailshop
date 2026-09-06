---
name: Mailshop
description: 面向跨境电商选品与 Shopify 上架的运营工作台
colors:
  canvas: "#f2f3ef"
  surface: "#ffffff"
  surface-soft: "#f7f8f5"
  surface-pressed: "#ecefeb"
  sidebar: "#202723"
  sidebar-hover: "#2c3530"
  sidebar-line: "#3b4540"
  ink: "#1d211f"
  muted: "#68716c"
  faint: "#969f99"
  line: "#d9deda"
  line-strong: "#bcc5bf"
  primary: "#245c43"
  primary-hover: "#1c4b36"
  primary-soft: "#e4efe8"
  info: "#355f7c"
  info-soft: "#e6eef3"
  warning: "#845511"
  warning-soft: "#f6ead5"
  danger: "#9d4036"
  danger-soft: "#f5e2df"
  focus: "#437e61"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "0"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  mono:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
rounded:
  control: "5px"
  panel: "7px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  page: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "38px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px 18px"
---

# Design System: Mailshop

## Overview

**Creative North Star: "跨境运营控制台"**

Mailshop 的视觉系统像一块安静、可靠的运营控制台：信息密度高，但层级明确；颜色服务于状态判断，而不是装饰；每一个边框、间距和按钮都应该帮助用户更快完成采集、找货、审核和 Shopify 导入。整体气质是冷静、精确、高效、可信，适合长时间重复操作和多任务切换。

后台以浅灰绿色画布承托白色工作面板，左侧深森林绿导航提供稳定锚点。卡片、表格、图片网格和工作台使用细边框与轻微色阶分层，避免营销页面式的大面积视觉叙事。浏览器扩展沿用同一套信息秩序，但使用更紧凑的尺寸和高亮酸性绿作为选择与分析状态的即时信号。

**Key Characteristics:**
- 高密度、可扫描的运营布局
- 深森林绿作为稀缺的行动与品牌信号
- 细边框和色阶优先于装饰性阴影
- 以状态色表达搜索、成功、警告和错误
- 克制的圆角、短促的动效、明确的焦点反馈

## Colors

色彩以冷静的灰绿中性色为骨架，主色“运营森林绿”负责行动与确认，蓝色、琥珀色和珊瑚色只承担信息、进行中和风险状态。

### Primary
- **运营森林绿** (`#245c43`): 主按钮、当前导航、已选图片、成功状态和关键链接；它是稀缺的决策信号，不应铺满整个页面。
- **深森林悬停绿** (`#1c4b36`): 主按钮和主色链接的悬停反馈，提供更深的触感。
- **森林浅底** (`#e4efe8`): 主色的低对比背景，用于已选状态、提示条和辅助操作。

### Secondary
- **供应链信息蓝** (`#355f7c`): 查询信息、辅助状态和说明型提示，不与成功绿混用。
- **稳态琥珀** (`#845511`): 运行中、等待和需要注意的状态。
- **校验珊瑚** (`#9d4036`): 错误、失败、删除和危险操作。

### Neutral
- **灰绿画布** (`#f2f3ef`): 页面底色，降低大面积白色的刺眼感。
- **工作面白** (`#ffffff`): 卡片、表单、弹窗和主要内容容器。
- **柔和表面** (`#f7f8f5`): 表格表头、次级区域、结果卡和内嵌工作区。
- **按压灰绿** (`#ecefeb`): 图片占位、表头和控件的按压层。
- **墨色正文** (`#1d211f`): 标题、正文和深色导航底。
- **静音灰绿** (`#68716c`): 辅助说明、时间、元数据和非主导标签。
- **浅灰线** (`#d9deda`) 与 **强调线** (`#bcc5bf`): 分隔、表格边界和容器轮廓。

### Named Rules
**The Signal Rarity Rule.** 主色和状态色只出现在需要行动或判断的地方；不要把整个面板染成绿色。

## Typography

**Display Font:** 不使用独立展示字体；页面标题沿用 Inter 系统无衬线栈。
**Body Font:** Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
**Label/Mono Font:** SFMono-Regular, Consolas, Liberation Mono, monospace

**Character:** 无衬线正文保持快速扫描和跨平台一致性，等宽字体只标记 URL、SKU、ID、API 和日志等机器信息。字号整体偏紧凑，以数据密集型后台的可见信息量为优先。

### Hierarchy
- **Headline** (700, 21px, 1.15): 页面级标题和登录/控制中心标题。
- **Title** (650, 15–16px, 1.2–1.45): 卡片标题、任务名称和主要区块标题。
- **Body** (400, 13px, 1.45): 常规操作说明和表格正文；长文本保持短段落和可折叠。
- **Label** (700, 10–12px, 1.2–1.45): 字段名、状态、元数据和导航辅助文字。
- **Mono** (400–700, 9–11px, 1.45): URL、SKU、请求日志、ID 和批量导入预览。

### Named Rules
**The Machine-Data Rule.** 机器可读内容使用等宽字体并降低字号；业务标题和用户文案保持正常无衬线字体。

## Layout

后台采用“固定导航 + 可滚动主内容”的运营壳层。桌面端左侧深色导航保持约 248px 宽，主区域从 28px 左右内边距开始，以页面标题、筛选/操作栏、列表或工作台的顺序组织。常见内容使用 CSS Grid，任务查询工作台在宽屏上分为图片选择、查询配置和预览三列，Shopify 商品编辑器在窄屏降为单列。

间距以 4px 为最小单位，常用节奏为 8px、12px、16px、22px 和 28px。卡片之间通常保持 8–12px，页面区块之间保持 16–22px。移动端在 720px 左右切换：导航变为抽屉，页面内边距收窄到 14–18px，多列网格降为单列或三列缩略图；表格在必要时保持横向滚动而不压缩关键字段。

## Elevation & Depth

系统采用“平面为主、结构性分层”。常态容器依靠 `#ffffff`、`#f7f8f5`、细边框和分隔线建立层次；不为每张卡片添加阴影。浮层、批量导入面板、图片预览和对话框使用单一结构性阴影 `0 20px 56px rgba(19, 29, 23, 0.16)`，遮罩使用半透明深色覆盖。焦点、选中和悬停优先通过边框、内描边和色阶变化表达。

### Shadow Vocabulary
- **结构浮层** (`0 20px 56px rgba(19, 29, 23, 0.16)`): 弹窗、下拉面板、图片预览和批量导入面板。
- **轻微展开反馈** (`0 2px 8px rgba(29, 33, 31, 0.08)`): 仅用于展开的日志项等需要从列表中脱离的局部状态。

### Named Rules
**The Flat-By-Default Rule.** 静态内容保持平面；阴影只说明“这里暂时浮在工作流之上”。

## Shapes

形状语言是克制、近直角和可预测的。普通控件使用 5px 圆角，面板与对话框使用 7px 圆角，图片缩略图和标签可使用 3–5px；不使用大胶囊形作为默认容器。边框通常为 1px，选中状态用主色边框或 1–2px 内描边强化。虚线边框只用于拖放区、空状态和可补充内容的占位区域。

## Components

### Buttons
- **Shape:** 近直角控件（5px），最小高度通常为 36px，紧凑操作为 31px。
- **Primary:** 运营森林绿底、白字，用于提交、搜索、导入和确认。
- **Secondary:** 墨色底、白字，用于次主操作或深色环境中的明确命令。
- **Quiet:** 透明底、浅灰边框或无边框，用于刷新、返回和次级动作。
- **Hover / Focus:** 悬停加深背景或强化边框；焦点统一使用 3px 主色深绿外描边并保留 2px offset。
- **Disabled:** 降低不透明度至约 0.5，保留布局尺寸，不使用位移。

### Chips
- **Style:** 状态标签以紧凑的 3–4px 圆角、浅色底和语义色文字呈现；标签不承担主要操作。
- **State:** 成功使用森林绿，进行中使用琥珀，信息使用蓝色，失败/危险使用珊瑚；生命周期标签可使用透明底加语义边框。

### Cards / Containers
- **Corner Style:** 普通卡片 7px；扩展端小卡片 6–8px。
- **Background:** 白色工作面为主，柔和表面用于内嵌区域和表格。
- **Shadow Strategy:** 遵循 Elevation & Depth 的结构浮层规则，普通卡片不加阴影。
- **Border:** 1px 浅灰线；需要强调时使用强调线或主色边框。
- **Internal Padding:** 常见 12–18px；页面级工作区可使用 26–30px。

### Inputs / Fields
- **Style:** 白色或柔和表面背景，1px 浅灰边框，5px 圆角，常见高度 34–38px，水平内边距 9–10px。
- **Focus:** 边框转为焦点绿，并叠加浅绿色 2px 外描边。
- **Error / Disabled:** 错误使用珊瑚边框或左侧强调线；禁用状态降低不透明度但不改变控件尺寸。

### Navigation
- **Style:** 深森林绿固定侧栏，品牌标记与导航图标使用白色和灰绿色；导航项高度约 38px，5px 圆角。
- **Active:** 主色浅底或主色填充，文字与图标保持高对比；当前项必须在侧栏中一眼可定位。
- **Mobile:** 720px 以下改为顶部栏加抽屉，打开时使用深色遮罩，关闭和返回始终提供明确图标按钮。

### Task Workbench
采集任务是 Mailshop 的签名组件：来源图片、搜索参数、预览结果和运行历史被放进同一工作区。它使用分栏、细线和固定图片比例来支持对比判断；成功、运行中和失败状态沿用主色、琥珀和珊瑚，不用动画替代状态文字。

### Image Viewer
图片查看器使用全屏深色舞台和顶部工具栏，左右对比面板之间以细线分隔。图片保持 `contain`，用户可缩放、拖拽和关闭；查看器是唯一允许明显深色沉浸背景的工作场景。

## Do's and Don'ts

### Do:
- **Do** 用灰绿画布、白色工作面和深色侧栏建立稳定的“控制台”骨架。
- **Do** 让主色只标记可执行动作、选中项和成功结果。
- **Do** 用真实的状态色区分信息、进行中、成功和错误，并在颜色旁提供文字或图标。
- **Do** 保持 5–7px 圆角、1px 边框和 4px 基础间距节奏。
- **Do** 为键盘焦点提供清晰的 3px 外描边，并在移动端保留可触达的操作尺寸。
- **Do** 使用等宽字体承载 URL、SKU、ID、日志和批量数据。

### Don't:
- **Don't** 使用营销落地页式的大型渐变、装饰性光晕或大面积图片背景作为后台主结构。
- **Don't** 把所有卡片都做成漂浮阴影容器，层级应优先由色阶和边框表达。
- **Don't** 用过度圆润的胶囊容器替代列表、表格和工作台结构。
- **Don't** 用颜色单独传达成功、失败或权限状态；必须同时提供文字、图标或结构线索。
- **Don't** 隐藏来源 URL、匹配证据、积分消耗或导入状态等会影响运营判断的事实信息。
