# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SLS Log Analyzer — 阿里云 SLS 日志智能分析系统。Web 端查询日志 + AI 分析生成报告。

**Tech stack**: Node.js ESM (`"type": "module"`) + Express backend + Vanilla JS frontend. No build tool, no bundler, no test framework.

## Development Commands

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 (node --watch, 自动重启)
nnpm start            # 启动生产服务器
node test-ai.js      # 独立测试 AI 连接（使用 config.json 中的 aiConfig）

# 代码分析工作流（scripts/ 目录）
nm run analyze           # 静态分析代码库
npm run analyze:ai        # AI 代码审查（需要 config.json 中的 aiConfig）
npm run analyze:workflow    # 运行完整分析流水线（静态 + AI）
npm run analyze:scheduled # 执行定时分析（Shell 脚本）
npm run analyze:setup-cron  # 配置 cron 定时任务
```

Server 默认端口 3001（`.env` 的 `PORT` 可改）。Node >= 18（需要 `--watch` flag）。

**没有测试框架**，无 `npm test`，无 lint，无 build 步骤。验证靠手动运行和浏览器测试。`test-ai.js` 是唯一独立测试脚本，直接读 `config.json` 发一次 AI 请求验证连通性。

## Backend Architecture

### Route Structure (Modular)

`src/routes/api.js` 是路由聚合器（aggregator），将各子路由挂载到 `/api` 前缀下：

| 路由文件 | 处理端点 | 说明 |
|---------|---------|------|
| `projects.js` | `/api/config` | 项目配置管理 |
| `analysis.js` | `/api/analyze`, `/api/trace-search` | 日志分析与 Trace 追踪 |
| `reports.js` | `/api/reports`, `/api/reports/:id` | 报告列表与详情 |
| `auth.js` | `/api/sync-auth`, `/api/auto-sync-auth`, `/api/bookmark-sync`, `/api/test-auth`, `/api/auth-status`, `/api/time-ranges` | 认证同步与验证 |
| `ai.js` | `/api/test-ai` | AI 连接测试 |

各子路由文件使用 Express Router，独立定义自己的端点，通过 `api.js` 统一挂载。

### Data Flow

```
# 主分析流程
前端 app.js → POST /api/analyze → analysis.js → analyzer.js
                                                  ↓
                                          parseTimeRange (timeParser.js)
                                                  ↓
                                          searchLogsMultiPage (slsClient.js) ← 需要 slsConfig (cookies)
                                                  ↓
                                          analyzeStats (内部) → 阶段2条件触发精准二次检索
                                                  ↓
                                          callAI (aiService.js) ← 需要 aiConfig (apiKey)
                                                  ↓
                                          写 reports/{uuid}.json → 返回报告

# TraceID 追踪流程
前端 traceModal → POST /api/trace-search → analysis.js
                                                  ↓
                                          searchLogsMultiPage (slsClient.js)
                                                  ↓
                                          extractTraceContext (traceExtractor.js)
                                                  ↓
                                          返回 { logs, context }
```

SLS 认证是前置依赖：无 cookies → 401，无 AI apiKey → 跳过 AI 分析（报告只有 stats，无 aiAnalysis）。

### 分析流水线细节

`analyzer.js` 的 `analyzeLogs()` 是三阶段流水线：

1. **阶段1 — 广泛查询**: `searchLogsMultiPage(params, slsConfig, maxPages)` 按用户关键词 + 翻页数查询
2. **阶段2 — 精准二次检索** (条件触发): 当日志 >=50 条但 ERROR/WARN <5 条时，自动追加 `ERROR OR Exception OR WARN` 查询并合并去重
3. **阶段3 — AI 分析**: 对合并后的日志集调 `callAI()`，有 180 秒超时，失败不阻断流水线

`customPrompt` 参数可覆盖默认分析模板（三种模式：业务链路分析 / 异常错误分析 / 概览分析）。

## Key Architecture Patterns

### Config 读取演进

`src/utils/config.js` 提供了统一的 `readConfig()` / `saveConfig()`，包含完整的默认值。路由文件应优先从这里导入。

**遗留代码**：`analyzer.js` 和 `autoAuthSync.js` 仍有自己独立的 `readConfig()`/`saveConfig()` 实现（功能等价但缺少部分默认值）。修改配置字段时需同步这两处。

### Trace 提取工具

`src/utils/traceExtractor.js` 的 `extractTraceContext()` 用于 trace-search 端点，从链路日志中提取 SQL 语句、错误信息、错误上下文等。

**遗留代码**：`extractTraceId()` 函数仍在 `analyzer.js:181` 和 `aiService.js:10` 中完全重复。修改 trace ID 提取逻辑时需同步两处。

### SLS 认证 — 非 API Key 方式

SLS 认证使用浏览器 cookies（非官方 API 密钥），三种同步方式：
1. **Auto Sync** (`POST /api/auto-sync-auth`) — Puppeteer 启浏览器，用户手动登录，提取 cookies
2. **Bookmark Sync** (`POST /api/bookmark-sync`) — 书签小工具从浏览器提取 cookies
3. **cURL Sync** (`POST /api/sync-auth`) — 手动从浏览器 DevTools 复制 cURL

认证验证靠实际日志查询（`searchLogs` 试查 1 条），不是检查 cookies 是否存在。Cookies ~30 天过期。

### SLS Client 请求格式

SLS API (`getLogs.json`) 要求 **form-encoded body**（`URLSearchParams`），不是 JSON。Headers 模拟浏览器请求（Cookie、Referer、User-Agent）。有重试机制：`requestWithRetry` 对 `ECONNRESET` 重试 2 次。

### AI Service 三通道

`aiService.js` 的 `callAI()` 按 `provider` 分发：
- `anthropic` → `x-api-key` header, `/v1/messages` endpoint
- `openai` → `Bearer` auth, `/v1/chat/completions`
- `openai-compatible` → 同 OpenAI 格式，但 baseUrl 由用户指定

所有通道共用 `buildPrompt()` 生成中文提示词，支持 `customPrompt` 覆盖默认分析要求。AI 调用有 180 秒超时，失败不阻断整条分析流水线（存 `{ error: message }` 到报告）。

### Frontend — 单文件 Vanilla JS

`app.js` 是唯一前端文件，全局 `state` 对象管理状态，`apiRequest()` 统一 API 调用。无框架、无组件化。`index.html` 是自包含的（内嵌 CSS），无单独 CSS 文件。

路由由前端 hash（`#system-settings` 等）驱动，`showSection()` 控制显示。

### Puppeteer 备用查询通道

`puppeteerLogClient.js` 提供基于 Puppeteer 的 SLS 日志查询作为 `slsClient.js` 的 fallback。当直接 HTTP 请求被阿里云 WAF 拦截时，可启动无头浏览器模拟真实用户操作来查询日志。该模块独立运行，不与主分析流程直接耦合。

### Scripts 代码分析工作流

`scripts/` 目录提供本地代码质量检查和 AI 辅助审查：
- `analyze-codebase.mjs` — 静态分析（代码行数、TODO/FIXME 扫描、重复代码检测、复杂度评估），输出 `reports/codebase-analysis-{timestamp}.md`
- `ai-code-review.mjs` — 读取当前代码库，调用 AI API 进行代码审查，输出 `reports/ai-code-review-{timestamp}.md`
- `run-analysis-workflow.mjs` — 编排前两个脚本，支持 `--local-only` / `--ai-only` / `--verbose` 参数
- `scheduled-analysis.sh` / `setup-cron.sh` — 定时执行分析并可选推送到远程仓库

## config.json Structure

自动创建，git-ignored。关键字段：
```json
{
  "projects": { "<id>": { "projectName", "logStoreName", "name" } },
  "aiConfig": { "provider", "apiKey", "baseUrl", "model" },
  "slsConfig": { "cookies": { "...": "...", "timestamp": 123456 }, "csrfToken", "b3", "region" }
}
```

`api.js` 保存配置时过滤占位符 apiKey（`•••••••••••••••`），防止覆盖真实 key。

## .env 环境变量

可选配置（优先级低于 config.json 中的配置）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `PORT` | 服务端口 | `3001` |
| `AI_PROVIDER` | AI 提供商 | `anthropic` |
| `AI_API_KEY` | API Key | `sk-ant-xxx` |
| `AI_BASE_URL` | 自定义 API Base URL | `https://api.anthropic.com` |
| `AI_MODEL` | 模型名称 | `claude-3-5-sonnet-20241022` |

## SLS Log Field Conventions

- `__time__` — Unix timestamp（秒）
- `content` — 日志消息（主字段，不是 `message`）
- `level` / `LEVEL` — 日志级别（ERROR/WARN/INFO）
- `TID` / `traceId` / `trace_id` — Trace ID
- `userId` / `user_id` — 用户 ID

## API Endpoints

统一 `{ success: boolean, data?: any, error?: string }`。401 = 认证失效，404 = 项目不存在，500 = 服务器错误。

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/config` | 获取配置（projects + AI config，不返回 apiKey 原文） |
| POST | `/api/config` | 保存配置（projects/aiConfig），过滤占位符 apiKey |
| POST | `/api/analyze` | 执行日志分析（projectId, timeRange, query, size, maxPages, customPrompt） |
| POST | `/api/trace-search` | traceId 链路追踪（projectId, traceId, timeRange, maxPages） |
| GET | `/api/reports` | 获取报告列表（仅元数据，不含完整日志） |
| GET | `/api/reports/:id` | 获取报告详情（含完整日志 + AI 分析） |
| DELETE | `/api/reports/:id` | 删除报告 |
| GET | `/api/auth-status` | 获取认证状态（通过实际查询 SLS API 验证） |
| POST | `/api/sync-auth` | 手动同步认证（cURL 解析结果） |
| POST | `/api/bookmark-sync` | 书签工具同步认证 |
| POST | `/api/auto-sync-auth` | Puppeteer 自动同步认证（打开浏览器让用户登录） |
| POST | `/api/test-auth` | 测试认证信息（实际查询 1 条日志） |
| POST | `/api/test-ai` | 测试 AI 连接 |
| GET | `/api/time-ranges` | 获取支持的时间范围列表 |

## Git-ignore Key Files

`config.json`（含 apiKey + cookies）、`.env`（环境变量）、`reports/`（可能含敏感日志数据）。
