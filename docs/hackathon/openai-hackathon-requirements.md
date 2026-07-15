# OpenAI Build Week 参赛要求与 Media Dock 准备清单

> 核验日期：2026-07-14（Asia/Shanghai）
> 信息优先级：如页面之间有冲突，以 [Official Rules](https://openai.devpost.com/rules) 为准。规则允许主办方后续修改，正式提交前必须再次核验。

## 结论

截至核验日期，已经确认正在开放报名和提交的 OpenAI 官方全球活动是 [OpenAI Build Week](https://openai.com/build-week/)。OpenAI 官方页面将报名和提交引导至 [OpenAI Build Week Devpost](https://openai.devpost.com/)，正式规则列明 Sponsor 为 `OpenAI OpCo, LLC`，因此这不是第三方借 OpenAI 名义举办的活动。

Media Dock 可以作为既有项目参赛，但有三项必须先解决的门槛：

1. **居住地资格**：个人和每一位团队成员都必须居住在 OpenAI API 支持地区。当前官方支持列表未列中国大陆、香港和澳门，列有台湾。因此，如果参赛人当前居住在中国大陆、香港或澳门，按已发布规则不能作为个人或团队成员参赛；不能通过让其他地区的人代为提交规避，因为团队本身也只能由合资格个人组成。[Official Rules §3](https://openai.devpost.com/rules) · [OpenAI API supported countries](https://developers.openai.com/api/docs/supported-countries)
2. **既有项目边界**：Media Dock 在提交期前已经存在，必须在 2026-07-13 09:00 PT 之后用 Codex 和/或 GPT-5.6 做出“实质扩展”。评审只看提交期内新增的工作，必须通过有日期的提交历史、带时间戳的 Codex 会话等证据明确区分旧版和新增内容。[Official Rules — New & Existing](https://openai.devpost.com/rules)
3. **GPT-5.6 不能只是开发时提过**：Codex 必须实际用于开发，并提交主要构建任务的 `/feedback` Session ID；项目也必须实质使用 GPT-5.6。FAQ 要求在代码仓库、README 和演示视频里说明 GPT-5.6 如何集成、具体做什么，不能只是装饰性提及。[Official FAQ — Tools](https://openai.devpost.com/details/faqs)

当前 Media Dock 代码中已有 OpenAI-compatible 字幕整理接口，但并未明确锁定或展示 GPT-5.6。若决定参赛，最省风险的方向是把这条能力升级成可真实运行、默认关闭、用户明确授权的 GPT-5.6 工作流，并保留本地优先和敏感信息不上传的产品边界。是否满足资格最终仍应在 [Build Week Discussion Board](https://openai.devpost.com/discussions) 或官方 Discord 的 `#build-week-chat` 取得书面确认。

## 时间表

| 事项 | 官方时间（PT） | 北京时间换算 | 状态 |
| --- | --- | --- | --- |
| 注册开放 | 2026-07-09 10:00 | 2026-07-10 01:00 | 已开放 |
| 提交开放 | 2026-07-13 09:00 | 2026-07-14 00:00 | 已开放 |
| 免费 Codex credits 申请截止 | 2026-07-17 12:00 | 2026-07-18 03:00 | 注册后可申请，数量有限且需审批 |
| 注册与提交截止 | **2026-07-21 17:00 PDT** | **2026-07-22 08:00** | 硬截止；建议至少提前 12 小时提交 |
| 正式规则所列评审期 | 2026-07-22 10:00—2026-08-05 17:00 | 2026-07-23 01:00—2026-08-06 08:00 | 项目需保持免费可测试 |
| 预计公布结果 | 约 2026-08-12 14:00 | 约 2026-08-13 05:00 | 以最终通知为准 |

来源：[Official Rules §1](https://openai.devpost.com/rules)、[Official FAQ](https://openai.devpost.com/details/faqs)。OpenAI 活动落地页把评审期写为 7 月 22 日至 8 月 7 日，与正式规则的 8 月 5 日存在冲突；按规则中的优先条款，应以正式规则为准。

注册参与者可申请最多 100 美元的 Codex credits，申请截止为 7 月 17 日 12:00 PT，限量且需批准，并须在 7 月 31 日前使用。该活动没有单独提供 OpenAI API credits；额外费用由参赛者承担。[Official Rules §4](https://openai.devpost.com/rules) · [Official FAQ — Credits](https://openai.devpost.com/details/faqs)

## 参赛资格与团队

- 个人必须达到居住地法定成年年龄；未成年学生需要由符合条件的父母或监护人参赛。
- 可以个人、团队或组织参赛。团队或组织必须指定一名符合资格的代表。
- 跨国团队可以参加，但每名成员都必须分别满足其居住地资格。
- 规则明确排除受美国或当地法律限制的地区和人员，以及主办、执行、评审相关人员和可能存在利益冲突者。
- 正式规则和 FAQ **没有公布团队人数上限**。一等奖“最多两张 DevDay/Exchange 门票”只是奖项配置，不能推断为团队最多两人。
- 同一参赛者可以提交多个作品，但每个作品必须独特且彼此有实质差异；每个项目最多获得一个奖项。

来源：[Official Rules §3](https://openai.devpost.com/rules)、[Official FAQ — General](https://openai.devpost.com/details/faqs)。

## 必须使用的技术

- 必须使用 **Codex** 完成真实开发工作，并在描述、README 和演示视频中具体说明 Codex 加速了什么、参与了哪些关键产品/工程/设计决策。
- 必须提交主要构建任务通过 `/feedback` 生成的 Codex Session ID。跨多个任务时，选择承载大多数核心功能开发的那一个。
- 项目必须**实质使用 GPT-5.6**；FAQ 表述为在项目中集成，并在代码仓库、README 与演示视频中说明它具体执行的功能。
- 可以同时使用其他模型、框架、开源库和第三方 SDK，但必须具备合法使用授权并遵守许可证。
- Devpost Hackathons Plugin 是可选工具，不安装也能报名和获奖；插件输出不是规则的权威来源。

来源：[Official Rules — Project Requirements](https://openai.devpost.com/rules)、[Official FAQ — Tools](https://openai.devpost.com/details/faqs)。

## 允许的项目与推荐赛道

项目可以是应用、Agent、网站、游戏、工作流、插件、技能、MCP、工具或其他可运行成果，但只能选择一个赛道：

| 赛道 | 官方范围 | Media Dock 适配判断 |
| --- | --- | --- |
| Apps for Your Life | 日常生产力、创意、家庭、旅行、健康、个人财务等消费应用 | 如果强调普通用户本地下载、整理和媒体交付，可选 |
| **Work and Productivity** | 工作流自动化、分析、支持、销售、后台和团队效率 | **推荐**：把 Media Dock 定义为创作者的本地媒体采集、音画合并、质量选择、任务追踪与诊断工作流 |
| Developer Tools | 测试、DevOps、Agent 工作流、安全等开发工具 | 只有在主叙事转为开发者工具时才合适 |
| Education | 学生、教师和教育机构 | 当前产品主线不匹配 |

这是基于官方赛道定义对 Media Dock 的产品定位建议，不是主办方的预先认可。来源：[OpenAI Build Week overview](https://openai.devpost.com/)。

## 必交材料

- [ ] 一个能在目标平台稳定安装、运行，并与演示一致的工作项目。
- [ ] 选择一个且仅一个赛道。
- [ ] 英文项目标题、简介和完整功能说明；中文材料如保留，必须提供完整英文翻译。
- [ ] **不超过 3 分钟的公开视频**：上传到 YouTube 并设为 Public，必须展示真实运行并有语音旁白。
- [ ] 视频旁白必须说明：项目解决什么问题、如何使用 Codex、GPT-5.6 如何集成并具体做什么。
- [ ] 代码仓库 URL：可以公开，也可以私有。
  - 公开仓库必须带有适当许可证。
  - 私有仓库必须授权 `testing@devpost.com` 和 `build-week-event@openai.com` 访问。
- [ ] README 至少包括：安装、运行、测试、必要样例数据、支持平台、Codex 协作过程、关键人工决策、GPT-5.6 集成说明。
- [ ] 主要构建任务的 `/feedback` Codex Session ID。
- [ ] 让评委无需从源码重新构建即可测试：为桌面应用提供可直接安装/运行的测试构建、清晰平台说明和最短验收路径。
- [ ] 在评审结束前，项目和测试路径均免费、可访问、无额外限制。

评委可以只根据描述、截图和视频评审，并不保证真正安装测试。因此，视频必须在三分钟内独立证明产品有效，截图和 README 不能依赖评委先运行应用才能理解。[Official Rules — Submission Requirements & Testing](https://openai.devpost.com/rules) · [Official FAQ — Submissions & Demo Video](https://openai.devpost.com/details/faqs)

## 既有项目的证据包

Media Dock 需要单独准备一份 Build Week 增量说明，推荐至少包含：

1. 提交期开始前的基线版本、分支或 commit。
2. 2026-07-13 09:00 PT 之后新增或实质改造的功能清单。
3. 每项新增能力对应的 dated commits、测试结果和截图。
4. 主要 Codex 构建任务的 Session ID，并说明其他关键任务如何分工。
5. GPT-5.6 集成的代码入口、数据边界、用户授权流程和真实运行证据。
6. “旧能力”和“本次参赛新增能力”的对照表，避免把历史工作包装成提交期内成果。

规则明确只评审既有项目在提交期内增加的工作，证据不足会让大量重构成果无法计入。[Official Rules — New & Existing](https://openai.devpost.com/rules)。

## 评审标准

第一阶段先做合格性和主题相关性的通过/不通过检查。通过后，以下四项**等权**评审：

1. **Technological Implementation**：Codex 使用是否深入、熟练，是否有真实投入和非平凡、可工作的实现。
2. **Design**：是否是完整、连贯、可运行的产品体验，而不是只有技术概念验证。
3. **Potential Impact**：是否针对真实用户和具体问题提出可信价值，并由演示证明解决方案确实有效。
4. **Quality of the Idea**：创意和新颖度，以及对问题领域的理解深度。

来源：[Official Rules §7](https://openai.devpost.com/rules)。

Media Dock 的提交叙事应避免“又一个 yt-dlp GUI”，而应聚焦：普通创作者面对登录态、可用画质、剧集筛选、批量并发、音画分离、跨平台内核和错误诊断时，需要一个本地优先、透明且可恢复的交付工作台。

## 奖项

总现金奖池为 100,000 美元。四个赛道分别设置：

- 一等奖：15,000 美元，另含最多两张 DevDay/Exchange 门票、OpenAI Developers 推广、与 Codex 团队交流和一年 Pro Account。
- 二等奖：10,000 美元，另含 OpenAI Developers 推广和一年 Pro Account。

每个赛道各一名一等奖和一名二等奖；每个项目最多获得一个奖项。奖金税费、汇兑费用以及 DevDay 交通、住宿、签证等未明示费用由获奖者承担。[Official Rules §9](https://openai.devpost.com/rules)

## 公开、IP、隐私与版权

- 项目知识产权仍归参赛个人、团队或组织所有；提交后授予 Sponsor 用于评审的非独占许可。
- Sponsor 和 Devpost 可以在活动期间及之后三年宣传作品，并使用贡献者姓名、形象、声音等；部分提交内容会公开。
- 提交不是保密关系。即使仓库设为私有，Sponsor、Devpost 和评委也会看到提交材料和代码。
- 作品必须原创并由参赛者拥有，不得侵犯著作权、商标、专利、合同、隐私或公开权；开源代码和第三方 SDK 必须遵守许可。
- YouTube 演示不得包含没有授权的音乐、视频、商标素材或其他受版权保护内容。

针对 Media Dock：

- 不在仓库、截图、视频、测试包或日志中放入真实 Cookie、账号、Token、私人链接、用户目录或真实下载历史。
- 演示使用自制、公共领域、Creative Commons 许可或获得明确授权的媒体，不用受版权保护的 B 站/YouTube 正片充当样例。
- 对 Cookie 检测、日志导出和 GPT-5.6 请求使用合成数据；录屏前再次检查浏览器地址栏、Finder 路径、系统用户名和通知。
- 若 GPT-5.6 功能需要发送内容到网络，必须默认关闭、明确告知发送范围、只发送完成脱敏的最小数据，并避免发送 Cookie 和媒体内容。
- 核对 FFmpeg、yt-dlp、Deno 及随包依赖的许可证和再分发义务，并在仓库与发布包中保留必要声明。

来源：[Official Rules — Intellectual Property, IP Rights & Publicity](https://openai.devpost.com/rules)。

## Media Dock 提交前最短执行顺序

1. **先确认资格**：以实际居住地对照支持地区；如不满足，不要尝试代报。
2. **立即注册**：在 [openai.devpost.com](https://openai.devpost.com/) 加入活动；如需要，赶在 7 月 17 日 12:00 PT 前申请 Codex credits。
3. **锁定基线**：记录提交期开始时的版本/commit，建立 Build Week 增量清单。
4. **补足 GPT-5.6 实质能力**：选择与核心工作流强相关、默认关闭且隐私边界明确的能力，并保留真实运行证据。
5. **形成可测试 Release**：至少提供评委可直接运行的目标平台构建，不要求评委现场编译。
6. **准备英文 README 与增量证据**：包含安装、支持平台、测试路径、Codex 决策过程、GPT-5.6 集成和旧/新增边界。
7. **录制三分钟以内英文演示**：问题 20 秒、产品实测约 100 秒、Codex/GPT-5.6 证据约 40 秒、价值与隐私约 20 秒。
8. **提交前隐私与版权审计**：对截图、视频、仓库、构建包、日志逐一检查。
9. **提前提交并复查**：不要等到北京时间 7 月 22 日早晨；提交后确认视频公开、仓库授权、测试包和全部链接可访问。

## 官方来源

- [OpenAI Build Week 官方活动页](https://openai.com/build-week/)
- [OpenAI Build Week 官方 Devpost 页面](https://openai.devpost.com/)
- [OpenAI Build Week Official Rules](https://openai.devpost.com/rules)
- [OpenAI Build Week FAQ](https://openai.devpost.com/details/faqs)
- [OpenAI API supported countries and territories](https://developers.openai.com/api/docs/supported-countries)
- [OpenAI Codex community events](https://developers.openai.com/community/meetups)（社区活动列表，不等同于全球挑战提交入口）
