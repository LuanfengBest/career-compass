# 原生日常计划 + 临时 Tasks — policy 2026-11-05.6

本节覆盖历史阶段的每日默认计划说明。用户于 2026-11-05 明确：日常任务在 Dot / Muse 各自设置，网站不规定每天 10 个岗位 / 10 位联系人，也不负责启动日常搜索。

- 删除 Daily autopilot plan 组件、配置保存和自动建每日任务逻辑。`save_routine` / `daily_tick` 返回 410。清除本机 `daily_routine` 设置前做 SQLite 一致备份，不动现有任务、联系人、岗位或外部计划。
- Agent 日常工作来自各自原生计划，空 Tasks 不代表停工。目标与时间只在两个 Agent 中设置。Tasks 用于临时追加/修改，并保留审核与执行状态查看。
- 新的 `begin_discovery_round` 只建立协调记录：调用方明确传入共享 roundKey、title、brief、channel、prepareApplications，没有每日默认值、定时器或数量配额。同一个 roundKey 双方/重试复用同一批次，不覆盖原 brief。返回的 scope 如与本地设定不同，Agent 要报告冲突。
- 原生搜索以本轮协调记录 claim/heartbeat/report。双方完成后自动分配准备：Dot 负责共同和 Dot-only，Muse 负责 Muse-only。网站不替另一 Agent 启动；另一方未完成时，本轮分配等待，不能伪造完成。用户临时批次仍人工 release。
- 协调记录不创建、注册或恢复原生计划，也不授予发送/提交权限；不能用它绕过外部审批拒绝。Dot 之前 register_worker 被拒绝的处理仍须在其原产品获得可信的用户授权并重新审查。
- 自动填表返回真实 formState 和答案，网站审核后才派 application_submit。Outreach 保留完整草稿批量审核、版本/收件人校验、发送结果区分及不确定结果不重试。
- 历史资料用无活动 discovery claim 的 ingestion 路径回填，保留 source/time 和 Agent-reported 标签；不靠重发来导入历史数据。新的双 Agent 搜索走协调轮次，防止尚未对齐就开始起草。
- `register_worker` 是实际外部计划的报告，不等于启动计划。此次没有代任一 Agent 执行它，也没有恢复暂停计划。

本轮验证：75 项隔离测试、Lint、TypeScript、生产构建通过。/tasks、/api/tasks、/api/agents/guide 返回 200；页面已不含每日计划，API 不再返回 routine，guide v4 / policy 2026-11-05.6。当前队列/批次仍为 0，没有添加真实工作、发送或提交；尚未进行外部 Agent 的本轮端到端执行或视觉验收。旧配置备份为 .data/backups/before-retire-daily-plan-1793907484491.sqlite。

转述文字、原 Playbook 冲突和具体步骤见 [DOT_MUSE_HANDOFF.md](DOT_MUSE_HANDOFF.md)。原 Playbook 在 Downloads，未修改；其内部“已授权”描述是待核对资料，不自动扩展为 Dot 的授权。

本轮改动：Tasks UI/API、Agent task actions/policy/guide、Batch 类型、native-rounds 测试；删除 routine 三个实现文件；增加 retire-daily-plan 本地迁移脚本和本说明。历史章节仅供追溯，最新规则优先。

---

# 当前修正：Agent-only discovery（2026-11-05）

本节覆盖下文旧阶段的来源刷新与连接方式描述。

- 原 1,121 条由网站的 TypeScript 来源适配器采集：雇主网站、LinkedIn 公开职位、Jobright/Simplify 等 GitHub 列表与公开目录；不是两个 Agent 的结果，也不是 1,121 条已核实的 2027 全职岗位。
- 修复 LinkedIn 职位 URL 跟踪参数去重，合并 197 条确定重复，保留 alternateSources。剩余 924 条旧线索已备份并归档；当前机会 0、联系人 2、正式申请 0。联系人保留，不伪造新发现。归档联系人关联仍可通过稳定 job ID 在 Data 查证。
- 删除 JobRefresh、SourcePanel 及 source-sync/source-parser/source-access/builtin/employer/paged-company/extra-sources 采集代码。`/api/sources` 和 `/api/sources/check` 返回 410，不再进行网络采集。静态公司目录仅供分类参考。
- 历史数据在 Data → Archived website feeds；SQLite `archived_jobs` 表。备份 `.data/backups/before-agent-only-1793901545159.sqlite`。`scripts/archive-legacy-jobs.mjs` 只归档无 Agent 来源且未关联申请的旧采集记录，并拒绝在有任务历史时自行改写引用。
- `app/lib/job-identity.ts` 统一强身份 URL；`server/portal.ts` 在 Agent 回传入口合并；`server/task-actions.ts` 在批次分配时冻结 owner。姓名/公司相似只提示，不随意合并。历史备份保存合并前数据。

当前验收：68 项隔离测试、Lint、TypeScript 与生产构建通过；本地九个页面 HTTP 200，已退休来源接口 410，未鉴权队列 401，跨站配对 403。Dot 本机加密凭据已准备并通过 `/api/agents/connection` 认证诊断；此诊断不记作 Agent check-in/队列检查，不领取任务。浏览器控制 host 不可用，未完成视觉点击验收。两个外部 Agent 的实际队列执行与计划仍未验证。

## 接入修复：先验证一次，再验证定时

**Dot**：Agents → Prepare local connection。网站将随机凭据加密写入 `.data/agent-credentials/dot.json`（文件 0600，目录 0700），服务端只保留 token 哈希；不把 token 放进聊天/计划。然后 Copy Dot setup rules，发送给 Dot。它需要在获准的本机任务中执行：

```sh
node '/Users/best_luanfeng/Documents/Codex/Career Compass/scripts/agent-client.mjs' dot tasks
```

辅助工具支持 `context`、`guide`、`task-action /absolute/request.json`、`report /absolute/request.json`。只向配置的本机回环服务器发送凭据，拒绝重定向。不要让 Agent 输出凭据文件或 `.env.local`。更换 token 后旧 helper 凭据失效，Prepare 可重建。Disconnect 撤销 API token 与该 Agent 浏览器会话。

**Muse**：在它实际控制的 Mac Chrome profile 打开 `/agent-workbench`，选择 Muse、Authorize this browser，再让 Muse 点 Check my queue。会话是 12 小时 HttpOnly cookie；过期需重新配对。读任务、claim、heartbeat、回传可通过页面按钮/JSON 表单完成，不要求云端浏览器访问 localhost 或注入 Authorization。它仍需要可用的本机控制权限；网站不能替 Muse 清除审批、恢复过期卡片或保证某个菜单存在。

两条路径都必须先成功读取真实队列，再在另一轮执行中验证持久性。之后才检查 Agent 产品是否支持每 10 分钟、America/New_York 08:00–24:00 保存计划。不能支持就报告限制，不登记虚假 worker。准备凭据/配对浏览器不是已保存计划，计划也不是持续在线的证明。不能承诺 12 小时浏览器会话支持无人值守长期运行。

## Tasks 怎么用

- Find jobs & people：一次需求生成两个同范围搜索任务；双方报告完成后 Reconcile & assign execution，Dot 负责共同/独有发现，Muse 负责 Muse 独有。
- Draft for existing contact：选择已有联系人和 Email/LinkedIn 渠道；生成新草稿版本，保留原文和用户修改，不发送。
- Review Gmail：由一个 Agent 理解原邮件、回信意图、退信原因；网站 Gmail worker 负责读取事实。历史补录仍需明确任务范围，尚未宣称全面完成。
- Read LinkedIn：由一个 Agent 在获准浏览器读取指定会话，再回传；网站没有直接 LinkedIn 私信 API。
- Draft channel 决定后续草稿格式；不代表搜索渠道，也不是发送授权。Email 在 Outreach 审阅后调用 Gmail；LinkedIn 在审阅后排队给 Agent，网页不直接发送。
- 网站只是可领取队列，不能直接控制另一个产品的 Agent 或让它自动开始聊天。

字体已增大，岗位卡增加来源、执行归属、适配与待核实原因。Needs verification 表示 JD 对毕业年份、全职、经验或签证等所需证据不齐，不等于确认可投；不应删除标签掩盖未知。

新文件/改动包括 `agent-connection.ts`、`agent-client.mjs`、`agent-session/route.ts`、`agent-workbench/page.tsx`、`archive-jobs.ts`、`archive-legacy-jobs.mjs`、Data、Agent connections、Tasks、Jobs、People、Outreach、CSS 与对应测试。以下为前一阶段设计记录。

---

# 协作与数据库管理（2026-11-05，任务队列版）

Dot 和 Muse **都搜全部范围**，先汇总去重，再分配执行。60% 中大型科技 / 20% 中国出海 / 20% 初创小公司是合并结果的搜索偏好，不是 Agent 分区。网站不调用模型 API。

## 用户如何操作

1. 打开 http://127.0.0.1:3000/agents。已经连接的 Agent 不需要换 token。
2. Queue-check setup 默认选择 **每 10 分钟，08:00–24:00 America/New_York**。分别点击 Copy Dot setup rules / Copy Muse setup rules，粘贴到对应既有对话。
3. 让各产品真正保存计划，并马上检查一次队列。若其产品不支持本机 HTTP 或后台计划，它必须报告具体限制；仅打开网页不算接入。网站不能自动唤醒它们，也不读取两者私有聊天上下文。
4. 打开 http://127.0.0.1:3000/tasks，选任务类型，写标题和中文或英文需求，点击 **Create task**。以后在这里创建工作即可；无需每次给两边重复粘贴需求，但前提是各自的检查计划真实生效。
5. Tasks 的 Agent pickup 显示实际 API 检查时间。Reported schedule 只是 Agent 报告的计划，不是网站对后台运行的验证。

示例需求：

> 两边独立搜索美国 2027 new grad / entry-level full-time PM、DS、DA 机会。每边先找 5 个岗位和 5 位相关联系人，覆盖全部公司类别。保留官方 JD、发布日期、截止时间、sponsor 原文、与我经历的关联、联系人身份及 LinkedIn 地址。邮箱推断必须标记。先回传发现，不要提交网申或发送消息。

这是人工填写的需求，网站把原文交给 Agent；没有用规则从自然语言猜出授权动作。任务类型由用户明确选择。

## 一批工作的完整流程

1. **创建**：一次提交生成同一 batch 的 Dot、Muse 两个 discovery 任务。
2. **领取**：Agent 读取 `/api/agents/tasks`，原子领取自己的 queued 任务。领取有效期 10 分钟，每 2 分钟 heartbeat。用本机 Chrome 必须声明 `usesLocalBrowser:true`，两个 Agent 不可同时控制该窗口。
3. **发现**：以 `batchId + taskId + claimToken` 回传到 `/api/agents`。联系人按标准化 LinkedIn 或同 Agent 稳定 externalId 合并；岗位按标准化 JD URL 合并。来源分别保留为 Dot / Muse / Both。姓名、公司、推断邮箱相似只标记疑似重复。
4. **结束发现**：两者分别报告实际覆盖范围、遗漏、失败。两边都完成才出现 **Reconcile & assign execution**。
5. **分配**：用户点击分配，Dot 执行共同发现及 Dot 独有；Muse 执行 Muse 独有。跳过已有投递、已联系记录及已有草稿。疑似重复/明确不匹配岗位进入 blocked。执行归属在分配时固定，后来的发现只追加来源，不抢走正在做的任务。
6. **起草/准备**：Agent 领取任务，回传草稿或完整网申答案。草稿在 Outreach 编辑；网申答案在 Tasks 编辑。
7. **邮件发送**：Outreach 保存修改后点击 Send this draft，由 Gmail API 发送，需要 Gmail send scope。初次联系支持；现有回复草稿仍受重复联系保护，完整会话回复、附件和自动 follow-up 尚未实现，不能假定已支持。
8. **LinkedIn 发送**：Outreach 的 **Send via agent** 固定当前文字、版本、收件人，再生成发送任务。Agent 从自己的已登录浏览器执行，回传实际消息链接与证据。网站不直接调用 LinkedIn 私信 API。
9. **网申提交**：用户确认 Tasks 中的答案，点击 **Approve these answers & queue submission**，才产生提交任务。Agent 实际提交后回传确认文本/链接；网站标记 Agent-reported Applied，后续 Gmail 提供独立证据。没有确认不计作已申请。
10. **结果不明**：可能已点击发送/提交的超时不能自动重试。用户在任务卡展开 Reconcile，核查原站后填写证据与结果；网站释放占用并记录人工核查，绝不自动重发。

两个 Agent 必须遵守同一合同。服务端能拒绝未授权的写入和重复领取，但不能阻止 Agent 在网站之外自行操作；那些操作不属于本队列的保证范围。

## Gmail 与 LinkedIn 同步

- `npm run worker` 运行独立只读 Gmail 进程；约每分钟检查一页申请邮件和一页已知联系人往来，失败指数退避至最多 15 分钟。SQLite 保存检查点，Settings 控制暂停。
- 网页关闭不影响该进程；电脑休眠、关机或退出进程会停止。不是云端服务，也不是 Gmail push。
- 同步 Sent、incoming、DSN；Sent 不等于送达，incoming 不直接等于真人回复。网站没有自己的模型。语义判断由 Tasks 的 **Review recent Gmail evidence** 指定一个 Agent 执行。
- Gmail 程序不会自动把所有历史发件收件人变成 People。历史联系人仍需 Agent 按真实求职往来补录。此前 30 天全量补录并未完成，不能把后台进程启动当成历史数据齐全。
- **Read a LinkedIn conversation** 指定联系人和 Agent，返回实际消息 ID、方向、时间、正文及链接；在 People 时间线呈现为 agent-reported。任务不授权发消息。没有官方实时 LinkedIn 消息订阅。

## 输入与输出

完整机器合同：`GET /api/agents/guide`。使用每个 Agent 自己的 bearer token。

| 接口 | 用途 |
| --- | --- |
| GET `/api/agents` | 共享用户资料、去重记录、策略、邮件证据、任务概况 |
| GET `/api/agents/tasks` | 当前 Agent 任务及队列检查时间 |
| POST `/api/agents/tasks` | claim / heartbeat / report / register_worker |
| POST `/api/agents` | contact / opportunity / draft / progress / outreach_report / application_analysis / interpretation |
| GET/POST `/api/tasks` | 用户网页创建、分配、审核、取消、核查；同源保护 |

Agent 每次逻辑写入使用稳定 eventId，重试复用；每次 heartbeat 是独立事件。幂等回放不会重新延长旧 heartbeat。领取 token 只发给执行者，不显示在公共任务卡。完成报告必须读回核对。申请提交与 LinkedIn 发送证据目前是 Agent 报告，不伪装成独立平台确认。

## 谁知道什么

- Codex：维护代码、接口、数据库迁移与测试，排查失败；不会伪装成 Dot/Muse 接收任务。
- Dot/Muse：各自保存连接凭据与检查计划；从网站读取共同资料、任务、记录、版本及执行归属；只处理自己的领取项。
- 网站：存共享业务事实、去重、审批、状态和证据；不需要共享两个 Agent 的聊天历史，也不需要购买模型 API。
- 用户：通过网站提出工作、编辑草稿、授权发送/提交和处理不确定结果。产品原生权限弹窗或登录过期仍需要用户完成。

## SQLite 管理

文件：`.data/career-compass.sqlite`。不要用文本编辑器修改它。`/data` 用表格查看 Jobs、People；`/tasks` 查看任务；`/agents` 查看报告。Jobs/People 编辑仍在业务页面。

现有 `workspace` JSON 存岗位、联系人、投递；`jobs`/`people` 是可读 SQL 视图。`portal_drafts`、`portal_events` 保存草稿和事实，`agent_contacts` 和 `agent_receipts` 保存身份映射和幂等回执，`email_events` 保存申请邮件。

新增 `task_batches`、`discoveries`、`execution_tasks`、`task_requests`、`browser_claims`。任务事务使用 SQLite `BEGIN IMMEDIATE`；草稿 version 和 workspace revision 防止旧写覆盖。凭据不存入任务记录，OAuth token 加密、Agent token 哈希。

完整恢复需要 SQLite 备份及原加密密钥；Settings workspace JSON 导出不包含任务/事件全库。修改前备份位于 `.data/backups/`。无需 Supabase，也不需要按 Agent 分库。

## 本轮代码位置

- `app/tasks/page.tsx`, `app/components/task-center.tsx`：任务表单、状态、发现批次、审批、结果核查。
- `app/lib/tasks.ts`, `app/lib/server/task-store.ts`, `app/lib/server/task-actions.ts`：数据结构、事务、执行归属、租约、回执。
- `app/api/tasks/route.ts`, `app/api/agents/tasks/route.ts`, `app/api/agents/guide/route.ts`：网页和 Agent 合同。
- `app/lib/agent-policy.ts`, `app/components/agent-connections.tsx`：双方规则和每 10 分钟计划说明。
- `app/lib/server/portal.ts`, `app/lib/portal.ts`, `app/lib/model.ts`, `app/lib/logic.ts`：发现来源、冻结归属、领取验证。
- `app/components/outreach.tsx`, `people.tsx`, `jobs.tsx`, `shell.tsx`, `app/globals.css`：发送入口、来源显示、导航和布局。
- `app/lib/server/sync-worker.ts`, `scripts/sync-worker.mjs`, `tsconfig.worker.json`, `package.json`：独立只读 Gmail 同步。
- `app/lib/server/portal-mail.ts`, `app/components/portal-data.tsx`, `integrations.tsx`, `app/api/integrations/route.ts`, `app/api/data/route.ts`：同步租约、运行状态、来源和归属查看。
- `tests/tasks.test.mjs`, `tests/worker.test.mjs`：隔离数据库验证，测试不发送真实消息。

外部待验收：两个产品实际保存计划、实际领取并回传同批结果、真实发送/提交。网站接口检查不替代这些验收；浏览器工具本轮仍返回 `browser access host is unavailable`。

本轮检查：Lint、TypeScript、78 项隔离测试、生产构建通过；Tasks / Agents / Outreach / People / Jobs / Settings 及任务与指南接口均 HTTP 200，未鉴权任务 API 返回 401、跨站任务写入返回 403。Gmail worker 已实际完成多个读取周期；没有发送邮件、LinkedIn 消息或提交网申。Gmail 当前仍为只读授权。
