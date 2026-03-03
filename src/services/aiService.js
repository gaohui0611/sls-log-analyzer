/**
 * AI 服务 - 支持多种大模型
 */

import axios from 'axios';

/**
 * 调用 AI 分析日志
 */
export async function callAI(logs, query, timeInfo, aiConfig) {
    const { provider, apiKey, baseUrl, model } = aiConfig;

    // 准备日志摘要
    const logSummary = prepareLogSummary(logs, query);

    // 构建提示词
    const prompt = buildPrompt(logSummary, query, timeInfo);

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

        // 收集错误
        if (level === 'ERROR' || message.includes('Exception')) {
            summary.errors.push({
                level,
                message: message.substring(0, 300)
            });
        }

        // 收集警告
        if (level === 'WARN') {
            summary.warnings.push({
                message: message.substring(0, 300)
            });
        }

        // 收集样本日志
        if (summary.sampleLogs.length < 10) {
            summary.sampleLogs.push({
                time: log.__time__ ? new Date(log.__time__ * 1000).toISOString() : null,
                level,
                message: message.substring(0, 500)
            });
        }
    }

    return summary;
}

/**
 * 构建 AI 提示词
 */
function buildPrompt(logSummary, query, timeInfo) {
    return `你是一个专业的日志分析专家。请分析以下日志数据并提供洞察。

## 查询信息
- 查询关键词: ${query || '(全部日志)'}
- 时间范围: ${timeInfo.label}
- 时间区间: ${timeInfo.fromFormatted} ~ ${timeInfo.toFormatted}

## 日志统计
- 总日志数: ${logSummary.total}
- 错误数: ${logSummary.errors.length}
- 警告数: ${logSummary.warnings.length}

## 错误详情
${logSummary.errors.length > 0 ? logSummary.errors.map((e, i) => `${i + 1}. [${e.level}] ${e.message}`).join('\n') : '(无错误)'}

## 警告详情
${logSummary.warnings.length > 0 ? logSummary.warnings.map((w, i) => `${i + 1}. ${w.message}`).join('\n') : '(无警告)'}

## 样本日志
${logSummary.sampleLogs.map((l, i) => `[${l.time}] [${l.level}] ${l.message}`).join('\n---\n')}

请提供以下分析:

1. **问题诊断**: 基于日志内容，识别主要问题和异常
2. **根因分析**: 分析可能的根本原因
3. **影响评估**: 评估问题的影响范围和严重程度
4. **解决建议**: 提供具体的排查步骤和解决方案
5. **预防措施**: 建议如何避免类似问题再次发生

请以 Markdown 格式输出，使用清晰的标题和列表。`;
}

/**
 * 调用 Anthropic Claude API
 */
async function callAnthropic(prompt, apiKey, baseUrl, model) {
    const url = baseUrl || 'https://api.anthropic.com/v1/messages';

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
                'x-api-key': apiKey,
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
                'Authorization': `Bearer ${apiKey}`
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
                'Authorization': `Bearer ${apiKey}`
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
                'x-api-key': apiKey,
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
                'Authorization': `Bearer ${apiKey}`
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

    const requestBody = {
        model: model || 'default',
        messages: [
            {"role": "user", "content": prompt}
        ],
        max_tokens: 100
    };

    console.log('[AI Test] Request URL:', url);
    console.log('[AI Test] Model:', model);
    console.log('[AI Test] API Key prefix:', apiKey.substring(0, 10) + '...');
    console.log('[AI Test] Request body:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
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
