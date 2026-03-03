# 🤖 SLS 日志智能分析系统

一个功能完整的阿里云 SLS 日志分析 Web 应用，支持项目配置、多 AI 模型集成、自动生成分析报告。

## ✨ 功能特性

- **📁 项目管理**: 可视化管理多个阿里云 SLS 项目
- **🔍 智能搜索**: 支持灵活的时间范围和关键词查询
- **🤖 AI 分析**: 集成多种大模型（Claude、GPT、智谱、通义等）
- **📊 自动报告**: 自动生成结构化的 Markdown 分析报告
- **💾 报告管理**: 查看、保存、删除历史分析报告
- **🔄 认证同步**: 一键从浏览器同步阿里云认证信息

## 🚀 快速开始

### 1. 安装依赖

```bash
cd /Users/gh/vscode_work/sls-log-analyzer
npm install
```

### 2. 启动服务

```bash
npm start
```

服务将启动在: http://localhost:3001

### 3. 配置使用

1. 打开浏览器访问 http://localhost:3001
2. 进入 **系统设置** 页面，同步阿里云认证信息
3. 进入 **项目管理** 页面，添加你的 SLS 项目
4. 进入 **AI 配置** 页面，配置大模型 API
5. 在 **日志分析** 页面开始分析！

## 📖 使用说明

### 配置认证信息

1. 打开浏览器开发者工具 (F12)
2. 访问 https://sls.console.aliyun.com
3. 执行一次日志搜索
4. 找到 `getLogs.json` 请求
5. 右键 → Copy → Copy as cURL
6. 粘贴到系统设置页面的输入框

### 添加项目

在 **项目管理** 页面填写：
- 项目名称: 显示名称（如：生产环境）
- 阿里云 Project Name: SLS 项目名
- LogStore 名称: 日志库名称

### 配置 AI

支持以下 AI 提供商：

| 提供商 | API Key 格式 | Base URL | 模型示例 |
|--------|-------------|----------|----------|
| Anthropic | sk-ant-xxx | - | claude-3-5-sonnet-20241022 |
| OpenAI | sk-xxx | - | gpt-4, gpt-4-turbo |
| 智谱 AI | 您的 Key | https://open.bigmodel.cn/api/paas/v4 | glm-4-plus |
| 通义千问 | sk-xxx | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |

### 分析日志

1. 选择已配置的项目
2. 选择时间范围（今天/本周/上周/本月等）
3. 输入查询关键词（可选）
4. 点击"开始分析"

## 📊 分析报告内容

- **基础统计**: 日志总数、按级别分布
- **错误汇总**: 自动检测和汇总错误日志
- **时间跨度**: 日志的时间分布
- **AI 分析**: 智能诊断、根因分析、解决建议

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JavaScript
- **AI**: 支持多种 LLM API

## 📁 项目结构

```
sls-log-analyzer/
├── src/
│   ├── server.js          # Express 服务器
│   ├── routes/
│   │   └── api.js         # API 路由
│   └── services/
│       ├── slsClient.js   # SLS 客户端
│       ├── analyzer.js    # 日志分析器
│       ├── timeParser.js  # 时间解析器
│       └── aiService.js   # AI 服务
├── public/
│   ├── index.html         # 主页面
│   └── app.js             # 前端逻辑
├── reports/               # 报告存储目录
├── config.json            # 配置文件
└── package.json
```

## 🔧 环境变量

可选配置 `.env` 文件：

```env
PORT=3001
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-xxx
AI_MODEL=claude-3-5-sonnet-20241022
```

## 📝 API 接口

### 配置相关

- `GET /api/config` - 获取配置
- `POST /api/config` - 保存配置

### 日志分析

- `POST /api/analyze` - 执行日志分析

### 报告相关

- `GET /api/reports` - 获取报告列表
- `GET /api/reports/:id` - 获取报告详情
- `DELETE /api/reports/:id` - 删除报告

### 认证相关

- `POST /api/sync-auth` - 同步认证信息
- `GET /api/auth-status` - 获取认证状态

## ⚠️ 注意事项

1. **认证过期**: Cookie 约 30 天后过期，需要重新同步
2. **API 限制**: 阿里云 SLS API 有请求频率限制
3. **AI 费用**: 使用第三方 AI API 可能产生费用
4. **本地运行**: 目前仅支持本地运行，数据存储在本地

## 📞 问题反馈

如有问题，请检查：
1. Node.js 版本 >= 18.0.0
2. 所有依赖是否正确安装
3. 端口 3001 是否被占用
4. 认证信息是否有效
