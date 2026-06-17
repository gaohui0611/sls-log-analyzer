import puppeteer from 'puppeteer';

async function getAuth() {
    try {
        const browser = await puppeteer.connect({
            browserURL: 'http://localhost:9222',
            defaultViewport: null
        });

        const pages = await browser.pages();
        console.log(`Found ${pages.length} pages`);

        let slsPage = null;
        for (const page of pages) {
            const url = await page.url();
            console.log(`Page: ${url}`);
            if (url.includes('sls.console.aliyun.com')) {
                slsPage = page;
                break;
            }
        }

        if (!slsPage) {
            console.log('SLS console page not found');
            slsPage = await browser.newPage();
            await slsPage.goto('https://sls.console.aliyun.com');
            await slsPage.waitForTimeout(3000);
        }

        const client = await slsPage.target().createCDPSession();
        const { cookies } = await client.send('Network.getAllCookies');
        
        console.log(`Total cookies: ${cookies.length}`);
        
        const aliyunCookies = cookies.filter(c => c.domain.includes('aliyun.com'));
        console.log(`Aliyun cookies: ${aliyunCookies.length}`);
        
        const loginCookies = aliyunCookies.filter(c => 
            c.name.includes('login') || c.name.includes('token')
        );
        
        console.log('\nLogin cookies:');
        loginCookies.forEach(c => {
            console.log(`  ${c.name}: ${c.value.substring(0, 50)}`);
        });

        await browser.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
    }
}

getAuth();
