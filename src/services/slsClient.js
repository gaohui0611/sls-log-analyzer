/**
 * 阿里云 SLS 客户端
 */

import axios from 'axios';

// SLS API 基础 URL
const SLS_API_BASE = 'https://sls.console.aliyun.com/console/logstoreindex';

/**
 * 格式化 Cookie 头
 */
function formatCookieHeader(cookies) {
    if (!cookies || typeof cookies !== 'object') return '';

    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

/**
 * 延迟函数
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的请求函数
 */
async function requestWithRetry(requestFn, maxRetries = 2) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            
            // 如果是连接重置或中断，且还有重试次数，则重试
            if ((error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') && i < maxRetries) {
                console.log(`[SLS Client] 连接中断，${i + 1}/${maxRetries} 次重试...`);
                await delay(1000 * (i + 1)); // 递增延迟：1s, 2s
                continue;
            }
            
            // 其他错误直接抛出
            throw error;
        }
    }
    
    throw lastError;
}

/**
 * 搜索日志
 */
export async function searchLogs(params, slsConfig) {
    const {
        projectName,
        logStoreName,
        query = '',
        from,
        to,
        page = 1,
        size = 100
    } = params;

    const headers = {
        'accept': 'application/json',
        'accept-language': 'en,zh-CN;q=0.9,zh;q=0.8',
        'content-type': 'application/x-www-form-urlencoded',
        'cookie': formatCookieHeader(slsConfig.cookies),
        'origin': 'https://sls.console.aliyun.com',
        'referer': `https://sls.console.aliyun.com/lognext/project/${projectName}/logsearch/${logStoreName}?slsRegion=${slsConfig.region || 'cn-beijing'}`,
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    };

    if (slsConfig.csrfToken) {
        headers['x-csrf-token'] = slsConfig.csrfToken;
    }

    if (slsConfig.b3) {
        headers['b3'] = slsConfig.b3;
    }

    // 使用重试机制执行请求
    return await requestWithRetry(async () => {
        // 构建完整的 API URL
        const apiUrl = `${SLS_API_BASE}/getLogs.json`;

        const response = await axios.post(apiUrl, new URLSearchParams({
            LogStoreName: logStoreName,
            ProjectName: projectName,
            query,
            from: from.toString(),
            to: to.toString(),
            Page: page.toString(),
            Size: size.toString(),
            type: 'log'
        }), {
            headers,
            timeout: 30000
        });

        // 检查响应是否是 HTML（说明认证失败或重定向到登录页）
        if (typeof response.data === 'string' && response.data.includes('<!doctype')) {
            throw new Error('认证已失效，API 返回了登录页面，请重新同步认证信息');
        }

        // 检查响应是否是有效的 JSON 对象
        if (typeof response.data !== 'object' || response.data === null) {
            throw new Error('API 返回格式错误: ' + typeof response.data);
        }

        // 检查 API 错误响应
        if (response.data.code && !response.data.success) {
            throw new Error(`API 错误: ${response.data.message || response.data.code}`);
        }

        // API 响应结构: { code: "200", data: { logs: [...], count: ... } }
        const logs = response.data.data?.logs || [];
        const count = response.data.data?.count || 0;

        return {
            success: true,
            count,
            logs,
            raw: response.data
        };
    }, 2).catch(error => {
        // 处理连接重置错误
        if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
            throw new Error('网络连接被中断，可能是认证信息已过期或网络不稳定，请重新同步认证信息');
        }
        if (error.response?.status === 401) {
            throw new Error('认证失败，请重新同步认证信息');
        }
        if (error.response?.status === 403) {
            throw new Error('没有权限访问该日志库');
        }
        if (error.code === 'ETIMEDOUT') {
            throw new Error('请求超时，请检查网络连接或稍后重试');
        }
        throw error;
    });
}
