/**
 * AI 服务 - 支持多种大模型
 */

import axios from 'axios';

/**
 * 从日志中提取 traceId — 支持独立字段和 content 内嵌格式
 */
function extractTraceId(log, message) {
    if (log.TID || log.traceId || log.trace_id) {
        return log.TID || log.traceId || log.trace_id;
    }
    const match = message.match(/\[TID_([^\]]+)\]|TID[:\s]+(\S+)/);
    if (match) return match[1] || match[2];
    return '';
}

/**
 * 调用 AI 分析日志
 */
export async function callAI(logs, query, timeInfo, aiConfig, customPrompt = '') {
    const { provider, apiKey, baseUrl, model } = aiConfig;

    // 准备日志摘要
    const logSummary = prepareLogSummary(logs, query);

    // 构建提示词（支持自定义prompt）
    const prompt = buildPrompt(logSummary, query, timeInfo, customPrompt);

    switch (provider) {
        case 'anthropic':
            return await callAnthropic(prompt, apiKey, baseUrl, model);

        case 'openai':
            return await callOpenAI(prompt, apiKey, baseUrl, model);

        case 'openai-compatible':
            return await callOpenAICompatible(prompt, apiKey, baseUrl, model);

        default:
            throw new Error(`不支持的 AI 提供商: ${provider}`);
    }
}

/**
 * 准备日志摘要
 */
function prepareLogSummary(logs, query) {
    const summary = {
        total: logs.length,
        errors: [],
        warnings: [],
        patterns: {},
        sampleLogs: []
    };

    for (const log of logs) {
        const level = (log.level || log.LEVEL || 'INFO').toUpperCase();
        // SLS 日志使用 content 字段
        const message = log.content || log.message || log.msg || '';
        const traceId = extractTraceId(log, message);
        const userId = log.userId || log.user_id || '';

        // 收集错误
        if (level === 'ERROR' || message.includes('Exception')) {
            summary.errors.push({
                level,
                message: message.substring(0, 300),
                time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null
            });
        }

        // 收集警告
        if (level === 'WARN') {
            summary.warnings.push({
                message: message.substring(0, 300),
                time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null
            });
        }

        // 收集样本日志（包含更多详情）
        if (summary.sampleLogs.length < 10) {
            summary.sampleLogs.push({
                time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null,
                level,
                message: message.substring(0, 500),
                traceId,
                userId
            });
        }
    }

    return summary;
}

/**
 * 构建 AI 提示词
 */
function buildPrompt(logSummary, query, timeInfo, customPrompt = '') {
    const errorRatio = logSummary.errors.length / Math.max(logSummary.total, 1);
    const hasKeywords = !!query && query.trim().length > 0;
    const hasErrors = logSummary.errors.length > 0 || logSummary.warnings.length > 0;
    const isBusinessQuery = hasKeywords && errorRatio < 0.1;
    const mode = isBusinessQuery ? '业务链路分析' : hasErrors ? '异常错误分析' : '概览分析';

    let prompt = `你是一个专业的日志分析专家。请分析以下日志数据并提供洞察。

## 查询信息
- 查询关键词: ${query || '(全部日志)'}
- 时间范围: ${timeInfo.label}
- 时间区间: ${timeInfo.fromFormatted} ~ ${timeInfo.toFormatted}
- 分析模式: ${mode}

## 日志统计
- 总日志数: ${logSummary.total}
- 错误数: ${logSummary.errors.length}
- 警告数: ${logSummary.warnings.length}

`;

    if (hasErrors) {
        prompt += `## 错误详情
${logSummary.errors.length > 0 ? logSummary.errors.map((e, i) => `${i + 1}. [${e.level}] ${e.message}`).join('\n') : '(无错误)'}

## 警告详情
${logSummary.warnings.length > 0 ? logSummary.warnings.map((w, i) => `${i + 1}. ${w.message}`).join('\n') : '(无警告)'}
`;
    }

    prompt += `## 样本日志（按时间顺序）
${logSummary.sampleLogs.map((l, i) => `
### 日志 ${i + 1}
- 时间: ${l.time}
- 级别: ${l.level}
- 内容: ${l.message}
${l.traceId ? `- TraceID: ${l.traceId}` : ''}
${l.userId ? `- UserID: ${l.userId}` : ''}
`).join('\n')}
`;

    if (customPrompt && customPrompt.trim()) {
        prompt += `\n## 分析要求\n${customPrompt.trim()}\n`;
    } else if (isBusinessQuery) {
        prompt += `
## 分析要求（业务链路分析）

用户通过关键词「${query}」搜索日志，目的是理解业务逻辑或排查业务流程。请按以下框架分析：

1. **业务链路梳理**: 按时间顺序还原本次请求/操作的完整链路，从入口到出口，标注每个关键步骤（如：参数接收 → 校验 → 数据查询 → 业务处理 → 结果返回）
2. **关键数据提取**: 从日志中提取业务关键参数（如 ID、状态码、返回值、SQL 语句等），帮助用户快速定位业务节点
3. **业务异常识别**: 识别流程中的异常节点（如查询空结果、参数缺失、权限不足等），即使日志级别不是 ERROR
4. **关键词优化建议**: 根据日志内容，推荐更精准的搜索关键词或组合查询，帮助用户缩小范围或找到关联日志。格式：
   - 建议查询1: \`关键词\` — 原因说明
   - 建议查询2: \`关键词 AND 关键词\` — 原因说明
5. **关联 TraceID**: 如果日志中有 TraceID，指出哪些 TraceID 代表完整请求链路，建议用户追踪查看

请以 Markdown 格式输出，优先展示业务流程，再展示异常和建议。
`;
    } else if (hasErrors) {
        prompt += `
## 分析要求（异常错误分析）

日志中发现 ${logSummary.errors.length} 个错误和 ${logSummary.warnings.length} 个警告，请重点分析异常：

1. **错误定位**: 列出每个错误/异常的关键信息（类型、时间、影响范围），标注最严重的错误
2. **根因分析**: 从日志链路推断根本原因，结合 SQL 语句、请求参数、业务上下文等
3. **链路还原**: 还原出错请求的完整链路（从请求入口到报错点），指出哪个节点开始异常
4. **影响评估**: 评估错误对业务的影响（哪些用户/数据受影响）
5. **解决建议**: 提供具体的排查步骤和修复方案
6. **关键词建议**: 推荐更精准的搜索关键词帮助深入排查

请以 Markdown 格式输出，重点突出错误信息和根因。
`;
    } else {
        prompt += `
## 分析要求（概览分析）

1. **日志概览**: 日志整体情况、主要级别分布、时间分布特征
2. **业务特征**: 从日志内容中识别主要业务场景和操作类型
3. **潜在风险**: 识别可能的性能问题、异常行为或隐患
4. **关键词建议**: 推荐搜索关键词帮助进一步深入分析

请以 Markdown 格式输出。
`;
    }

    return prompt;
}

/**
 * 调用 Anthropic Claude API
 */
async function callAnthropic(prompt, apiKey, baseUrl, model) {
    const url = baseUrl || 'https://api.anthropic.com/v1/messages';

    // 清理 API Key，移除可能的空格和换行符
    const cleanApiKey = apiKey.trim();

    try {
        const response = await axios.post(url, {
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': cleanApiKey,
                'anthropic-version': '2023-06-01'
            },
            timeout: 120000
        });

        return {
            provider: 'anthropic',
            model: model || 'claude-3-5-sonnet-20241022',
            content: response.data.content[0].text,
            usage: response.data.usage
        };
    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error('Anthropic API Key 无效或已过期');
        }
        if (error.response?.status === 429) {
            throw new Error('请求过于频繁，请稍后再试');
        }
        throw new Error(`Anthropic API 调用失败: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * 调用 OpenAI API
 */
async function callOpenAI(prompt, apiKey, baseUrl, model) {
    const url = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`;

    // 清理 API Key，移除可能的空格和换行符
    const cleanApiKey = apiKey.trim();

    try {
        const response = await axios.post(url, {
            model: model || 'gpt-4',
            messages: [{
                role: 'user',
                content: prompt
            }],
            max_tokens: 4096
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cleanApiKey}`
            },
            timeout: 120000
        });

        return {
            provider: 'openai',
            model: model || 'gpt-4',
            content: response.data.choices[0].message.content,
            usage: response.data.usage
        };
    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error('OpenAI API Key 无效或已过期');
        }
        if (error.response?.status === 429) {
            throw new Error('请求过于频繁，请稍后再试');
        }
        throw new Error(`OpenAI API 调用失败: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * 调用 OpenAI 兼容 API (如智谱 AI、通义千问等)
 */
async function callOpenAICompatible(prompt, apiKey, baseUrl, model) {
    if (!baseUrl) {
        throw new Error('OpenAI 兼容 API 需要提供 Base URL');
    }

    // 智能处理 URL：确保末尾没有斜杠，然后拼接路径
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const url = `${cleanBaseUrl}/chat/completions`;

    // 清理 API Key，移除可能的空格和换行符
    const cleanApiKey = apiKey.trim();

    try {
        const response = await axios.post(url, {
            model: model || 'default',
            messages: [{
                role: 'user',
                content: prompt
            }],
            max_tokens: 4096
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cleanApiKey}`
            },
            timeout: 120000
        });

        return {
            provider: 'openai-compatible',
            model: model || 'default',
            content: response.data.choices[0].message.content,
            usage: response.data.usage
        };
    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error('API Key 无效或已过期');
        }
        if (error.response?.status === 429) {
            throw new Error('请求过于频繁，请稍后再试');
        }
        throw new Error(`API 调用失败: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * 测试 AI 连接
 */
export async function testAIConnection(config) {
    const { provider, apiKey, baseUrl, model } = config;

    const testPrompt = '请回复 "连接测试成功"，不要说其他内容。';

    switch (provider) {
        case 'anthropic':
            return await testAnthropic(testPrompt, apiKey, baseUrl, model);

        case 'openai':
            return await testOpenAI(testPrompt, apiKey, baseUrl, model);

        case 'openai-compatible':
            return await testOpenAICompatible(testPrompt, apiKey, baseUrl, model);

        default:
            throw new Error(`不支持的 AI 提供商: ${provider}`);
    }
}

/**
 * 测试 Anthropic 连接
 */
async function testAnthropic(prompt, apiKey, baseUrl, model) {
    const url = baseUrl || 'https://api.anthropic.com/v1/messages';

    // 清理 API Key，移除可能的空格和换行符
    const cleanApiKey = apiKey.trim();

    try {
        const response = await axios.post(url, {
            model: model || 'claude-3-5-sonnet-20241022',
            max_tokens: 100,
            messages: [{
                role: 'user',
                content: prompt
            }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': cleanApiKey,
                'anthropic-version': '2023-06-01'
            },
            timeout: 30000
        });

        return {
            success: true,
            provider: 'anthropic',
            model: model || 'claude-3-5-sonnet-20241022',
            response: response.data.content[0].text,
            usage: response.data.usage
        };
    } catch (error) {
        throw new Error(`Anthropic API 调用失败: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * 测试 OpenAI 连接
 */
async function testOpenAI(prompt, apiKey, baseUrl, model) {
    const url = `${baseUrl || 'https://api.openai.com'}/v1/chat/completions`;

    // 清理 API Key，移除可能的空格和换行符
    const cleanApiKey = apiKey.trim();

    try {
        const response = await axios.post(url, {
            model: model || 'gpt-4',
            messages: [{
                role: 'user',
                content: prompt
            }],
            max_tokens: 100
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cleanApiKey}`
            },
            timeout: 30000
        });

        return {
            success: true,
            provider: 'openai',
            model: model || 'gpt-4',
            response: response.data.choices[0].message.content,
            usage: response.data.usage
        };
    } catch (error) {
        throw new Error(`OpenAI API 调用失败: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * 测试 OpenAI 兼容 API 连接
 */
async function testOpenAICompatible(prompt, apiKey, baseUrl, model) {
    // 智能处理 URL：确保末尾没有斜杠，然后拼接路径
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const url = `${cleanBaseUrl}/chat/completions`;

    // 清理 API Key，移除可能的空格和换行符
    const cleanApiKey = apiKey.trim();

    const requestBody = {
        model: model || 'default',
        messages: [
            {"role": "user", "content": prompt}
        ],
        max_tokens: 100
    };

    console.log('[AI Test] Request URL:', url);
    console.log('[AI Test] Model:', model);
    console.log('[AI Test] API Key prefix:', cleanApiKey.substring(0, 10) + '...');
    console.log('[AI Test] Request body:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cleanApiKey}`
            },
            timeout: 30000
        });

        return {
            success: true,
            provider: 'openai-compatible',
            model: model || 'default',
            response: response.data.choices[0].message.content,
            usage: response.data.usage
        };
    } catch (error) {
        console.error('[AI Test] Error details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            headers: error.config?.headers
        });
        throw new Error(`API 调用失败: ${error.response?.data?.error?.message || error.message}`);
    }
}