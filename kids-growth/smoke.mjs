import { chromium } from 'playwright';
const SCR = '/tmp/claude-0/-home-user-production-project/b5567c30-50ca-5d8b-b75c-8e13f3b8aa3a/scratchpad';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:8899');
await page.waitForSelector('text=欢迎使用小朋友成长系统', { timeout: 15000 });
await page.fill('input[placeholder="例如：朵朵"]', '朵朵');
const d = new Date(); d.setFullYear(d.getFullYear() - 5);
await page.fill('input[type="date"]', d.toISOString().slice(0, 10));
await page.click('form button[type="submit"]');
await page.waitForSelector('text=你好，朵朵！');
console.log('single-file: onboarding + IndexedDB write ✓');

// hash routing into parent mode
await page.click('button:has-text("家长模式")');
for (const digit of ['1','2','3','4']) await page.click(`button:has-text("${digit}")`);
await page.waitForSelector('text=家长中心');
console.log('hash routing URL:', page.url());

// import tasks, then reload to prove persistence
await page.click('button:has-text("任务与积分管理")');
await page.waitForSelector('text=任务与积分管理');
await page.click('button:has-text("一键导入默认任务")');
await page.waitForSelector('text=已导入');
await page.reload();
await page.waitForSelector('text=你好，朵朵！', { timeout: 15000 });
await page.waitForSelector('text=今日任务');
const taskCount = await page.locator('text=自己吃饭').count();
console.log('after reload: child + tasks persisted =', taskCount > 0 ? '✓' : '✗');
await page.screenshot({ path: `${SCR}/artifact-test.png` });

console.log('ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();
