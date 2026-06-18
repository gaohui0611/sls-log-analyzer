/**
 * 配置工具 - 统一的 readConfig / saveConfig + 数据模型迁移
 */

import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

/** 默认配置（新建项目时） */
function defaultConfig() {
    return {
        projects: {},
        environments: {},
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

/**
 * 把旧版项目配置迁移到「环境」模型
 * 旧：projects[id] = { name, projectName(SLS ID), logStoreName }
 * 新：projects[id] = { name, envKey, logStoreName, projectName(保留回退) }
 *     environments[envKey] = { name, slsProjectName }
 *
 * 幂等：已是新结构（含 environments 且项目都有 envKey）则原样返回。
 * @param {Object} config
 * @returns {Object} 迁移后的 config，并标记 needsPersist
 */
function migrateConfig(config) {
    if (!config) return config;
    config.environments = config.environments || {};

    const projects = config.projects || {};
    // 按 projectName（SLS ID）聚合，推断环境 key
    const slsIdToEnv = {}; // slsProjectName -> envKey

    for (const id in projects) {
        const p = projects[id];
        if (!p) continue;

        // 已迁移且有 envKey：跳过
        if (p.envKey && config.environments[p.envKey]) continue;

        const slsId = p.projectName;
        if (!slsId) {
            // 缺失 SLS ID，无法归组，标记为未分类
            p.envKey = p.envKey || 'unknown';
            if (!config.environments[p.envKey]) {
                config.environments[p.envKey] = { name: '未分类', slsProjectName: '' };
            }
            continue;
        }

        if (slsIdToEnv[slsId]) {
            p.envKey = slsIdToEnv[slsId];
        } else {
            // 从 logStoreName 前缀（prod-/test-/pre- 等）推断 envKey 和中文名
            const prefix = (p.logStoreName || '').split('-')[0];
            const envKey = /^[a-z]+$/i.test(prefix) ? prefix : `env${Object.keys(slsIdToEnv).length + 1}`;
            const envName = { prod: '生产环境', test: '测试环境', pre: '预发环境', uat: 'UAT 环境', dev: '开发环境' }[envKey] || `${envKey} 环境`;

            config.environments[envKey] = { name: envName, slsProjectName: slsId };
            slsIdToEnv[slsId] = envKey;
            p.envKey = envKey;
        }
    }

    return config;
}

/**
 * 读取配置（含自动迁移旧结构）
 * @returns {Promise<Object>} 配置对象
 */
export async function readConfig() {
    let config;
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        config = JSON.parse(data);
    } catch {
        return defaultConfig();
    }

    // 保证默认字段
    const defaults = defaultConfig();
    config = { ...defaults, ...config };
    config.projects = config.projects || {};
    config.environments = config.environments || {};
    config.aiConfig = { ...defaults.aiConfig, ...(config.aiConfig || {}) };
    config.slsConfig = { ...defaults.slsConfig, ...(config.slsConfig || {}) };

    // 自动迁移：检测是否有项目缺 envKey 但有 projectName
    const needMigrate = Object.values(config.projects).some(
        p => p && p.projectName && (!p.envKey || !config.environments[p.envKey])
    );

    if (needMigrate) {
        migrateConfig(config);
        // 异步落盘，不阻塞读取
        saveConfig(config).catch(e => console.error('[config] 迁移落盘失败:', e.message));
    }

    return config;
}

/**
 * 保存配置
 * @param {Object} config - 配置对象
 */
export async function saveConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
