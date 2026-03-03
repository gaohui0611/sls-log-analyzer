/**
 * API 路由
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();
const CONFIG_FILE = path.join(process.cwd(), 'config.json');
const REPORTS_DIR = path.join(process.cwd(), 'reports');

// 确保目录存在
await fs.mkdir(REPORTS_DIR, { recursive: true });

/**
 * 读取配置
 */
async function readConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {
            projects: {},
            aiConfig: {
                provider: 'anthropic',
                apiKey: '',
                baseUrl: 'https://api.anthropic.com',
                model: 'claude-3-5-sonnet-20241022'
            },
            slsConfig: {
                region: 'cn-beijing'
            }
        };
    }
}

/**
 * 保存配置
 */
async function saveConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * GET /api/config - 获取配置
 */
router.get('/config', async (req, res) => {
    try {
        const config = await readConfig();
        res.json({
            success: true,
            data: {
                projects: config.projects,
                aiProvider: config.aiConfig?.provider || 'anthropic',
                aiModel: config.aiConfig?.model || '',
                aiBaseUrl: config.aiConfig?.baseUrl || '',
                hasApiKey: !!config.aiConfig?.apiKey
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/config - 保存配置
 */
router.post('/config', async (req, res) => {
    try {
        const { projects, aiConfig } = req.body;

        const config = await readConfig();

        if (projects) {
            config.projects = projects;
        }

        if (aiConfig) {
            // 过滤掉占位符 API Key，避免覆盖真实配置
            const placeholders = ['•••••••••••••••', '••••••••••••••'];
            if (aiConfig.apiKey && placeholders.includes(aiConfig.apiKey)) {
                delete aiConfig.apiKey;
            }
            config.aiConfig = { ...config.aiConfig, ...aiConfig };
        }

        await saveConfig(config);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/analyze - 执行日志分析
 */
router.post('/analyze', async (req, res) => {
    try {
        console.log('[DEBUG] 收到分析请求');
        const { projectId, timeRange, query, size = 100 } = req.body;
        console.log('[DEBUG] 项目 ID:', projectId);

        if (!projectId) {
            return res.status(400).json({ success: false, error: '缺少项目 ID' });
        }

        console.log('[DEBUG] 读取配置...');
        const config = await readConfig();
        const project = config.projects[projectId];
        console.log('[DEBUG] 项目配置:', project);

        if (!project) {
            return res.status(404).json({ success: false, error: '项目不存在' });
        }

        // 验证 SLS 认证状态
        const slsConfig = config.slsConfig || {};
        console.log('[DEBUG] SLS cookies 数量:', Object.keys(slsConfig.cookies || {}).length);
        if (!slsConfig.cookies || Object.keys(slsConfig.cookies).length === 0) {
            return res.status(401).json({
                success: false,
                error: 'SLS 认证信息缺失，请先同步认证信息'
            });
        }

        console.log('[DEBUG] 开始分析日志...');
        // 导入分析模块
        const { analyzeLogs } = await import('../services/analyzer.js');

        console.log('[DEBUG] 调用 analyzeLogs...');
        const result = await analyzeLogs({
            projectName: project.projectName,
            logStoreName: project.logStoreName,
            timeRange,
            query,
            size,
            aiConfig: config.aiConfig
        });
        console.log('[DEBUG] 分析完成');

        res.json({ success: true, data: result });

    } catch (error) {
        console.error('分析失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reports - 获取报告列表
 */
router.get('/reports', async (req, res) => {
    try {
        const files = await fs.readdir(REPORTS_DIR);
        const reports = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(REPORTS_DIR, file);
                const stat = await fs.stat(filePath);
                const content = await fs.readFile(filePath, 'utf-8');
                const data = JSON.parse(content);

                reports.push({
                    id: file.replace('.json', ''),
                    filename: file,
                    createdAt: new Date(stat.birthtime).toISOString(),
                    projectName: data.projectName,
                    logStoreName: data.logStoreName,
                    query: data.query,
                    timeRange: data.timeRange,
                    timeFrom: data.timeFrom,
                    timeTo: data.timeTo,
                    size: data.size,
                    logCount: data.logCount,
                    returnedCount: data.returnedCount
                });
            }
        }

        reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, data: reports });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/reports/:id - 获取报告详情
 */
router.get('/reports/:id', async (req, res) => {
    try {
        const filePath = path.join(REPORTS_DIR, `${req.params.id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        res.json({ success: true, data });
    } catch (error) {
        res.status(404).json({ success: false, error: '报告不存在' });
    }
});

/**
 * DELETE /api/reports/:id - 删除报告
 */
router.delete('/reports/:id', async (req, res) => {
    try {
        const filePath = path.join(REPORTS_DIR, `${req.params.id}.json`);
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (error) {
        res.status(404).json({ success: false, error: '报告不存在' });
    }
});

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
 * POST /api/bookmark-sync - 书签工具同步认证信息
 */
router.post('/bookmark-sync', async (req, res) => {
    try {
        const { cookies, url, referrer } = req.body;

        if (!cookies || Object.keys(cookies).length === 0) {
            return res.status(400).json({
                success: false,
                error: '未找到认证信息，请确保已在阿里云登录'
            });
        }

        console.log('收到书签同步请求:');
        console.log('- Cookies 数量:', Object.keys(cookies).length);
        console.log('- 来源 URL:', url);

        const config = await readConfig();

        // 更新配置
        config.slsConfig = {
            ...config.slsConfig,
            cookies: { ...cookies, timestamp: Date.now() }
        };

        // 尝试从 URL 中提取 region
        if (url && url.includes('slsRegion=')) {
            const match = url.match(/slsRegion=([^&]+)/);
            if (match) {
                config.slsConfig.region = match[1];
                console.log('- 检测到 Region:', match[1]);
            }
        }

        await saveConfig(config);

        console.log('认证信息已保存');

        res.json({
            success: true,
            message: '认证信息已同步'
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
            from: Math.floor(Date.now() / 1000) - 3600, // 1小时前
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

/**
 * POST /api/test-ai - 测试 AI 配置
 */
router.post('/test-ai', async (req, res) => {
    try {
        let { provider, apiKey, baseUrl, model } = req.body;

        console.log('[Test AI] Request body:', { provider, apiKey: apiKey?.substring(0, 15), baseUrl, model });

        // 如果使用已保存的配置
        if (apiKey === 'USE_SAVED_CONFIG') {
            const config = await readConfig();
            console.log('[Test AI] Config loaded:', config.aiConfig);
            if (!config.aiConfig || !config.aiConfig.apiKey) {
                return res.status(400).json({ success: false, error: '未找到已保存的 AI 配置' });
            }
            apiKey = config.aiConfig.apiKey;
            // 如果请求中没有提供这些值，使用已保存的
            provider = provider || config.aiConfig.provider;
            baseUrl = baseUrl || config.aiConfig.baseUrl;
            model = model || config.aiConfig.model;
        }

        console.log('[Test AI] Final values:', { provider, apiKey: apiKey?.substring(0, 15), baseUrl, model });

        if (!apiKey) {
            return res.status(400).json({ success: false, error: '请提供 API Key' });
        }

        if (!model) {
            return res.status(400).json({ success: false, error: '请提供模型名称' });
        }

        if (provider === 'openai-compatible' && !baseUrl) {
            return res.status(400).json({ success: false, error: 'OpenAI 兼容 API 需要提供 Base URL' });
        }

        // 导入 AI 服务
        const { testAIConnection } = await import('../services/aiService.js');

        const result = await testAIConnection({ provider, apiKey, baseUrl, model });

        res.json({ success: true, data: result });

    } catch (error) {
        console.error('AI 测试失败:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data || error.stack
        });
    }
});

/**
 * 全局错误处理中间件
 */
router.use((err, req, res, next) => {
    console.error('API 错误:', err);
    res.status(500).json({
        success: false,
        error: err.message || '服务器内部错误'
    });
});

export default router;
