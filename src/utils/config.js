/**
 * 配置工具 - 统一的 readConfig / saveConfig
 */

import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

/**
 * 读取配置
 * @returns {Promise<Object>} 配置对象
 */
export async function readConfig() {
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
 * @param {Object} config - 配置对象
 */
export async function saveConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
