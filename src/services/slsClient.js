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

    try {
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

    } catch (error) {
        if (error.response?.status === 401) {
            throw new Error('认证失败，请重新同步认证信息');
        }
        if (error.response?.status === 403) {
            throw new Error('没有权限访问该日志库');
        }
        throw error;
    }
}
