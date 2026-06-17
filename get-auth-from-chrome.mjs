import puppeteer from 'puppeteer';

async function getAuthFromChrome() {
    try {
        // Launch Chrome with user's profile
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--user-data-dir=/Users/gh/Library/Application Support/Google/Chrome'
            ]
        });

        const page = await browser.newPage();
        
        // Navigate to SLS console
        await page.goto('https://sls.console.aliyun.com', { 
            waitUntil: 'networkidle2',
            timeout: 60000 
        });

        // Wait a bit for JavaScript to load
        await page.waitForTimeout(3000);

        // Check if we're logged in
        const url = page.url();
        console.log('Current URL:', url);

        if (url.includes('login')) {
            console.log('Not logged in');
            await browser.close();
            return;
        }

        // Get cookies
        const cookies = await page.cookies();
        console.log(`Found ${cookies.length} cookies`);

        const aliyunCookies = cookies.filter(c => c.domain.includes('aliyun.com'));
        console.log(`Aliyun cookies: ${aliyunCookies.length}`);

        // Look for CSRF token and b3
        const authInfo = {
            cookies: {},
            csrfToken: null,
            b3: null
        };

        aliyunCookies.forEach(c => {
            authInfo.cookies[c.name] = c.value;
        });

        // Try to get CSRF token from page
        const csrfToken = await page.evaluate(() => {
            return window.csrf_token || 
                   document.querySelector('meta[name=csrf-token]')?.content || 
                   null;
        });

        console.log('CSRF Token:', csrfToken);

        // Try to get b3 from page
        const b3 = await page.evaluate(() => {
            return window.b3 || null;
        });

        console.log('B3:', b3);

        // Save auth info
        const fs = await import('fs');
        fs.writeFileSync('/tmp/chrome_auth.json', JSON.stringify(authInfo, null, 2));
        console.log('Auth saved to /tmp/chrome_auth.json');

        await browser.close();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

getAuthFromChrome();
