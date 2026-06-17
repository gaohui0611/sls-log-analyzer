/**
 * AI 路由 - /api/test-ai
 */

import express from 'express';
import { readConfig } from '../utils/config.js';

const router = express.Router();

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

export default router;
