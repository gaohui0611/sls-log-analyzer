# 新功能：自定义Prompt和日志详情展示

## 功能概述

本次更新添加了两个重要功能：
1. **自定义分析提示词**：用户可以自定义AI分析的重点和方向
2. **日志详情展示**：在报告中展示分析依据的完整日志详情

## 更新时间
2024年

---

## 功能一：自定义分析提示词

### 功能说明

用户可以在日志分析页面输入自定义的分析提示词，指导AI关注特定的分析方向。

### 使用场景

1. **业务逻辑分析**
   ```
   请分析用户登录流程中的逻辑问题，重点关注验证码校验和session管理
   ```

2. **性能问题排查**
   ```
   请分析接口响应时间异常的原因，关注数据库查询和外部API调用
   ```

3. **异常行为检测**
   ```
   请分析是否存在异常的用户行为，如频繁请求、非法参数等
   ```

4. **特定错误诊断**
   ```
   请重点分析NullPointerException的根本原因，提供具体的代码修复建议
   ```

### 技术实现

#### 后端修改

**1. aiService.js - 修改buildPrompt函数**
```javascript
function buildPrompt(logSummary, query, timeInfo, customPrompt = '') {
    // ... 基础信息部分 ...
    
    // 如果有自定义prompt，使用自定义的分析要求
    if (customPrompt && customPrompt.trim()) {
        prompt += `\n## 分析要求\n${customPrompt.trim()}\n`;
    } else {
        // 默认分析要求
        prompt += `
## 分析要求
1. **问题诊断**: 识别主要问题和异常
2. **根因分析**: 分析根本原因
3. **影响评估**: 评估影响范围
4. **解决建议**: 提供解决方案
5. **预防措施**: 避免再次发生
`;
    }
    
    return prompt;
}
```

**2. aiService.js - 修改callAI函数**
```javascript
export async function callAI(logs, query, timeInfo, aiConfig, customPrompt = '') {
    // 构建提示词（支持自定义prompt）
    const prompt = buildPrompt(logSummary, query, timeInfo, customPrompt);
    // ...
}
```

**3. analyzer.js - 接收customPrompt参数**
```javascript
export async function analyzeLogs(params) {
    const {
        // ...
        customPrompt = '' // 新增
    } = params;
    
    // 传递给AI服务
    aiAnalysis = await callAI(searchResult.logs, query, timeInfo, aiConfig, customPrompt);
}
```

**4. api.js - 接收前端传递的customPrompt**
```javascript
router.post('/analyze', async (req, res) => {
    const { projectId, timeRange, query, size = 100, customPrompt = '' } = req.body;
    
    const result = await analyzeLogs({
        // ...
        customPrompt
    });
});
```

#### 前端修改

**1. index.html - 添加输入框**
```html
<div class="form-group">
  <label class="form-label">自定义分析提示词 (可选)</label>
  <textarea class="form-textarea" id="customPromptInput" rows="3" 
    placeholder="例如: 请重点分析用户登录失败的原因，检查是否存在账号密码错误、网络超时等问题">
  </textarea>
  <p class="form-hint">
    💡 提示：可以指定分析重点，如业务逻辑问题、性能问题、异常行为等。留空则使用默认分析模板。
  </p>
</div>
```

**2. app.js - 获取并传递customPrompt**
```javascript
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const customPrompt = document.getElementById('customPromptInput')?.value.trim() || '';
    
    const response = await apiRequest('/analyze', {
        method: 'POST',
        body: JSON.stringify({ projectId, timeRange, query, size, customPrompt })
    });
});
```

---

## 功能二：日志详情展示

### 功能说明

在分析报告中展示AI分析所依据的完整日志详情，包括：
- 日志时间
- 日志级别
- 日志内容
- TraceID（如果有）
- UserID（如果有）

### 展示效果

报告中新增"📋 分析依据日志详情"部分，展示前10条日志的完整信息。

### 技术实现

#### 后端修改

**1. aiService.js - prepareLogSummary添加更多字段**
```javascript
function prepareLogSummary(logs, query) {
    // 收集样本日志（包含更多详情）
    if (summary.sampleLogs.length < 10) {
        summary.sampleLogs.push({
            time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null,
            level,
            message: message.substring(0, 500),
            traceId,  // 新增
            userId    // 新增
        });
    }
}
```

**2. aiService.js - buildPrompt优化日志展示格式**
```javascript
## 样本日志（分析依据）
${logSummary.sampleLogs.map((l, i) => `
### 日志 ${i + 1}
- 时间: ${l.time}
- 级别: ${l.level}
- 内容: ${l.message}
${l.traceId ? `- TraceID: ${l.traceId}` : ''}
${l.userId ? `- UserID: ${l.userId}` : ''}
`).join('\n')}
```

#### 前端修改

**app.js - renderAnalysisResult添加日志详情展示**
```javascript
// 分析依据的日志详情
if (data.logs && data.logs.length > 0) {
    html += `
  <div class="card">
    <h3>📋 分析依据日志详情 (前10条)</h3>
    <div style="max-height: 500px; overflow-y: auto;">
`;
    data.logs.slice(0, 10).forEach((log, index) => {
        const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
        const message = log.content || log.message || log.msg || '';
        const time = log.__time__ ? new Date(log.__time__ * 1000).toLocaleString('zh-CN') : '-';
        const traceId = log.TID || log.traceId || log.trace_id || '';
        const userId = log.userId || log.user_id || '';
        
        html += `
      <div class="log-entry ${level.toLowerCase()}" style="...">
        <div style="display: flex; justify-content: space-between;">
          <span style="font-weight: 600;">日志 #${index + 1}</span>
          <span class="tag tag-${level.toLowerCase()}">${level}</span>
        </div>
        <div>🕐 ${time}</div>
        ${traceId ? `<div>🔗 TraceID: ${traceId}</div>` : ''}
        ${userId ? `<div>👤 UserID: ${userId}</div>` : ''}
        <div style="font-family: monospace;">
          ${escapeHtml(message)}
        </div>
      </div>
    `;
    });
}
```

---

## 优化的Prompt模板

### 默认Prompt（无自定义时）

```
## 分析要求

请提供以下分析:

1. **问题诊断**: 基于日志内容，识别主要问题和异常（包括错误、警告、逻辑问题等）
2. **根因分析**: 分析可能的根本原因，考虑业务逻辑、系统配置、数据问题等多个维度
3. **影响评估**: 评估问题的影响范围和严重程度
4. **解决建议**: 提供具体的排查步骤和解决方案
5. **预防措施**: 建议如何避免类似问题再次发生

注意：不仅关注错误日志，也要分析业务逻辑问题、性能问题、异常行为等。
```

### 关键改进点

1. **不局限于错误日志**：明确指出要分析业务逻辑问题、性能问题等
2. **多维度分析**：考虑业务逻辑、系统配置、数据问题等
3. **更详细的日志信息**：包含TraceID、UserID等追踪信息

---

## 使用示例

### 示例1：分析登录失败问题

**自定义Prompt：**
```
请重点分析用户登录失败的原因，包括：
1. 账号密码验证逻辑是否正确
2. 是否存在网络超时或数据库连接问题
3. Session管理是否有异常
4. 是否有恶意登录尝试
```

**查询关键词：** `login OR 登录`

### 示例2：分析接口性能问题

**自定义Prompt：**
```
请分析接口响应时间异常的原因：
1. 数据库查询是否存在慢查询
2. 外部API调用是否超时
3. 是否存在资源竞争或死锁
4. 缓存是否正常工作
```

**查询关键词：** `timeout OR slow`

### 示例3：分析业务逻辑问题

**自定义Prompt：**
```
请分析订单处理流程中的逻辑问题：
1. 订单状态流转是否正确
2. 库存扣减逻辑是否有问题
3. 支付回调处理是否完整
4. 是否存在并发问题导致的数据不一致
```

**查询关键词：** `order OR 订单`

---

## 测试验证

### 测试步骤

1. 启动服务器
   ```bash
   npm start
   ```

2. 访问日志分析页面

3. 填写分析表单：
   - 选择项目
   - 选择时间范围
   - 输入查询关键词（可选）
   - 输入自定义分析提示词（可选）
   - 点击"开始分析"

4. 查看分析结果：
   - 检查是否显示"分析依据日志详情"部分
   - 验证日志详情是否包含时间、级别、TraceID等信息
   - 验证AI分析是否按照自定义prompt进行

### 预期结果

✅ 自定义prompt被正确传递到AI
✅ AI分析结果符合自定义要求
✅ 报告中显示完整的日志详情
✅ 日志详情包含所有关键字段

---

## 文件修改清单

### 后端文件
- ✅ `src/services/aiService.js` - 添加customPrompt支持，优化日志摘要
- ✅ `src/services/analyzer.js` - 接收并传递customPrompt
- ✅ `src/routes/api.js` - API接收customPrompt参数

### 前端文件
- ✅ `public/index.html` - 添加自定义prompt输入框
- ✅ `public/app.js` - 获取customPrompt并传递，展示日志详情

---

## 后续优化建议

1. **Prompt模板库**
   - 预设常用的分析模板
   - 用户可以选择模板或自定义

2. **日志详情增强**
   - 支持展示更多日志（分页）
   - 支持日志搜索和过滤
   - 支持导出日志详情

3. **分析历史**
   - 保存用户的自定义prompt
   - 提供prompt使用统计

4. **智能推荐**
   - 根据日志内容推荐合适的分析prompt
   - 根据历史分析推荐相关问题

---

## 总结

本次更新显著提升了系统的灵活性和实用性：

1. **更灵活的分析**：用户可以根据实际需求自定义分析方向
2. **更透明的过程**：展示AI分析的依据，增强可信度
3. **更好的体验**：不仅限于错误分析，支持多种场景

这些改进使系统从"通用日志分析工具"升级为"智能可定制的日志诊断助手"。
