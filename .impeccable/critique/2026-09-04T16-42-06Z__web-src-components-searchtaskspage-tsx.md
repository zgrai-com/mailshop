---
target: web/src/components/SearchTasksPage.tsx
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-04T16-42-06Z
slug: web-src-components-searchtaskspage-tsx
---
**Design Health Score**

| # | 启发式原则 | 评分 | 关键问题 |
|---|---|---:|---|
| 1 | 系统状态可见性 | 3/4 | 有加载、搜图中、成功/失败和导入反馈；运行状态与错误没有统一的实时播报语义。 |
| 2 | 系统与现实世界匹配 | 3/4 | 1688、Shopify、SKU、来源图等术语贴合运营工作；中英文标签混用，部分参数仍需要领域经验。 |
| 3 | 用户控制与自由 | 3/4 | 支持归档、恢复、清除筛选、折叠轮次和关闭弹窗；导入后缺少撤销，店铺选择又是全局状态。 |
| 4 | 一致性与标准 | 3/4 | 边框、颜色、状态标签和按钮体系一致；搜图轮次的 tab 语义没有完整实现。 |
| 5 | 错误预防 | 2/4 | 删除有确认、参数有约束；但默认选择第一个 Shopify 店铺，存在误导入风险。 |
| 6 | 识别而非回忆 | 3/4 | 来源图、运行轮次、页码、价格和导入状态都可见；但用户需要记住顶部店铺选择。 |
| 7 | 灵活性与效率 | 3/4 | 支持批量导入、分页、历史轮次、上一页/下一页和整页导入；缺少跨任务批量处理和键盘加速。 |
| 8 | 美观与极简 | 2/4 | 控制台风格成立，但一张任务卡同时承载四个工作阶段，信息噪声偏高。 |
| 9 | 错误识别、诊断与恢复 | 2/4 | 失败信息能显示，用户可重新搜图；错误没有就地重试/修复动作，也不一定被辅助技术播报。 |
| 10 | 帮助与文档 | 3/4 | 顶部有批量采集指南和模板下载；搜图参数、积分消耗和导入决策点缺少就地解释。 |
| **总分** |  | **27/40** | **Acceptable：基础扎实，但在多店铺安全、信息层级和可访问性上仍需明显改进。** |

**设计特异性判断**

**LLM 评估：偏产品特异，而非通用后台。** “来源图片 → 1688 搜图轮次 → 候选商品 → Shopify 导入”的连续工作单元很有 Mailshop 的辨识度；任务卡不是普通 CRUD 列表，而是围绕“找货准确率”和“上架效率”组织的运营工作台。它的问题不是缺少产品性格，而是把太多产品能力同时摊开，导致这个特异结构还没有转化成足够清晰的操作节奏。

**确定性扫描：干净。** `detect.mjs --json web/src/components/SearchTasksPage.tsx` 返回 `[]`，没有自动检测器发现，也没有需要标记的误报。

**浏览器证据：受限。** 已尝试使用本地 `http://localhost:5173/tasks`，但当前会话中的浏览器工具调用返回 `unsupported call`，因此没有可靠的页面快照、截图或用户可见 overlay。以下判断来自源码、CSS、产品上下文和类型检查；不把它们冒充成浏览器观察。

**总体印象**

这是一个能力很完整的采集运营工作台：来源证据、搜图参数、历史轮次、候选货源和 Shopify 导入都在同一上下文里，工作闭环表达清楚。最大的机会是把“完整”重新编排成“有节奏”：先让用户确认任务和目标店铺，再完成一次搜图，最后集中处理候选结果；现在的布局更像把整个后台流程一次性展开。

**做得好的地方**

1. 业务闭环非常清楚。任务卡同时展示来源图片、搜图配置、运行历史和结果，减少在多个页面之间来回切换。
2. 状态反馈覆盖面广。加载态、搜图中、成功/失败、已归档、回收站和已导入店铺都有明确视觉表现。
3. 对高频运营有实用效率能力。批量导入、历史页码、上一页/下一页、整页导入、单条详情和图片对比，都是贴近真实工作流的功能。

**优先问题**

1. **[P1] Shopify 导入目标是全局且会被静默预选**

   **为什么重要：** `selectedStoreId` 在组件级别共享，并在 `useEffect` 中自动选中第一个 active/configured 店铺（[SearchTasksPage.tsx:201](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:201)）。顶部店铺选择会影响所有任务卡和所有结果卡的导入按钮（[SearchTasksPage.tsx:278](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:278)、[SearchTasksPage.tsx:319](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:319)、[SearchTasksPage.tsx:329](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:329)）。在多个独立商家或多个 Shopify 店铺并行运营时，用户可能以为“导入 Shopify”是当前任务动作，却实际导入到了另一个店铺。

   **怎么改：** 默认不要静默选择第一个店铺；要求用户明确选择，并在每个任务的导入动作旁显示店铺名称。更稳妥的是把目标店铺绑定到任务/运行轮次，并在整页导入前显示一次“导入到：店铺 X”的确认摘要。

   **建议命令：** `$impeccable harden`

2. **[P1] 每张任务卡默认展开完整工作台，首屏焦点不够单一**

   **为什么重要：** 任务卡从标题、7 类元数据、描述，到来源图片、300px 预览、搜图参数、运行历史和结果网格全部直接渲染（[SearchTasksPage.tsx:293](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:293)–[SearchTasksPage.tsx:333](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:333)；工作台和预览尺寸见 [styles.css:141](/D:/code/mailshop/web/src/styles.css:141)–[styles.css:181](/D:/code/mailshop/web/src/styles.css:181)）。即使每页只有 5 个任务，用户也很难快速扫描“哪个任务下一步该处理”。

   **怎么改：** 任务卡默认只显示摘要：状态、标题、来源缩略图、结果数和一个主动作；将搜图工作台和结果区作为任务级展开内容，并允许“一次只展开一个任务”。保留轮次折叠，并把展开状态写入 URL 或本地状态，避免刷新后丢失工作上下文。

   **建议命令：** `$impeccable distill`

3. **[P1] 主动作被拆散，单个结果卡又暴露过多并列动作**

   **为什么重要：** 页面顶部同时放搜索、状态、生命周期、店铺、每页数量和刷新（[SearchTasksPage.tsx:272](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:272)–[SearchTasksPage.tsx:280](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:280)）；运行轮次又同时放上一页、下一页、导入 Shopify、收起；每个结果卡还放导入、商品详情、图片对比和打开 1688 四个动作（[SearchTasksPage.tsx:319](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:319)–[SearchTasksPage.tsx:329](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:329)）。这会让“先搜图还是先导入、导入哪一页还是单条导入”的优先级变得模糊。

   **怎么改：** 明确一条主路径：选择图片 → 配置参数 → 发起搜图 → 审核候选 → 导入。每个层级保留一个主按钮，把“商品详情、图片对比、打开 1688”收进“更多”菜单；运行轮次的目标店铺和导入范围放在同一操作组里。

   **建议命令：** `$impeccable layout`

4. **[P2] 搜图轮次的 tab 语义与状态播报不完整**

   **为什么重要：** 轮次页签使用 `role="tablist"` 和 `role="tab"`，但没有 `aria-controls`、对应 `tabpanel`、键盘左右切换或 roving focus（[SearchTasksPage.tsx:320](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:320)）。运行错误只是普通段落（[SearchTasksPage.tsx:321](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:321)），加载/搜图中的变化也主要依赖视觉文本和 `aria-busy`（[SearchTasksPage.tsx:286](/D:/code/mailshop/web/src/components/SearchTasksPage.tsx:286)）。

   **怎么改：** 如果保留 tabs，实现完整 ARIA 关系和键盘行为；否则改为普通按钮组。为运行错误使用 `role="alert"`，为搜图进度和导入结果提供 `aria-live="polite"`；图片选择按钮增加 `aria-pressed` 或等价的可读选中状态。

   **建议命令：** `$impeccable audit`

5. **[P2] 移动端操作尺寸和筛选布局偏紧**

   **为什么重要：** 紧凑按钮只有 34px 高（[styles.css:1680](/D:/code/mailshop/web/src/styles.css:1680)–[styles.css:1684](/D:/code/mailshop/web/src/styles.css:1684)），结果卡底部动作只用很小的上下内边距（[styles.css:229](/D:/code/mailshop/web/src/styles.css:229)–[styles.css:235](/D:/code/mailshop/web/src/styles.css:235)）。在 700px 以下，状态、生命周期、店铺、每页数量和刷新仍挤在一个三列 grid 中（[styles.css:372](/D:/code/mailshop/web/src/styles.css:372)–[styles.css:378](/D:/code/mailshop/web/src/styles.css:378)），一手操作和误触风险都会上升。

   **怎么改：** 移动端把筛选收进一个“筛选”抽屉或分组面板；主动作和导入动作至少保留 44px 触控高度；详情、对比和外链收进菜单，减少横向换行。

   **建议命令：** `$impeccable adapt`

**认知负荷**

失败项：6/8，属于高负荷。

- [失败] 单一焦点：同一任务卡同时要求用户理解采集、搜图、审核和导入。
- [失败] 分块：任务元数据、参数、轮次和候选结果叠加，单组信息超出易扫描范围。
- [通过] 分组：图片、预览、参数和轮次有明确区块边界。
- [失败] 视觉层级：状态、标题、操作和工作台标题竞争注意力。
- [失败] 一次一件事：搜图配置与导入候选在同一屏并列出现。
- [失败] 最少选择：筛选栏 5 个控制项，结果卡 4 个动作。
- [失败] 工作记忆：用户必须记住顶部店铺选择，再滚动到远处的导入按钮。
- [失败] 渐进披露：任务工作台默认展开，只有轮次内部可折叠。

**情绪旅程**

第一次进入时，用户会感受到“能力很强”，但也会感到工作量突然变大：几乎所有阶段都同时出现。成功搜图和“已进当前店铺”是正向峰值，能让用户确认结果确实落地。情绪低谷出现在失败或空结果：错误文本能出现，但缺少紧邻错误的重试动作和下一步建议。按照峰终定律，最后一次导入若能显示明确的目标店铺、导入数量和失败行处理，会比现在更有完成感。

**Persona Red Flags**

**Alex（高频运营人员）**

- 没有明显的键盘加速或跨任务批量处理路径。
- 需要在页面顶部选择全局店铺，再滚动到具体结果导入，增加上下文切换。
- 每张任务卡都展开完整工作台，列表扫描成本高；Alex 会希望快速批量处理“未搜图”任务。

**Sam（键盘/屏幕阅读器用户）**

- `role="tab"` 没有完整的 tab/tabpanel 关系和键盘方向键行为。
- 图片选择按钮只通过 `.selected` 边框表达状态，没有 `aria-pressed` 等明确选中语义。
- 运行失败是普通 `<p>`，搜图进行中主要依赖视觉旋转图标和文本，状态变化不一定被及时播报。

**Casey（被打断的移动用户）**

- 顶部目标店铺和底部导入动作距离很远；中断后需要重新回忆当前目标。
- 34px 紧凑按钮和结果卡底部小型文字动作不适合单手点击。
- `drafts`、选中图片和展开状态只存在组件内存中，刷新或离开页面后会丢失当前编辑上下文。

**次要观察**

- `PRODUCT SOURCING`、`SOURCE IMAGES`、`SEARCH CONFIG` 等英文 kicker 与中文主界面并存，品牌上是合理的运营工具感，但需要统一规则，避免有的区块翻译、有的不翻译。
- 删除使用浏览器原生 `window.confirm`，行为可靠但视觉和键盘体验与 Mailshop 自有弹窗不一致。
- `search-task-result-copy > span` 的旧 CSS 选择器与当前 JSX 的 `<div>` 不匹配，虽不构成主要视觉问题，但会增加维护噪声。
- 当前 `typecheck` 通过；这证明类型和语法完整，不等于交互链路已经在有真实数据时验证过。

**可进一步追问的问题**

- 如果每张任务卡默认只展开一个“当前任务”，是否会比现在的全展开工作台更符合日常节奏？
- 多店铺场景下，导入按钮旁直接显示店铺名，是否比顶部统一选择器更安全？
- 对结果卡而言，最值得保留为主按钮的是“导入 Shopify”，还是“商品详情/图片对比”？
