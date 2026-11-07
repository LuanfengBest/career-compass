> 2026-11-05 更新：网站岗位采集已移除，旧线索只读归档。Dot 本地加密凭据工具与 Muse 浏览器工作台接入步骤，以 [COLLABORATION_WORKFLOW.md](COLLABORATION_WORKFLOW.md) 顶部为准；下文来源覆盖是历史记录。

> 2026-11-05：任务入口 http://127.0.0.1:3000/tasks；另开终端运行 `npm run worker` 可启用不依赖网页的 Gmail 只读同步。两位 Agent 的计划需各自在产品中保存。当前操作与文件清单见 [COLLABORATION_WORKFLOW.md](COLLABORATION_WORKFLOW.md)。

## 2026-11-04: Personal-agent portal MVP (latest)

The latest architecture and connection instructions are in [AGENT_PORTAL_MVP.md](AGENT_PORTAL_MVP.md). Muse / Dot provide research, drafts and interpretation; the website makes no model calls. New Agents, contact timelines and Gmail send controls are implemented. Real Muse/Dot reporting and the user's Gmail sending authorization still need validation. Earlier snapshots below describe previous revisions, not the latest connection state. Opportunities now defaults to all retained leads; eligibility filters remain available.

## 2026-11-04: Application-only Gmail filtering and Data navigation

Verified snapshot: all 223 cached recent messages re-read; final visible application events = 26 (13 Applied, 4 Assessment, 9 Rejected). No pending classification upgrades. Screenshot newsletters and BCG coaching advice excluded; original emails and tracker unchanged. 57 tests, ESLint, production TypeScript/build, HTTP/Data navigation and SQLite integrity checks passed. Browser visual verification remains unavailable. Changed files: app/lib/mail.ts, app/lib/server/gmail.ts, app/components/email-review.tsx, app/components/shell.tsx, app/api/integrations/route.ts, tests/integrations.test.mjs, and this guide.

- `app/lib/mail.ts` (`mailClassificationVersion = 3`) now rejects newsletter senders, bulk List-ID messages, career events and general job alerts before matching status phrases. An actual application acknowledgement or personal application update is required. A recruiter sender, general career keywords, and generic "successfully submitted" are no longer sufficient. Explicit application-in-review updates can remain unclassified. Rejections / interview / assessment / offer decisions take precedence over a thank-you opening. Conditional phrases such as "If you are not selected" are not decisions; future interview advice is not an invitation. Recorded competency interviews and completed assessments count as Assessment. Regression coverage includes the observed Roblox/Verisk rejection wording and IBM/Chewy conditional disclaimers. This remains a deterministic rule classifier, not an LLM.
- `app/lib/server/gmail.ts` applies the same rules to new imports and `/api/gmail/reclassify` for stored messages, reads the original unquoted body (snippet only as fallback), and checks List-ID. Reclassification preserves manual corrections, dismissals, Gmail history checkpoints and tracker records; no Gmail messages are deleted, relabeled or sent.
- Data is now a primary sidebar item in `app/components/shell.tsx`, at http://127.0.0.1:3000/data. The Settings → Accounts & permissions → Database → Browse saved jobs & people link remains available.
- This session's browser inventory returned `browser access host is unavailable`. Chrome running alone does not give the agent browser control. The available LinkedIn connector only searches profiles with a required first/last name; it cannot sync connections or messages and is not an installed Career Compass backend integration.
- LinkedIn API access: ordinary Sign in with LinkedIn does not grant general connection / messaging access. Connections API requires LinkedIn approval: https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api. Existing connections/messages can instead be supplied via the user's own archive: https://www.linkedin.com/help/linkedin/answer/a1339364 (an archive importer is not yet implemented).
- Simplify and Jobright website ingestion is not implemented. Stable integration needs a supported/authorized data interface or a user-provided export plus an adapter, pagination, deduplication and scheduling. Login alone is not an API. Current published terms restrict automated collection: https://simplify.jobs/terms and https://jobright.ai/legal/service. Their GitHub sources remain separate existing adapters. No public self-service developer API was verified in this audit.

## 2026-11-04: Eligibility audit and readable database tables

The former collector filters PM/DS/DA titles and some senior titles; it does **not** establish 2027 graduate eligibility or full-time employment. Retained workspace leads are not approved applications.

- `app/lib/eligibility.ts`: deterministic conservative screen, shared by Opportunities and the data browser. Default view is Target candidates. Positive early-career and current full-time evidence is required; explicit incompatible cohorts, internships and senior titles are excluded. Missing evidence, complex experience requirements, MBA/PhD requirements, directory-only programs, future conversion to full-time, and work-authorization restrictions require review. No repository name, date of collection or company name proves eligibility. June 2027 graduation/start dates, sponsor conditions and complete JD requirements still need employer verification. This is not an LLM adjudicator.
- Snapshot before another source refresh: 879 saved jobs; 0 Target candidates, 809 Needs verification, 70 Not a match; 1 saved contact. Original records retained. Empty target list means evidence is insufficient, not that the market has no jobs.
- `app/lib/server/source-parser.ts`: initial title/family/region screening. `extra-sources.ts` and `employer.ts` retain employer employment-type and qualification evidence for subsequent refreshes. Existing cached descriptions may be truncated.
- Read-only table browser: http://127.0.0.1:3000/data (also Settings → Browse saved jobs & people). Search, Jobs/People selector, 30 rows/page, Refresh data. Reads persisted SQLite records, not unsaved edits; does not expose settings or tokens.
- SQLite file: `.data/career-compass.sqlite`. `workspace.body` remains the authoritative JSON snapshot. New `jobs` and `people` SQL views project that JSON into columns, always reflecting saved changes. They are not duplicate physical tables and cannot be edited directly. `leads` remains the source cache. View definitions: `app/lib/server/database.ts`.

```sql
SELECT company, role, company_bucket, posted_at, source FROM jobs;
SELECT name, company, title, connection_status, linkedin FROM people;
```

Source status is a 2026-11-04 run snapshot, not a promise of current coverage:

- 25 company feeds completed their adapter queries: OpenAI, Anthropic, Google DeepMind, Google, NVIDIA, Lyft, DoorDash, Airbnb, Stripe, Roblox, Coinbase, Block, Snowflake, Datadog, Palantir, Waymo, Zoox, Aurora, Nuro, Motional, Cisco, Broadcom, Adobe, Workday, Databricks. Zero retained matches is possible; successful transport does not mean a suitable vacancy exists.
- 9 partial public-page adapters, zero imported matches: Apple, Amazon, Microsoft, Netflix, Qualcomm, AMD, Salesforce, HubSpot, Atlassian. Dynamic content / unexposed pagination still needs adaptation.
- 5 failed: Meta and Cruise (fetch failed), Uber (406), Tesla and ServiceNow (403).
- Other completed feeds: Built In, APM List by Aced, APM New Grad Tracker, PM Recruiting Hub, WonOfAKind, SpeedyApply, Simplify GitHub, ambicuity, Jobright Data Analysis and Product Management GitHub, TrakkerHQ. Repository cohorts and internship mixtures must be checked per posting; Jobright repositories currently include 2026-labelled lists.
- LinkedIn: partial public 24-hour job-card import, 88 results on last run; no account login, general people-search API, connection sync or message sync. Profile URLs, manual connection status and locally prepared drafts are available; messages require manual sending.
- Manual discovery only: Indeed (access check 403), Simplify website, Jobright website, YC, Wellfound, a16z, Sequoia, Anker, DataAnalyst.com, Aced Entry Level DS. A working discovery URL does not mean ingestion is implemented.
- Source management is in Settings. Automatic checks run hourly only while Opportunities is open and visible and the local server/computer are running. No always-on cloud scheduler.

Validation: 52 tests, ESLint, production build with TypeScript, and SQLite quick_check passed. Database backup created before view initialization under `.data/backups/before-data-views-*`. Updated files: eligibility.ts, jobs.tsx, database.ts, api/data/route.ts, data/page.tsx, integrations.tsx, globals.css, server/extra-sources.ts, server/employer.ts, tsconfig.test.json, domain/integrations tests, this setup guide. Browser visual inspection was not performed in this audit.

# Career Compass：本地实战接入

本阶段由用户确认使用 SQLite，无需注册 Supabase。云端方案后续单独决定；本版不能直接公开部署。

## 本轮界面与同步修正（2026-11-04）

本轮刷新后工作区 879 条线索、来源缓存 846 条；保留历史线索与人工编辑，所以数量不同。已完成当前缓存近期邮件的正文重分析，51 条纳入求职邮件列表；Finance Student Panel 已排除，Munich Re 已按原文判定 Rejected。源码检查、类型检查和 48 项回归测试通过，生产构建通过；浏览器控制未连接，屏幕布局及已登录 Gmail 的实际跳转尚未做交互验收。

以下旧快照数值仅反映当轮状态。

- Opportunities 移除来源库大面板；来源管理移至 Settings 底部。岗位和联系人采用约 260px 的摘要卡片，桌面三列；按桌面一屏约两行设计，完整 JD、关联点、证据在详情弹窗中保留，关闭弹窗不影响分页。
- 筛选器横向排列，窄屏按行换行。分页的 Previous / Page / Next 同一行、同高。新增 Company 类别和 Posted 日期筛选（24 小时 / 7 天 / 30 天 / 日期未知）；默认 All dates，不默认丢弃未知日期线索。
- 现有岗位没有统一的发布日期下限。改动前 765 条线索中只有 247 条记录发布日期，最早为 2022-05-04；其他日期未知。LinkedIn 查询使用最近 24 小时，其他来源读取其当前公开列表；采集日期绝不是发布日期，也不保证该岗位适合 2027 毕业生。
- 岗位页打开且可见时，每分钟检查来源状态；对超过一小时未检查的已实现导入器发起刷新，也可点 Refresh jobs。刷新后直接合并来源证据，不必再手工 Add cached leads。保留人工编辑的公司 / 标题 / 类别及全部投递状态；完整来源列表中消失的旧线索标注 Not in latest source，部分覆盖 / 失败不据此判定关闭。公开 HTML 仅检查的适配器仍在 Settings 手动运行。关页 / 关机不能持续调度，不是实时推送服务。
- Applications 删除全局 Email status 下拉；逐封状态按正文规则识别，保留手动纠错。读取 HTML 和纯文本，去除引文，拒信 / 面试等明确决定优先于感谢申请的开头；证据矛盾或缺失仍待核实。Dismiss 与 Status 控件同高、底边对齐。
- 邮件链接不再固定 Gmail 的第一个账号：带入已连接邮箱，通过 Message-ID 精确定位；缺少 Message-ID 时按对应 threadId 定位。依据 [Gmail 官方搜索语法](https://support.google.com/mail/answer/7190?hl=en) 的 rfc822msgid。未在登录状态的浏览器里完成点击验收。
- 为旧缓存提供 `/api/gmail/reclassify`：只读重新分析最近 30 天原邮件，每批 15 封，保留人工纠错和 Dismiss、不改变 history 游标或投递阶段。版本断点允许失败后继续，全文不持久化。

本轮代码：`app/components/{jobs,people,detail-dialog,job-refresh,pagination,email-review,settings,source-panel,integrations}.tsx`、`app/globals.css`、`app/lib/{logic,model,mail}.ts`、`app/lib/server/{gmail,mail-content}.ts`、`app/api/gmail/reclassify/route.ts` 和回归测试。数据库改动前已使用 SQLite backup API 备份。

## 1. 当前状态（2026-11-04，本轮更新）

| 模块 | 本轮实现与验证 |
| --- | --- |
| 个人资料 | 五份简历 / 经历 / 面试材料提取事实，保存英文介绍、PM / DS / DA 三组素材和文件来源；多版本不一致的成果数字不默认写入草稿 |
| Opportunities | 桌面三列，平板两列，手机一列；每页 30 条，筛选后分页，页码跳转；总量不截断 |
| People | 删除岗位 / 人群搜索筛选面板；三列、每页 30 人；每人单独保存 To Be Connect / Connected |
| Applications | 独立投递指标、阶段筛选；表格和看板同步，每页 20 条。邮件列表另有指标、筛选、每页 20 条，直接修改邮件状态，取消关联投递下拉和 Apply to tracker |
| Gmail | 仅最近 30 天，旧 180 天游标自动重建；history 增量也检查日期；明显财经 / newsletter / 社团广告过滤。旧缓存保留但不进入当前列表和指标 |
| Outreach | LinkedIn 页不展示回复指标；Email 页仅统计 emailStatus 手动记录，明确不是读取 LinkedIn 回复 |
| 数据库 | SQLite，持久化、revision 乐观锁、来源缓存、同步游标、邮件事件；Settings 显示实际文件路径和记录数 |
| 岗位源 | 61 个入口，51 个有公开导入 / 页面检查适配器；其中目标雇主 39 家全部有入口，25 家本轮采集完成、9 家部分覆盖、5 家失败。并非 51 个完整爬虫 |

实际工作区：765 条线索，559 条美国线索，21 条 TikTok 美国线索；1 位联系人和原有草稿保留。最新来源缓存 762 条，工作区保留既有线索与编辑，因此两者数量可以不同。当前最近 30 天有 40 条可见求职邮件；Google 限流导致回溯仍未完成，稍后在 Settings 继续即可。

## 2. 本地启动与存储

需要 Node.js 24 或更新版本。

```bash
npm install
npm run setup:local
npm run dev
```

固定入口：<http://127.0.0.1:3000>。用这个地址访问，避免与 `localhost` 混用。`APP_URL`、端口和 Google 回调必须一致。启动脚本绑定 127.0.0.1，API 同时检查 Host 和写入请求的 Origin，拒绝跨站请求；这不是可用于公网的登录系统。

- `.env.local`：已生成加密密钥；文件权限 0600，不入 Git。脚本重复执行不会覆盖原配置。
- `.data/career-compass.sqlite`：工作区、公开岗位缓存、Gmail 事件和加密授权；WAL 模式。目录 0700、数据库 0600，不入 Git。
- `TOKEN_ENCRYPTION_KEY`：AES-256-GCM 密钥。不要随意重置，否则已保存的 Gmail token 无法解密。
- Gmail token 加密；工作区和邮件标题 / 发件人 / 摘要在本机数据库中保存明文。完整邮件正文仅在同步时分析，不持久保存；不发送到 AI 服务。
- 页面载入数据库，修改排队保存，所有页面共享同一个工作区。多标签页并发修改会被 revision 拦截，不静默覆盖。
- 有保存错误时先导出当前 JSON，再刷新。浏览器中也保留一份未保存副本，Settings 可导出。
- 旧版 localStorage `career-compass:workspace:v1` 不删除、不自动导入。Settings 的 **Export previous browser data** 可取回旧数据；新工作区不混入虚构岗位和联系人。
- Settings 的 Clear workspace 只清空工作区，不删除来源缓存和已导入邮件。Disconnect Gmail 删除本地授权并尝试撤销 Google token，保留已导入事件。

备份：优先通过 Settings 导出工作区。完整数据库备份应停掉服务后连同 `.env.local` 一起妥善保存（运行中不要只复制 SQLite 主文件而漏掉 WAL）。电脑关机后数据保留，采集和同步停止。

## 3. 你需要完成的 Google 配置

1. 在已有 Google Cloud 项目中启用 **Gmail API**。
2. 配置 OAuth consent screen / Google Auth Platform。若为 External + Testing，把 `GMAIL_ACCOUNT_EMAIL` 对应账号加为 Test user。
3. 创建 **Web application** 类型 OAuth Client。
4. Authorized redirect URI 填写：`http://127.0.0.1:3000/api/gmail/callback`。
5. 在本地 `.env.local` 填写三个字段；不要在聊天中发送密钥：

```dotenv
GOOGLE_CLIENT_ID=你的ClientID
GOOGLE_CLIENT_SECRET=你的ClientSecret
GMAIL_ACCOUNT_EMAIL=你要连接的邮箱
```

保留已有 `APP_URL`、`CAREER_DB_PATH` 和 `TOKEN_ENCRYPTION_KEY`。

6. 重启 `npm run dev`。Settings → **Connect Gmail** → 在 Google 页面由本人登录并同意只读权限。
7. 打开 **Allow Gmail sync**，等顶部显示数据库已保存，再点击 **Sync Gmail**。
8. **Sync all remaining pages** 连续处理，保持页面打开；**Stop after this page** 在当前页结束后停止。也可单次点击 **Sync next page**。限流后稍后重试，已导入记录不会丢失。首轮回溯结束后还会补 history 增量，才显示追平。
9. Applications → **Application emails**：按状态筛选并分页查看，直接修改每封邮件的 Status。邮件状态不自动改动下方 Tracker；Dismiss 仅隐藏该本地事件。

本版只请求 `gmail.readonly`，不请求发送、修改、删除权限。只读 scope 本身允许读邮箱；应用在首轮查询中用求职关键词缩小范围，并跳过 Sent / Draft。关键词可能漏掉特殊格式邮件，规则可能误判，故阶段需人工确认。断开、暂停和自动化尚未调度的状态都在 Settings 显示。

初次同步先记录 Gmail historyId，再回溯 30 天，完成分页后从该游标追增量；每封邮件按 messageId 去重。分页失败不推进游标；history 过期（404）提示再次回溯，不删除既有事件。邮件原始链接按 Gmail 默认账号打开，多账号时请确认正在查看正确邮箱。

常见问题：

- `redirect_uri_mismatch`：核对协议、127.0.0.1、端口和完整 callback 路径。
- Access denied：检查 test user、组织管理员策略及是否选了配置中的邮箱。
- Google API 返回 403：界面区分配额 / 频率限制、管理员策略和权限不足。限流无需重新配置 OAuth，稍后重试；不跳过失败页。
- Refresh / invalid grant：重新授权。External Testing 模式的这类 refresh token 通常 7 天失效，不能当作长期无人值守连接。
- 页面仍显示未配置：保存 `.env.local` 后重启服务；不把 secret 放进 `NEXT_PUBLIC_*`。

参考：[Google Web Server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)、[Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)、[OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)。

## 4. 岗位来源如何工作

2026-11-04 偏好更新：用户明确要求查看 TikTok 美国岗位，实际工作区及新工作区默认值均关闭 TikTok 排除。公司偏好可在 Settings 调整；明确不支持 sponsorship 的独立筛选仍保留。

2026-11-04：岗位页默认使用 **All imported + All regions**，保留全部已导入线索，每页最多 30 条，通过分页访问全部结果。**Matches preferences** 应用排除偏好，**Excluded** 单独查看排除项；地区和关键词仍可手动筛选。界面显示总量及被当前筛选隐藏的数量。此前 53 → 44 的构成为：3 条欧洲岗位、5 条 TikTok 美国岗位、1 条明确不支持 sponsor 的美国岗位；不是截断前 44 条。

来源目录在 `app/lib/sources.ts`，岗位页可直接查看。

已实现导入：WonOfAKind、PM Recruiting Hub、Simplify New Grad、SpeedyApply、ambicuity/New-Grad-Jobs、Jobright Data / Product、TrakkerHQ/product-jobs；另有 Built In、APM .com / .org。Jobright 当前仓库名称含 2026，不能据此推定适合 2027 毕业条件。

39 家指定雇主在 `app/lib/companies.ts` 逐一登记，Opportunities → Target companies 显示覆盖情况和官网入口。Greenhouse / Ashby / Lever 读取公开岗位列表；Google / DeepMind 跟随公开下一页；NVIDIA / Broadcom / Workday / Adobe / Cisco 使用官网公开 Workday 搜索，每轮查询 data scientist、product manager、analyst。分页保存断点；失败不丢已完成页。完成仅指这些查询范围，不代表获取所有职位类别。

本轮直接来源采集完成的 25 家：OpenAI、Anthropic、Google DeepMind、Google、NVIDIA、Lyft、DoorDash、Airbnb、Stripe、Roblox、Coinbase、Block、Snowflake、Datadog、Palantir、Waymo、Zoox、Aurora、Nuro、Motional、Cisco、Broadcom、Adobe、Workday、Databricks。其中 0 条表示标题 / 地区筛选后没有匹配，并非公司没有招聘。

部分覆盖 9 家：Apple、Amazon、Microsoft、Netflix、Qualcomm、AMD、Salesforce、HubSpot、Atlassian。公开 HTML 未提供可确认的完整职位列表；保留官网入口和聚合来源线索。访问失败 5 家：Meta、Uber、Tesla、Cruise、ServiceNow。失败不推定公司停招，也不绕过限制。

LinkedIn：公开搜索参数 `f_TPR=r86400`，三组 PM / DS / DA 查询，共采集 91 条卡片，标注部分覆盖和 Source listing；不绕过登录墙，不声称已读取全文。搜索引擎收录页仍需人工核对，未实现全网索引采集。

Indeed 入口访问返回 403，保持手动发现。Simplify 网站、Jobright 网站、YC、Wellfound、a16z、Sequoia、Anker、DataAnalyst.com、Aced DS 仍保留入口和访问检查；GitHub 列表的导入不代表对应网站全量爬取。无需 GitHub token。

- Built In：按页面编号抓取全部分页，请求间隔约 1.2 秒，每页保存断点。429 尊重 Retry-After，至少冷却 60 秒。失败时保留已解析线索和页码，下次刷新继续；面板显示 partial 和覆盖页数，全部成功后才替换该来源缓存。
- APM .com：仅导入第一张全职表明确为 Open 的行，排除预测和实习表。无准确标题或地点时标明项目线索与 Unknown，不推定在美国。
- APM .org：读取 JSON-LD 和公开页面序列化的岗位状态，包括 Show more 内的记录。只做 JSON 解码，不执行网页脚本；每轮以可见 Open 标签核验状态码。聚合网站 validThrough 不等于雇主截止日期。
- Built In / APM .org 聚合链接显示 Source listing，不冒充 Original JD。

流程：固定来源白名单 → 限时抓取 → 解析表格 → PM / DS / DA 标题筛选 → 排除显式 senior / PhD / SWE / MLE 等标题及已关闭标记 → 原始链接去追踪参数 → 稳定 ID → 公开 ATS 补充 → SQLite 缓存 → Add cached leads 导入工作区 → Save to tracker。

每次刷新不改变已有投递阶段或用户编辑。导入只新增 ID / URL 尚不存在的记录，因此已有工作区岗位不会随来源刷新自动覆盖；可查看源目录和原始 JD 核查变化。不同官网 URL 指向同一 requisition 的情况仍可能形成重复线索，不能把稳定 URL 去重称作语义去重。

- 抓取日期不等于发布日期；来源写的预测日期不等于申请截止日期。
- `verified` 保持空值，ATS 返回只说明该接口当时有记录，不证明毕业条件、签证或个人匹配。
- 已支持 ATS 读取原文片段；其他岗位明确显示“Full employer JD has not been imported”。这不是 AI 摘要。
- Greenhouse / Ashby 请求由识别出的白名单 URL 构造，网站不抓取任意用户 URL，避免 SSRF。
- 明确不支持 sponsorship 的来源标记 / 雇主文本保留证据；未说明的保持 Unknown。Unknown 不等于支持 OPT 或未来 sponsor。
- TikTok 过滤识别大小写和来源附加的装饰符号。非美国岗位按地区分开，不套用 OPT 判断。
- 60/20/20 继续作为排序目标。已登记公司按类别分类并保存理由；所有岗位都有非空 Company bucket。不能可靠判断规模 / 来源的保留 Other / review needed，非科技成熟企业用 Other established companies；两者均不凑入 60/20/20，可在卡片手动修正。不会为凑配比虚构岗位。
- 雇主接口找不到的岗位标注可能关闭；不把来源列表存在当作实时开放证明。
- 抓取失败显示失败原因并保留旧缓存；成功但没有匹配岗位时显示 0，不能解读为该平台没有任何岗位。

接口参考：[Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)、[Ashby Public Job Posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)。

## 5. LinkedIn 需要做什么

People → Add contact，填写真实姓名、公司、职务、LinkedIn 主页、证据和关联岗位。列表直接显示联系人，每人可改 To Be Connect / Connected；不自动读取 LinkedIn 连接状态。Outreach 选择联系人、岗位和目的，生成并编辑模板，复制后由本人发送，再手动记录状态。

Settings 已保存材料摘要：Yale Biostatistics / Data Science、2027 毕业、Amap / DiDi / Keeta 经历、Aceit 项目。草稿按岗位家族选择素材，不杜撰校友关系、签证资格或未经确认的成果数字。原 PDF / DOCX 不上传第三方，提取文本在本机忽略目录 `.data/profile-import/`；现有草稿不会被批量覆盖。

这条流程不需要 LinkedIn 开发者密钥、密码或登录 cookie。普通开放权限并不包含通用搜人、职位搜索和私信收发；聊天连接器的权限也不会传给网站。后续若取得批准的产品 API，再增加独立适配器。[LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

## 6. 数据库结构、检查与修改文件

数据库默认位于项目内 `.data/career-compass.sqlite`，由 `.env.local` 的 `CAREER_DB_PATH` 配置；实际路径也在 Settings → Database 显示。无需安装 SQLite 服务或注册 Supabase，Node.js 24 的 `node:sqlite` 自动创建数据库。

| 表 | 内容 |
| --- | --- |
| workspace | 单用户 JSON：资料、岗位、投递、联系人、草稿、偏好；revision 防止多标签覆盖 |
| leads | 公开岗位采集缓存，按原始链接生成稳定 ID |
| source_runs | 每个来源的时间、数量、完成 / 部分 / 失败状态 |
| email_events | Gmail messageId 去重，标题、发件人、摘要、日期、状态、手动修正标记 |
| settings | 加密 OAuth token、同步游标、采集分页断点；不在页面展示 token |
| leases | 同步锁，避免重复运行 |

本轮改动前已使用 SQLite backup API 备份至 `.data/backups/before-profile-and-pagination.sqlite`。Settings → View saved workspace JSON 可查看工作区；Export JSON 不含邮件和授权。数据库可用本地 SQLite 查看器只读打开，不需上传。

检查命令：`npm run lint`、`npm run typecheck`、`npm test`、`npm run build`。42 项测试覆盖来源解析、续行公司、岗位去重、39 家注册、Workday / Google 分页与失败续传、30 天邮件边界、邮件分页、草稿素材选择和原有权限 / 持久化流程。六个页面 HTTP 200，真实邮件两页共 40 条无重复，非法来源请求返回 400。浏览器控制未连接，尚未进行本轮交互和视觉验收。

本轮主要修改：

- `app/components/{jobs,people,pagination,applications,email-review,outreach,settings,integrations,source-panel,application-form}.tsx`：分页、指标、状态、资料与覆盖面板。
- `app/globals.css`：三列响应式布局、分页和自适应指标。
- `app/lib/{model,logic,mail,companies,sources}.ts`：资料和联系人结构、分类、去重、外联素材、邮件筛选、来源注册。
- `app/lib/server/{gmail,source-parser,source-sync,extra-sources,paged-company}.ts`：最近 30 天同步及公开来源适配。
- `app/api/{gmail/events,sources,integrations}/route.ts`：分页 / 状态更新、按源刷新、数据库位置。
- `tests/{domain,integrations}.test.mjs`、`README.md`、`docs/{PROJECT_BRIEF,LOCAL_SETUP}.md`：回归检查和交接。
- `.data/`：真实个人摘要、岗位和邮件数据及备份；不入 Git。`.env.local` 凭据与加密密钥未修改。

尚未实现：未开放网站的完整解析、LinkedIn 私信自动收发、全网搜索索引、云端持续运行、自动邮件发送、AI 个性化评分。公开来源记录是线索，职位级别、毕业条件、截止时间和签证政策仍须核对雇主 JD。

## Persistent local service and cloud release (2026-11-05)

Optional macOS service: after `npm run build` and `npx tsc -p tsconfig.worker.json`, run `node scripts/install-local-service.mjs`. It installs `~/Library/LaunchAgents/com.careercompass.local.plist`, starts the website on `127.0.0.1:3000` and a read-only Gmail sync worker, and restarts them after a process crash or user login. It does not start external agents or change their schedules. Logs are under `.data/logs/`. Stop with `launchctl bootout gui/$(id -u)/com.careercompass.local`. Sleep/shutdown still makes the local website unavailable.

Do not also run `npm run dev` / `npm run start` on port 3000 while this service is active. Rebuilds should be followed by a controlled service restart. For the new authenticated cloud mode and existing-data cutover, follow [DEPLOYMENT.md](DEPLOYMENT.md); earlier local-only deployment notes describe the previous release.

## Browser workbench claim handling (2026-11-06)

Muse's `CLAIM_TOKEN_MISSING` was an omitted request field, not proof of expiry. The workbench now offers a visible task list with a **Claim task** button per queued record, stores that claim privately in the current tab's session storage, hides tokens from rendered receipts, renews immediately and every two minutes while open, and attaches the claim fields to each discovery/draft/task result. Paste one record without `claimToken`, `taskId`, or `batchId`; retain the record's stable `eventId`. Direct API clients still supply claim fields explicitly. Conflicting IDs/tokens are rejected rather than silently overwritten. Restoring the same tab validates its paired actor and server task state before renewal. Closing/suspending the browser can interrupt renewal; this is not an external-agent scheduler. Use the existing owner-side stopped-discovery requeue operation when needed; sends and submissions cannot use it.

Discovery writes use `type: opportunity` with `job`, or `type: contact` with `contact`, not a legacy `action: result` round envelope. Submission failures remain visible beside the submit button and in Last response even after a successful renewal. After readback, the **Complete discovery** form builds `action: report` / `status: completed` with the active claim. Unknown task actions are rejected before claim lookup; a missing task ID is distinguished from an unknown ID.

## End-to-end acceptance before cloud cutover

The first two real collaboration rounds completed discovery and released assignments on 2026-11-06. This confirms ingestion and coordination, not successful form filling, sending or final application submission.

Use a separate user-created pilot batch with both agents searching the same scope, email draft channel and application preparation enabled. Small pilot counts do not change native daily routines. New rounds automatically release preparation when both agents report completion; inspect canonical records and source attribution in Tasks. Legacy manual rounds still need the release button. Sending and final application submission retain their separate user review steps. Test real overlapping evidence where available; if no overlap is found, do not claim real cross-agent deduplication has been demonstrated merely because unit tests pass.

- Application acceptance: an actual employer form is filled using confirmed profile facts; Tasks shows answers, resume version, evidence, unresolved fields and actual form state for user review. `not_opened` or `partially_filled` is not full form completion. Only a separate approved submission task can submit.
- Contact acceptance: one fresh relevant contact has a sourced or explicitly inferred email, a personalized draft saved and read back in Outreach, user review of the exact recipient/text, and one Gmail send receipt. Gmail read-only authorization is insufficient; enable sending in Settings first. API acceptance does not prove inbox delivery, and a reply must not be fabricated to complete a test.
- Cloud cutover follows acceptance, consistent SQLite backup, private data transfer and authenticated readback. Keep the local workspace authoritative until then; do not write to two independent databases.

## 2026-11-07: automatic discovery continuation

- `task-store.ts` requeues expired discovery, draft and read-only review/sync tasks for the same owner on queue access. It also repairs historical blocks with the exact server-generated expiry message. Saved records remain; old claim tokens are invalidated. Explicit failures, cancelled rounds and external application/send tasks are excluded.
- Agents upload discoveries **before** preparing applications. Both completion reports trigger automatic assignment for `autoRelease` batches; a private tracking sheet or a chat report does not close a website task. Completion receipts now include batch status and the actor's queued follow-up tasks.
- `POST /api/agents/tasks` (or MCP `career_task_action`) accepts `amend_preparation` with `taskId`, current `version`, unique `eventId`, actual `formState`, `summary`, `answers` and `evidenceUrl`. This is a same-owner report update for an application preparation already awaiting review; no claim is needed. Prior reports are retained in `task_requests`. Approved/submitted applications cannot be amended through this path. No submission is authorized by an amendment.
- Submission approval requires a reported `filled` form. Partial/not-opened results stay visible for review but cannot create submission tasks.
- Guide v6 / policy `2026-11-07.1` describes these transitions. Native agent schedules and authenticated employer browser sessions remain external dependencies. Website automatic assignment does not wake an external agent.
