/**
 * 认证路由 - /api/auto-sync-auth, /api/bookmark-sync, /api/test-auth, /api/sync-auth, /api/auth-status, /api/time-ranges
 */

import express from 'express';
import fs from 'fs/promises';
import { readConfig, saveConfig } from '../utils/config.js';

const router = express.Router();

/**
 * POST /api/auto-sync-auth - 自动同步认证信息（使用浏览器自动化）
 */
router.post('/auto-sync-auth', async (req, res) => {
    try {
        const { region } = req.body;

        // 导入自动同步服务
        const { autoSyncAuth } = await import('../services/autoAuthSync.js');

        const result = await autoSyncAuth(region || 'cn-beijing');

        res.json(result);

    } catch (error) {
        console.error('自动同步失败:', error);

        // 返回更详细的错误信息
        let errorMessage = error.message;
        if (error.message.includes('Could not find Chrome')) {
            errorMessage = 'Chrome 浏览器未安装或路径配置错误，请使用手动同步方式';
        } else if (error.message.includes('Failed to launch')) {
            errorMessage = '无法启动浏览器，服务器环境可能不支持自动化同步，请使用手动同步方式';
        }

        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
});

/**
 * POST /api/bookmark-sync - 书签工具同步 CSRF Token
 * 书签在 SLS 控制台页面执行，抓取运行时内存中的 csrfToken / b3
 * （这两个值无法从磁盘 cookies 读取，只能靠书签在页面内抓取）
 * Cookies 由后端磁盘读取（autoSyncAuth），书签只负责补 token。
 */
router.post('/bookmark-sync', async (req, res) => {
    try {
        const { url, referrer, csrfToken, b3 } = req.body;

        if (!csrfToken && !b3) {
            return res.status(400).json({
                success: false,
                error: '未抓取到 CSRF Token 或 b3，请确认在 SLS 控制台页面（且页面已加载完成）点击书签'
            });
        }

        // 校验来源：必须是阿里云 SLS 控制台
        const sourceUrl = url || referrer || '';
        if (!sourceUrl.includes('aliyun.com') && !sourceUrl.includes('sls.console')) {
            console.log('⚠️ 书签同步来源校验失败，URL:', sourceUrl);
            return res.status(400).json({
                success: false,
                error: '请在阿里云 SLS 控制台页面 (sls.console.aliyun.com) 使用此书签工具，而不是在 localhost 使用。'
            });
        }

        console.log('收到书签同步请求（抓取 CSRF Token）:');
        console.log('- 来源 URL:', url);
        console.log('- CSRF Token:', csrfToken ? '有' : '无');
        console.log('- B3:', b3 ? '有' : '无');

        // 从磁盘读取最新的 cookies（含 HttpOnly），与书签抓到的 token 合并
        const { autoSyncAuth } = await import('../services/autoAuthSync.js');
        let cookiesCount = 0;
        try {
            const refresh = await autoSyncAuth();
            cookiesCount = refresh.cookies;
        } catch (err) {
            console.log('磁盘读取 cookies 失败（仅保存 token）:', err.message);
        }

        const config = await readConfig();

        // 保存 CSRF Token 和 b3
        if (csrfToken) config.slsConfig.csrfToken = csrfToken;
        if (b3) config.slsConfig.b3 = b3;

        // 尝试从 URL 中提取 region
        if (url && url.includes('slsRegion=')) {
            const match = url.match(/slsRegion=([^&]+)/);
            if (match) {
                config.slsConfig.region = match[1];
                console.log('- 检测到 Region:', match[1]);
            }
        }

        await saveConfig(config);

        // 实际验证认证是否有效
        let isValid = false;
        const projects = config.projects || {};
        const projectIds = Object.keys(projects);

        if (projectIds.length > 0) {
            try {
                const testProject = projects[projectIds[0]];
                const { searchLogs } = await import('../services/slsClient.js');

                const result = await searchLogs({
                    projectName: testProject.projectName,
                    logStoreName: testProject.logStoreName,
                    query: '',
                    from: Math.floor(Date.now() / 1000) - 3600,
                    to: Math.floor(Date.now() / 1000),
                    size: 1
                }, config.slsConfig);

                isValid = result.success || result.count >= 0;
                console.log('书签同步后认证验证:', isValid ? '有效' : '无效');
            } catch (error) {
                console.log('书签同步后认证验证失败:', error.message);
                isValid = false;
            }
        }

        res.json({
            success: true,
            valid: isValid,
            message: isValid ? '认证信息已同步并验证有效' : '认证信息已同步，但验证未通过（可能缺少CSRF Token或b3）'
        });

    } catch (error) {
        console.error('书签同步失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/test-auth - 测试认证信息（实际查询日志）
 */
router.post('/test-auth', async (req, res) => {
    try {
        const config = await readConfig();
        const slsConfig = config.slsConfig || {};

        if (!slsConfig.cookies || Object.keys(slsConfig.cookies).length === 0) {
            return res.json({
                success: false,
                error: '没有认证信息'
            });
        }

        // 使用真实的项目进行测试
        const projects = config.projects || {};
        const projectIds = Object.keys(projects);

        if (projectIds.length === 0) {
            return res.json({
                success: false,
                error: '没有配置项目，无法测试'
            });
        }

        const testProject = projects[projectIds[0]];

        console.log('🧪 测试认证信息 - 查询日志...');
        console.log('- 项目:', testProject.projectName);
        console.log('- LogStore:', testProject.logStoreName);

        // 导入搜索日志函数
        const { searchLogs } = await import('../services/slsClient.js');

        // 尝试查询日志
        const result = await searchLogs({
            projectName: testProject.projectName,
            logStoreName: testProject.logStoreName,
            query: '',
            from: Math.floor(Date.now() / 1000) - 3600,
            to: Math.floor(Date.now() / 1000),
            size: 1
        }, slsConfig);

        console.log('✅ 测试成功 - 获取到', result.count, '条日志');

        res.json({
            success: true,
            valid: true,
            message: '认证有效',
            data: {
                logCount: result.count,
                returnedCount: result.logs.length
            }
        });

    } catch (error) {
        console.error('❌ 测试失败:', error.message);

        // 分析错误类型
        let errorMessage = error.message;
        if (error.message.includes('401') || error.message.includes('认证')) {
            errorMessage = '认证已失效，请重新同步';
        } else if (error.message.includes('403')) {
            errorMessage = '没有权限访问该日志库';
        } else if (error.message.includes('404')) {
            errorMessage = '日志库不存在';
        }

        res.status(500).json({
            success: false,
            error: errorMessage,
            details: error.message
        });
    }
});

/**
 * POST /api/sync-auth - 同步认证信息
 */
router.post('/sync-auth', async (req, res) => {
    try {
        const { cookies, csrfToken, b3, region } = req.body;

        const config = await readConfig();

        config.slsConfig = {
            ...config.slsConfig,
            cookies: cookies || config.slsConfig?.cookies,
            csrfToken: csrfToken || config.slsConfig?.csrfToken,
            b3: b3 || config.slsConfig?.b3,
            region: region || config.slsConfig?.region || 'cn-beijing'
        };

        // 验证认证 - 使用实际的日志查询来验证（和 /api/auth-status 相同的方法）
        let isValid = false;
        const projects = config.projects || {};
        const projectIds = Object.keys(projects);

        if (projectIds.length > 0) {
            try {
                const testProject = projects[projectIds[0]];
                const { searchLogs } = await import('../services/slsClient.js');

                const result = await searchLogs({
                    projectName: testProject.projectName,
                    logStoreName: testProject.logStoreName,
                    query: '',
                    from: Math.floor(Date.now() / 1000) - 3600,
                    to: Math.floor(Date.now() / 1000),
                    size: 1
                }, config.slsConfig);

                isValid = result.success || result.count >= 0;
            } catch (error) {
                console.log('验证认证失败:', error.message);
                isValid = false;
            }
        }

        await saveConfig(config);

        res.json({
            success: true,
            valid: isValid,
            message: isValid ? '认证信息已同步' : '警告: 认证可能已失效'
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/auth-status - 获取认证状态（实际验证）
 */
router.get('/auth-status', async (req, res) => {
    try {
        const config = await readConfig();
        const slsConfig = config.slsConfig || {};

        const hasCookies = !!slsConfig.cookies && Object.keys(slsConfig.cookies).length > 0;
        const hasCsrfToken = !!slsConfig.csrfToken;

        // 计算 cookie 时间相关信息
        let createdAt = null;
        let cookieAgeDays = 0;
        const MAX_AGE_DAYS = 30;

        if (slsConfig.cookies?.timestamp) {
            const timestamp = slsConfig.cookies.timestamp;
            createdAt = new Date(timestamp).toISOString();
            const age = Date.now() - timestamp;
            cookieAgeDays = Math.floor(age / (24 * 60 * 60 * 1000));
        }

        // 实际验证：调用 SLS API 检测认证是否有效
        let isValid = false;
        let validationError = null;

        if (hasCookies) {
            const projects = config.projects || {};
            const projectIds = Object.keys(projects);

            if (projectIds.length > 0) {
                try {
                    const testProject = projects[projectIds[0]];
                    const { searchLogs } = await import('../services/slsClient.js');

                    await searchLogs({
                        projectName: testProject.projectName,
                        logStoreName: testProject.logStoreName,
                        query: '',
                        from: Math.floor(Date.now() / 1000) - 3600,
                        to: Math.floor(Date.now() / 1000),
                        size: 1
                    }, slsConfig);

                    isValid = true;
                } catch (error) {
                    console.log('认证验证失败:', error.message);
                    validationError = error.message;

                    // 根据错误类型判断
                    if (error.message.includes('401') ||
                        error.message.includes('登录') ||
                        error.message.includes('认证') ||
                        error.message.includes('Unauthorized')) {
                        isValid = false;
                    }
                }
            } else {
                // 没有配置项目，只能检查 cookies 是否存在
                isValid = hasCookies;
                validationError = '未配置项目，无法实际验证';
            }
        }

        res.json({
            success: true,
            data: {
                hasCookies,
                hasCsrfToken,
                isValid,
                region: slsConfig.region || 'cn-beijing',
                createdAt,
                cookieAgeDays,
                maxAgeDays: MAX_AGE_DAYS,
                validationError
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/time-ranges - 获取支持的时间范围
 */
router.get('/time-ranges', (req, res) => {
    res.json({
        success: true,
        data: [
            { value: 'today', label: '今天' },
            { value: 'yesterday', label: '昨天' },
            { value: 'thisWeek', label: '本周' },
            { value: 'lastWeek', label: '上周' },
            { value: 'thisMonth', label: '本月' },
            { value: 'lastMonth', label: '上月' },
            { value: 'last7days', label: '最近7天' },
            { value: 'last30days', label: '最近30天' }
        ]
    });
});

export default router;
