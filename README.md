# Career Compass

个人求职工作台：岗位发现、投递追踪、Gmail 状态审核、联系人与 LinkedIn 辅助外联。英文界面，60/20/20 公司类别排序目标。

## 当前状态

已从浏览器演示升级为本机 SQLite 工作区。岗位只接受 Agent 发现与人工录入；旧网站采集已删除，历史线索归档在 Data。投递、联系人、草稿和偏好保存到数据库。旧浏览器演示记录保留，可在 Settings 导出，真实工作区不自动混入虚构数据。

- 两个 Personal Agent 按原生计划每日搜索全范围；日常范围/目标保存在各 Agent 原生计划，网站没有默认每日计划；Agent 主动建立本轮协调记录，双方完成后分配准备。Tasks 用于临时需求与调整；Dot 负责共同及自身发现，Muse 负责独有发现。外部计划和权限需实际验证。
- Opportunities / People 保留去重身份、来源、岗位与联系证据。岗位桌面三列，每页 30 条；来源与执行归属逐条显示，数量不是可投递保证。
- Outreach 编辑 Agent 草稿，支持逐条或批量审阅，用户点击后由 Gmail 发送，或生成 LinkedIn Agent 发送任务。网站不调用模型 API；LinkedIn 没有直接私信 API 连接。
- 网申先准备、再审核、最后提交；领取锁、幂等回执和不确定结果核查防重复执行。计划需在 Dot/Muse 各自产品保存，网站不能唤醒它们。
- Gmail 最近 30 天申请与已知联系人事实由独立 `npm run worker` 进程读取；电脑休眠/退出进程停止同步。完整历史补录及外部 Agent 定时执行仍待验收。
- SQLite 为唯一业务库（本机文件或云端持久磁盘），无需 Supabase。当前操作说明及文件清单见 [COLLABORATION_WORKFLOW.md](docs/COLLABORATION_WORKFLOW.md)。

## 运行

需要 Node.js 24+。

```bash
npm install
npm run setup:local
npm run dev
```

另开终端运行 `npm run worker`，启用 Gmail 只读后台同步。

打开 <http://127.0.0.1:3000>，不要与 localhost 混用。先阅读 [本地接入步骤](docs/LOCAL_SETUP.md)，按说明填写 `.env.local` 中的 Google 配置。不要提交 `.env.local` 和 `.data/`。本地模式仅接受回环地址。云端模式必须配置 HTTPS、工作区密码及持久磁盘，参见 [Railway 部署步骤](docs/DEPLOYMENT.md)。

| 路由 | 用途 |
| --- | --- |
| `/` | 概览、投递进展、机会和人脉 |
| `/jobs` | Agent 岗位、证据、筛选、保存到追踪 |
| `/applications` | 手动输入 / 编辑、同步看板、Gmail 审核队列 |
| `/people` | 添加真实 LinkedIn 联系人及来源 |
| `/outreach` | 编辑 Agent 草稿、Gmail 发送、排队 LinkedIn 发送 |
| `/tasks` | 提出需求、共享发现、执行领取、审核与结果核查 |
| `/agents` | 连接凭据、检查队列计划说明、报告记录 |
| `/data` | 只读 Jobs / People / Archived website feeds 表格 |
| `/agent-workbench` | 本机浏览器配对、读队列、填写 Agent 回传 JSON |
| `/settings` | Google 授权、手动同步 / 暂停 / 断开、偏好、导出与恢复副本 |

## 检查

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

测试采用临时 SQLite 与模拟 Gmail 响应，不访问本人邮箱。真实 OAuth 与只读导入已另行联调；尚未完成浏览器逐项点击验收。

实现细节、权限边界、备份和本阶段文件清单见 [LOCAL_SETUP.md](docs/LOCAL_SETUP.md)。长期需求见 [PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)；历史前端审查见 [CODE_REVIEW.md](docs/CODE_REVIEW.md)。
