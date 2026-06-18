/**
 * 项目路由 - /api/config
 */

import express from 'express';
import { readConfig, saveConfig } from '../utils/config.js';

const router = express.Router();

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
                environments: config.environments,
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
        const { projects, environments, aiConfig } = req.body;

        const config = await readConfig();

        if (projects) {
            config.projects = projects;
        }

        if (environments) {
            config.environments = environments;
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

export default router;
