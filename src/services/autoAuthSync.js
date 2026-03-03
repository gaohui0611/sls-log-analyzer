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

        // 浏览器启动配置
        const launchOptions = {
            headless: false,
            defaultViewport: { width: 1280, height: 800 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled', // 隐藏自动化特征
                '--disable-extensions', // 禁用扩展（包括广告拦截器）
                '--disable-plugins',
                '--disable-web-security', // 禁用web安全检查
                '--disable-features=IsolateOrigins,site-per-process',
                '--allow-running-insecure-content',
                '--no-first-run',
                '--no-default-browser-check'
            ],
            ignoreDefaultArgs: ['--enable-automation'], // 移除自动化标识
        };

        // 在 Windows/Mac 上尝试常见的 Chrome 路径
        if (process.platform === 'win32') {
            const possiblePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
                process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
                process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
            ];

            for (const chromePath of possiblePaths) {
                try {
                    const fs = await import('fs');
                    if (fs.existsSync(chromePath)) {
                        launchOptions.executablePath = chromePath;
                        console.log('找到 Chrome:', chromePath);
                        break;
                    }
                } catch (err) {
                    // 继续尝试下一个路径
                }
            }
        } else if (process.platform === 'darwin') {
            // macOS Chrome 路径
            const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            try {
                const fs = await import('fs');
                if (fs.existsSync(macPath)) {
                    launchOptions.executablePath = macPath;
                    console.log('找到 Chrome:', macPath);
                }
            } catch (err) {
                // 使用默认路径
            }
        }

        // 启动浏览器
        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();

        // 设置User-Agent，模拟真实浏览器
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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
        
        try {
            await page.goto(slsUrl, { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });
        } catch (navError) {
            // 如果导航失败，尝试使用更宽松的等待条件
            console.log('首次导航失败，尝试使用宽松模式...');
            await page.goto(slsUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000 
            });
        }

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

        // 提供更友好的错误信息
        let userMessage = error.message;
        
        if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
            userMessage = '浏览器扩展（如广告拦截器）阻止了页面加载。\n\n解决方案：\n1. 关闭浏览器的广告拦截扩展后重试\n2. 或使用下方的"cURL 手动同步"方式（推荐）';
        } else if (error.message.includes('Could not find') || 
            error.message.includes('Failed to launch') ||
            error.message.includes('chrome')) {
            userMessage = 'Chrome 浏览器未安装或路径配置错误。\n\n解决方案：\n1. 安装 Google Chrome 浏览器\n2. 或使用下方的"cURL 手动同步"方式（推荐）';
        } else if (error.message.includes('timeout')) {
            userMessage = '操作超时，请重试或使用手动同步方式';
        } else if (error.message.includes('Navigation') || error.message.includes('navigate')) {
            userMessage = '页面导航失败，可能是网络问题或浏览器扩展干扰。\n\n解决方案：\n1. 检查网络连接\n2. 关闭浏览器扩展（特别是广告拦截器）\n3. 或使用下方的"cURL 手动同步"方式（推荐）';
        }

        throw new Error(userMessage);
    }
}
