const http = require('http');
const { createApp } = require('../app');
const { close } = require('../config/db');

let failures = 0;
let server;
let base;

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(base + path, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      base + path,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

(async () => {
  console.log('BIOSYM smoke tests\n');

  await new Promise((resolve, reject) => {
    server = createApp().listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.on('error', reject);
  });

  await check('GET /health returns ok', async () => {
    const r = await get('/health');
    if (r.status !== 200) throw new Error('status ' + r.status);
  });

  await check('GET / renders home page', async () => {
    const r = await get('/');
    if (r.status !== 200 || !r.body.includes('BIOSYM')) throw new Error('home broken');
  });

  await check('GET /shop renders catalog', async () => {
    const r = await get('/shop');
    if (r.status !== 200 || !r.body.includes('products')) throw new Error('shop broken');
  });

  await check('GET /login renders auth page', async () => {
    const r = await get('/login');
    if (r.status !== 200 || !r.body.includes('Welcome Back')) throw new Error('login broken');
  });

  await check('API /api/products returns data', async () => {
    const r = await get('/api/products');
    const d = JSON.parse(r.body);
    if (!d.ok || !d.products.length) throw new Error('products empty');
  });

  await check('API /api/categories returns data', async () => {
    const r = await get('/api/categories');
    const d = JSON.parse(r.body);
    if (!d.ok || d.categories.length < 8) throw new Error('categories missing');
  });

  await check('API product detail resolves', async () => {
    const r = await get('/api/products/paracetamol-650mg');
    const d = JSON.parse(r.body);
    if (!d.ok || !d.product) throw new Error('product not found');
  });

  await check('Generated SVG images serve', async () => {
    const r = await get('/img/product/210.svg');
    if (r.status !== 200 || !r.body.startsWith('<svg')) throw new Error('svg broken');
  });

  await check('Password login rejects wrong creds (ACCOUNT_NOT_FOUND)', async () => {
    const r = await post('/api/auth/login', { identifier: 'nobody@example.com', password: 'Wrong@123' });
    const d = JSON.parse(r.body);
    if (d.code !== 'ACCOUNT_NOT_FOUND') throw new Error('expected ACCOUNT_NOT_FOUND');
  });

  await check('Admin login succeeds', async () => {
    const r = await post('/api/auth/login', { identifier: 'admin@biosym.pharma', password: 'Admin@123' });
    const d = JSON.parse(r.body);
    if (!d.ok || d.user.role !== 'admin') throw new Error('admin login failed');
  });

  await check('Weak password rejected on register', async () => {
    const r = await post('/api/auth/register', {
      fullName: 'Test User', email: 'test@example.com', mobile: '9876543210', password: 'short',
    });
    const d = JSON.parse(r.body);
    if (d.code !== 'WEAK_PASSWORD') throw new Error('expected WEAK_PASSWORD');
  });

  server.close();
  close();

  console.log(failures === 0 ? '\nAll checks passed ✔' : `\n${failures} check(s) failed ✗`);
  process.exit(failures === 0 ? 0 : 1);
})();
