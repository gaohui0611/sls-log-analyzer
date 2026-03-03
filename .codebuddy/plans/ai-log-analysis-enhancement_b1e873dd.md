---
name: ai-log-analysis-enhancement
overview: 增强 AI 日志分析功能：支持自定义 Prompt、预设模板、历史记录，优化 Prompt 支持综合场景分析，报告中可配置展示日志详情数量
design:
  architecture:
    framework: html
  styleKeywords:
    - Apple Design
    - Clean
    - Minimalist
    - Card-based
  fontSystem:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display'"
    heading:
      size: 18px
      weight: 600
    subheading:
      size: 14px
      weight: 500
    body:
      size: 13px
      weight: 400
  colorSystem:
    primary:
      - "#007AFF"
      - "#34C759"
    background:
      - "#F5F5F7"
      - "#FFFFFF"
    text:
      - "#1D1D1F"
      - "#86868B"
    functional:
      - "#FF3B30"
      - "#FF9500"
      - "#5856D6"
todos:
  - id: modify-ai-service
    content: 修改 aiService.js - 优化 Prompt 模板，支持自定义 Prompt 整合
    status: completed
  - id: modify-analyzer
    content: 修改 analyzer.js - 接收并传递 customPrompt 和 logDetailLimit 参数
    status: completed
    dependencies:
      - modify-ai-service
  - id: modify-api-routes
    content: 修改 api.js - 添加 customPrompt 和 logDetailLimit 参数接收
    status: completed
    dependencies:
      - modify-analyzer
  - id: modify-frontend-html
    content: 修改 index.html - 添加 Prompt 模板选择、自定义输入、历史记录、日志数量配置 UI
    status: completed
  - id: modify-frontend-js
    content: 修改 app.js - 实现 Prompt 模板切换、历史记录保存/加载、日志数量控制逻辑
    status: completed
    dependencies:
      - modify-frontend-html
      - modify-api-routes
---

## 产品概述

SLS 日志智能分析系统增强版，支持自定义 AI Prompt 和更全面的日志分析场景。

## 核心功能

1. **自定义 Prompt 输入** - 用户可输入自定义分析需求，与系统 Prompt 结合使用
2. **Prompt 预设模板** - 提供常用分析场景模板（错误分析、业务逻辑、性能诊断、安全审计）
3. **Prompt 历史记录** - 自动保存最近使用的自定义 Prompt，支持快速复用
4. **日志详情展示** - 在分析报告中展示用于 AI 分析的原始日志详情，数量可配置
5. **优化 AI Prompt** - 支持综合场景分析，不仅限于错误日志，还包括业务逻辑判断、性能问题、安全审计等

## Tech Stack Selection

- **Frontend**: Vanilla JavaScript SPA (保持现有架构)
- **Backend**: Node.js + Express.js (保持现有架构)
- **Storage**: config.json 扩展存储 Prompt 模板和历史记录

## Implementation Approach

### 整体方案

采用渐进式增强策略，在不改变现有系统核心流程的基础上，增加自定义 Prompt 功能和日志详情展示。通过扩展 config.json 存储 Prompt 模板和历史记录，前端添加 UI 控件，后端修改 AI 服务层整合系统 Prompt 与用户自定义 Prompt。

### 关键设计决策

1. **Prompt 整合策略**

- 系统 Prompt 作为基础框架，提供分析结构和上下文
- 用户自定义 Prompt 作为补充指令，追加在系统 Prompt 之后
- 使用分隔符清晰区分系统指令和用户意图

2. **模板与历史存储**

- 存储在 config.json 中的 `promptConfig` 字段
- 预设模板包含 ID、名称、描述、Prompt 内容
- 历史记录保存最近 10 条，去重处理

3. **日志详情展示**

- 默认展示 50 条，用户可配置 10-200 条
- 在报告中新增 "分析依据日志" 区块
- 支持展开/折叠，按时间排序

4. **Prompt 优化方向**

- 错误诊断：异常分析、根因定位
- 业务逻辑：流程验证、状态判断
- 性能分析：耗时统计、瓶颈识别
- 安全审计：访问模式、异常行为

### 数据流

```
用户选择模板/输入Prompt → 选择日志数量 → 点击分析
        ↓
api.js 接收 customPrompt 和 logDetailLimit 参数
        ↓
analyzer.js 传递参数到 aiService.js
        ↓
aiService.js 构建增强Prompt（系统+用户）→ 调用AI
        ↓
生成报告（包含logDetailLimit条日志详情）
```

## Implementation Notes

### 关键执行要点

1. **保持向后兼容** - 所有新参数为可选，不传则使用默认值
2. **Prompt 长度控制** - 用户自定义 Prompt 限制 2000 字符，避免超出模型上下文
3. **日志详情分页** - 如果日志量大，前端展示时虚拟滚动或分页
4. **XSS 防护** - 用户输入的 Prompt 和日志内容需要做 HTML 转义

### 性能考虑

1. **日志数量限制** - 虽然用户可以配置展示数量，但 AI 分析时仍使用全部日志（或抽样）
2. **历史记录管理** - 最多保存 10 条，避免 config.json 过大
3. **模板本地化** - 预设模板存储在前端代码中，减少服务端传输

### 目录结构

```
project-root/
├── src/
│   ├── services/
│   │   └── aiService.js      # [MODIFY] 优化Prompt构建，整合自定义Prompt
│   └── routes/
│       └── api.js            # [MODIFY] 接收customPrompt和logDetailLimit参数
├── public/
│   ├── index.html            # [MODIFY] 添加Prompt输入框、模板选择、历史记录UI
│   └── app.js                # [MODIFY] 实现Prompt模板、历史记录、日志数量配置交互
└── config.json               # [MODIFY] 新增promptConfig存储历史记录
```

## Key Code Structures

### aiService.js 核心接口

```javascript
// 调用 AI 分析（增强版）
export async function callAI(logs, query, timeInfo, aiConfig, customPrompt) {
    // customPrompt: 用户自定义Prompt，可选
    // 构建增强Prompt：系统Prompt + 用户Prompt
}

// Prompt 模板配置
const PROMPT_TEMPLATES = {
    errorAnalysis: { name: '错误诊断', prompt: '...' },
    businessLogic: { name: '业务逻辑', prompt: '...' },
    performance: { name: '性能分析', prompt: '...' },
    security: { name: '安全审计', prompt: '...' }
};
```

### API 请求参数

```javascript
// POST /api/analyze 请求体
{
    projectId: string,
    timeRange: string,
    query: string,
    size: number,
    customPrompt: string,      // 新增：用户自定义Prompt
    logDetailLimit: number     // 新增：日志详情展示数量（10-200）
}
```

### 报告数据结构

```javascript
{
    // ... 现有字段
    customPrompt: string,      // 使用的自定义Prompt
    logDetailLimit: number,    // 配置的日志详情数量
    displayedLogs: []          // 展示的日志详情样本
}
```

## 设计概述

保持现有 Apple Design 风格，新增自定义 Prompt 区域采用卡片式布局，融入现有设计体系。

### UI 新增元素

1. **Prompt 模板选择器** - 下拉选择预设模板（错误诊断、业务逻辑、性能分析、安全审计）
2. **自定义 Prompt 输入框** - 多行文本域，支持 placeholder 提示，右下角显示字符计数
3. **历史记录下拉** - 显示最近使用的 Prompt，点击快速填充
4. **日志数量滑块** - 范围 10-200，默认 50，带实时数值显示
5. **日志详情展示区块** - 报告中新增加折叠面板，展示用于分析的原始日志

### 布局调整

在 "日志分析" 标签页的分析按钮上方，新增一个 "高级分析选项" 卡片，包含以上所有新控件。报告展示区域新增 "分析依据日志" 区块，位于 AI 分析之前。