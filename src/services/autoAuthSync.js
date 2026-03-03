/**
 * 自动同步认证信息服务
 * 使用 Puppeteer 自动提取浏览器认证信息
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const CONFIG_FILE = path.join(process.cwd(), 'config.json');

/**
 * 读取配置
 */
async function readConfig() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { projects: {}, aiConfig: {}, slsConfig: { region: 'cn-beijing' } };
    }
}

/**
 * 保存配置
 */
async function saveConfig(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 从浏览器提取认证信息
 */
async function extractAuthInfo(region = 'cn-beijing') {
    let browser;
    const slsUrl = 'https://sls.console.aliyun.com';

    try {
        console.log('启动浏览器...');

        // 启动非无头浏览器，用户可以看到登录过程
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1280, height: 800 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });

        const page = await browser.newPage();

        // 存储认证信息
        const authData = {
            cookies: {},
            csrfToken: null,
            b3: null,
            region
        };

        // 拦截请求获取 headers
        page.on('request', (request) => {
            const headers = request.headers();

            // 获取 CSRF token
            if (headers['x-csrf-token'] && !authData.csrfToken) {
                authData.csrfToken = headers['x-csrf-token'];
                console.log('✓ 获取到 CSRF Token');
            }

            // 获取 b3 header
            if (headers['b3'] && !authData.b3) {
                authData.b3 = headers['b3'];
                console.log('✓ 获取到 b3 header');
            }
        });

        // 拦截响应来获取 headers
        page.on('response', async (response) => {
            const headers = response.headers();

            // 从响应头获取 CSRF token
            if (headers['x-csrf-token'] && !authData.csrfToken) {
                authData.csrfToken = headers['x-csrf-token'];
                console.log('✓ 从响应获取到 CSRF Token');
            }
        });

        console.log('导航到 SLS 控制台...');
        await page.goto(slsUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        console.log('');
        console.log('========================================');
        console.log('请在浏览器窗口中完成阿里云登录');
        console.log('系统会自动检测登录状态...');
        console.log('========================================');
        console.log('');

        // 等待用户登录，最多等待 180 秒（3 分钟）
        const maxWaitTime = 180000;
        const checkInterval = 3000;
        let elapsedTime = 0;
        let loginSuccess = false;

        while (elapsedTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            elapsedTime += checkInterval;

            const cookies = await page.cookies();

            const hasSessionCookies = cookies.some(c =>
                c.name.includes('session') ||
                c.name.includes('token') ||
                c.name.includes('AliyunAuth') ||
                c.name.includes('_tb_token_') ||
                c.name.includes('aliyun')
            );

            const currentUrl = page.url();
            const isLoggedIn = currentUrl.includes('sls.console.aliyun.com') &&
                              !currentUrl.includes('login') &&
                              !currentUrl.includes('signin') &&
                              !currentUrl.includes('passport');

            try {
                const hasProjectContent = await page.evaluate(() => {
                    const body = document.body.innerText;
                    return body.includes('日志服务') ||
                           body.includes('Log Service') ||
                           body.includes('项目列表') ||
                           body.includes('Project');
                });

                if (isLoggedIn && hasSessionCookies && hasProjectContent) {
                    loginSuccess = true;
                    console.log('');
                    console.log('========================================');
                    console.log('✓ 检测到登录成功！');
                    console.log('========================================');
                    console.log('');
                    break;
                }
            } catch (err) {
                // 忽略检查错误
            }

            if (elapsedTime % 15000 === 0) {
                console.log(`等待中... (${elapsedTime / 1000}s / ${maxWaitTime / 1000}s)`);
            }
        }

        // 提取所有 cookies
        console.log('提取认证信息...');
        const cookies = await page.cookies();

        if (cookies.length === 0) {
            throw new Error('未找到任何 cookies，请确保已完成登录');
        }

        cookies.forEach(cookie => {
            authData.cookies[cookie.name] = cookie.value;
        });

        console.log('✓ 提取到', Object.keys(authData.cookies).length, '个 cookies');

        const hasValidData = Object.keys(authData.cookies).length > 0;

        if (!hasValidData) {
            throw new Error('未能提取到认证信息');
        }

        console.log('');
        console.log('========================================');
        console.log('认证信息提取成功！');
        console.log('========================================');
        console.log('Cookies 数量:', Object.keys(authData.cookies).length);
        console.log('CSRF Token:', authData.csrfToken ? authData.csrfToken : '无');
        console.log('B3:', authData.b3 ? authData.b3 : '无');
        console.log('');

        return authData;

    } finally {
        if (browser) {
            console.log('关闭浏览器...');
            await browser.close();
        }
    }
}

/**
 * 一键同步认证信息
 */
export async function autoSyncAuth(region = 'cn-beijing') {
    try {
        console.log('');
        console.log('========================================');
        console.log('开始自动同步认证信息');
        console.log('========================================');
        console.log('');

        const authData = await extractAuthInfo(region);

        const config = await readConfig();

        config.slsConfig = {
            ...config.slsConfig,
            cookies: { ...authData.cookies, timestamp: Date.now() },
            csrfToken: authData.csrfToken || config.slsConfig?.csrfToken,
            b3: authData.b3 || config.slsConfig?.b3,
            region: authData.region
        };

        await saveConfig(config);

        console.log('✓ 认证信息已保存到配置文件');
        console.log('');

        return {
            success: true,
            message: '认证信息自动同步成功',
            cookies: Object.keys(authData.cookies).length,
            hasCsrf: !!authData.csrfToken,
            hasB3: !!authData.b3
        };

    } catch (error) {
        console.error('');
        console.error('========================================');
        console.error('自动同步失败:', error.message);
        console.error('========================================');
        console.error('');
        throw error;
    }
}
