# 📋 项目开发进度 — SLS 日志智能分析系统

> 本文件用于**持续跟踪开发进度与已交付任务**。每次功能迭代后更新此文件，方便回溯与跟进。
> 维护规则：新增功能追加到「已交付」并标记完成日期；未完成或计划中的放「待办」。提交时同步勾选状态。

---

## 一、项目概览

| 项 | 内容 |
|----|------|
| 项目名 | sls-log-analyzer — 阿里云 SLS 日志智能分析系统 |
| 版本 | 1.0.0 |
| 定位 | Web 端查询 SLS 日志 + AI 分析生成报告 + 跨报告数据仪表盘 |
| 技术栈 | Node.js (ESM) + Express 后端 + Vanilla JS 单页前端（无构建、无框架） |
| 启动 | `npm run dev`（端口 3001，`--watch` 自动重启）/ `npm start` |
| 仓库 | github.com/gaohui0611/sls-log-analyzer（main 分支） |

**核心价值**：把分散的 SLS 日志查询、AI 诊断、历史复盘、考核统计整合为一个本地工具，零部署成本。

---

## 二、已交付功能（按模块）

### ✅ 1. 基础架构与项目骨架
- [x] Express 后端 + 单文件 Vanilla JS 前端架构（`04a04b6`）
- [x] 后端路由模块化拆分（`44eebea`）：`api.js` 聚合 + 6 个子路由
- [x] 移除未采用的 React 客户端，回归 vanilla 单页（`3b62248`）
- [x] 服务层整理：`services/`（业务）+ `utils/`（工具）+ `routes/`（接口）三层

### ✅ 2. 项目管理
- [x] 多 SLS 项目可视化配置（`projects.js`）
- [x] 项目 CRUD + 项目选择器联动分析页
- [x] 配置统一读写 `config.js`（`readConfig`/`saveConfig` 含默认值）

### ✅ 3. 日志查询与分析流水线
- [x] 时间范围解析器 `timeParser.js`（今天/昨天/本周/本月等）
- [x] SLS 客户端 `slsClient.js`：form-encoded 请求 + 浏览器 Header 伪装 + 重试机制（`71529bf`）
- [x] 三阶段分析流水线 `analyzer.js`：广泛查询 → 条件触发精准二次检索 → AI 分析
- [x] SLS 查询语法修复（中文引号转换等）（`0a48b9d`）
- [x] Puppeteer 备用查询通道 `puppeteerLogClient.js`（WAF 拦截时 fallback）
- [x] TraceID 链路追踪端点 + `traceExtractor.js`（SQL/错误上下文提取）

### ✅ 4. AI 分析集成
- [x] 三通道 AI Service `aiService.js`：anthropic / openai / openai-compatible（`0795301`）
- [x] 智能分析模式自动判断（业务链路 / 异常错误 / 概览）—— `buildPrompt`
- [x] 自定义 Prompt 覆盖（`b16f926`）
- [x] **预设分析模版下拉框**（业务/异常/概览/性能/安全 5 种）（`1af1532`）
- [x] AI 分析失败不阻断流水线（降级为仅统计报告）
- [x] AI 连接测试端点

### ✅ 5. 报告管理
- [x] 报告 CRUD 端点（`reports.js`）+ UUID 存储
- [x] 报告列表分页 + 详情查看（含完整日志）
- [x] 单报告内嵌图表（级别饼图 / 时间趋势 / 热力图）—— ECharts

### ✅ 6. **报告数据仪表盘**（`1af1532`）— 跨报告聚合
- [x] `GET /api/dashboard` 聚合端点（单次遍历全部报告）
- [x] 4 个 KPI 卡片：报告数 / 日志量 / 错误告警 / AI 覆盖率
- [x] 6 类图表：时间趋势 / 级别分布 / 项目对比（报告量+错误率双轴）/ 24h 故障时段 / 关键词云 / AI 分析模式分布
- [x] 错误报告 Top10 排行榜
- [x] 关键词分词 `keywordTokenizer.js`（零原生依赖：英文技术词正则 + 中文 2-gram + 停用词）
- [x] 分析流程记录 `presetTemplate` 到报告（供模式分布考核）
- [x] 科技蓝白浅色主题图表（独立 `DASH_THEME`，不动旧深色图）
- [x] URL hash 直达（`#dashboard`）

### ✅ 7. SLS 认证同步（三方式演进）
- [x] cURL 手动同步（`sync-auth`）
- [x] 书签小工具同步（`bookmark-sync`）
- [x] **全自动同步**（`auto-sync-auth`）（`7628c24`）—— **当前主推**
  - 读取 Chrome 磁盘 SQLite cookies 并解密（macOS AES-128-CBC + Keychain 密钥派生）
  - 处理 v10 新格式（3 字节前缀 + 32 字节头部 + 密文）
  - Puppeteer 注入 cookies 访问 SLS 页面，拦截请求抓取运行时 `csrfToken`/`b3`
  - 零重新登录、零手动操作
- [x] 认证有效性实测验证（实际查 1 条日志，非检查存在性）
- [x] 技术文档 `docs/认证同步实现.md`

### ✅ 8. 用户体验与界面
- [x] macOS 风格设计（`99c714b`）→ 科技蓝 + 白色主题
- [x] Toast 弹出框通知（`bde54b9`）
- [x] 品牌/样式优化（`bc9e9d7`）
- [x] 自定义 Prompt 输入区 + 查询语法提示

### ✅ 9. 代码质量工作流（`scripts/`）
- [x] 静态分析 `analyze-codebase.mjs`（行数/TODO/重复/复杂度）
- [x] AI 代码审查 `ai-code-review.mjs`
- [x] 编排流水线 `run-analysis-workflow.mjs`（--local-only/--ai-only）
- [x] 定时分析 `scheduled-analysis.sh` + `setup-cron.sh`

### ✅ 10. 文档
- [x] `README.md` — 项目说明与快速开始
- [x] `CLAUDE.md` — 架构规范与开发指引
- [x] `docs/认证同步实现.md` — 认证同步技术实现
- [x] `PROGRESS.md` — 本文件（开发进度跟踪）

---

## 三、架构与数据流

```
# 主分析流程
前端 app.js → POST /api/analyze → analysis.js → analyzer.js
  → timeParser + slsClient(需cookies) → 条件二次检索 → aiService(需apiKey)
  → 写 reports/{uuid}.json → 返回报告

# 仪表盘流程
前端 → GET /api/dashboard → reports.js 遍历全部报告
  → 聚合 summary/项目/趋势/排名/级别/时段/词云/模式 → 返回

# 认证同步流程
一键同步 → autoSyncAuth → 解密磁盘cookies + Puppeteer抓token → 存 config.json
```

**关键依赖**：无 cookies → 401；无 apiKey → 跳过 AI（报告仅含统计）。

### 目录结构
```
src/
├── server.js              # 入口
├── routes/                # 接口层
│   ├── api.js             # 路由聚合（/api 前缀）
│   ├── projects.js        # 项目配置
│   ├── analysis.js       # /analyze + /trace-search
│   ├── reports.js        # 报告 CRUD + /dashboard 聚合
│   ├── auth.js           # 认证同步（3 方式）
│   └── ai.js             # AI 连接测试
├── services/             # 业务层
│   ├── analyzer.js       # 三阶段分析流水线
│   ├── slsClient.js      # SLS API 客户端
│   ├── puppeteerLogClient.js  # Puppeteer 备用通道
│   ├── aiService.js      # AI 三通道分发
│   ├── autoAuthSync.js   # 全自动认证同步（核心）
│   └── timeParser.js     # 时间范围解析
├── utils/                # 工具层
│   ├── config.js         # 配置统一读写
│   ├── keywordTokenizer.js  # 关键词分词（仪表盘）
│   └── traceExtractor.js # Trace 上下文提取
└── middleware/           # （预留）
public/
├── index.html            # 单页 HTML（内嵌 CSS）
└── app.js                # 唯一前端文件（状态机 + 渲染）
scripts/                  # 代码分析工作流
docs/                     # 技术文档
```

---

## 四、API 端点清单

| Method | Path | 说明 | 状态 |
|--------|------|------|------|
| GET | `/api/config` | 获取配置 | ✅ |
| POST | `/api/config` | 保存配置（过滤占位 apiKey） | ✅ |
| POST | `/api/analyze` | 日志分析（含 presetTemplate） | ✅ |
| POST | `/api/trace-search` | TraceID 追踪 | ✅ |
| GET | `/api/reports` | 报告列表（元数据） | ✅ |
| GET | `/api/reports/:id` | 报告详情 | ✅ |
| DELETE | `/api/reports/:id` | 删除报告 | ✅ |
| **GET** | **`/api/dashboard`** | **跨报告聚合仪表盘** | ✅ |
| GET | `/api/auth-status` | 认证状态（实测） | ✅ |
| POST | `/api/auto-sync-auth` | 全自动同步（主推） | ✅ |
| POST | `/api/bookmark-sync` | 书签同步 | ✅ |
| POST | `/api/sync-auth` | cURL 手动同步 | ✅ |
| POST | `/api/test-auth` | 测试认证 | ✅ |
| POST | `/api/test-ai` | 测试 AI 连接 | ✅ |
| GET | `/api/time-ranges` | 时间范围列表 | ✅ |

---

## 五、待办 / 规划中

> 按优先级排列。完成后移到「已交付」并勾选日期。

### 🔴 高优先级
- [ ] **认证同步跨平台**：当前仅 macOS（Keychain）。Windows（DPAPI）、Linux（PBKKDF2+明文）需另写解密逻辑
- [ ] **旧报告页图表主题适配**：`app.js:initCharts` 仍是深色硬编码（#1a1a1a），与新科技蓝白主题不符
- [ ] **关键词云视觉优化**：当前用 ECharts graph 螺旋布局，可评估接入 `echarts-wordcloud` 扩展获得标准词云外观

### 🟡 中优先级
- [ ] **遗留代码清理**：
  - `analyzer.js` 与 `aiService.js` 中重复的 `extractTraceId()`（应合并到 `traceExtractor.js`）
  - `analyzer.js`/`autoAuthSync.js` 自带的 `readConfig()`（应统一用 `utils/config.js`）
- [ ] **仪表盘增强**：按时间范围筛选（近 7 天 / 30 天 / 全部）、按项目过滤
- [ ] **报告导出**：报告导出为 PDF / 分享链接
- [ ] **Cookie 过期提醒**：自动检测 cookies 临期（约 30 天）并提示重新同步

### 🟢 低优先级 / 增强
- [ ] 用户体系与多租户（当前单人本地使用）
- [ ] 实时日志流（WebSocket）
- [ ] 测试体系（当前无测试框架，仅 `test-ai.js` 独立脚本）
- [ ] TypeScript 化 / 构建工具引入
- [ ] 仪表盘交互下钻（点击项目卡 → 该项目报告列表）

---

## 六、里程碑时间线

| 日期 | Commit | 里程碑 |
|------|--------|--------|
| 初期 | `04a04b6` | 项目初始化：SLS 日志分析系统 |
| — | `b16f926` | 自定义 Prompt + 日志详情展示 |
| — | `0795301` `71529bf` `761ea0f` | AI 鉴权修复 / SLS 重试机制 / 语法修复 |
| — | `bde54b9` `bc9e9d7` `99c714b` | Toast 通知 / 品牌优化 / macOS 风格 |
| — | `0a48b9d` | SLS 查询语法修复 |
| — | `3b62248` | 移除 React 客户端，回归 vanilla |
| — | `44eebea` | 后端路由模块化拆分 |
| — | `e6bb8dc` | 代码分析工作流 + SLS 认证脚本 |
| — | `81b7c10` | 前端体验更新 + 文档 |
| 2026-06 | `7628c24` | **SLS 认证全自动同步**（磁盘解密 + 抓 token） |
| 2026-06 | `1af1532` | **报告数据仪表盘 + 预设分析模版** |

---

## 七、维护说明

**更新此文件的时机**：
1. 完成一个可交付功能 → 在「已交付」对应模块勾选 `[x]`，标注 commit hash
2. 发现新待办 → 加入「待办」并标优先级
3. 完成待办 → 移到「已交付」对应模块
4. 发版里程碑 → 追加到「时间线」

**格式约定**：
- 任务项：`- [x] 功能描述（commit 或日期）`
- 状态符号：✅ 已交付 / 🔴 高 / 🟡 中 / 🟢 低
- commit hash 用反引号包裹，便于 `git show <hash>` 回溯
