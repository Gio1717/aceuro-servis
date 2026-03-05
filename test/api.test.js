const assert = require('assert');
const http = require('http');
const app = require('../server');
const db = require('../database');

let server;
const PORT = 3999;
const BASE = `http://localhost:${PORT}/api`;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const r = http.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function runTests() {
  let passed = 0, failed = 0;

  function test(name, fn) {
    return fn().then(() => {
      console.log(`  PASS: ${name}`);
      passed++;
    }).catch(e => {
      console.log(`  FAIL: ${name} — ${e.message}`);
      failed++;
    });
  }

  console.log('\n=== Progresklima API Tests ===\n');

  // Health check
  await test('GET /api/health returns ok', async () => {
    const r = await req('GET', '/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'ok');
  });

  // CRUD Objednavky
  const objId = 'test-obj-' + Date.now();
  await test('POST /api/objednavky creates new order', async () => {
    const r = await req('POST', '/objednavky', {
      id: objId, cislo: 'OBJ-TEST-001', zakaznik: 'Test s.r.o.',
      castka: 10000, stav: 'nová', createdAt: new Date().toISOString(),
      polozky: [{ nazev: 'Test item', mnozstvi: 2, cena: 5000 }]
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.cislo, 'OBJ-TEST-001');
  });

  await test('GET /api/objednavky returns list with test order', async () => {
    const r = await req('GET', '/objednavky');
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body));
    assert(r.body.some(o => o.id === objId));
  });

  await test('GET /api/objednavky/:id returns specific order', async () => {
    const r = await req('GET', '/objednavky/' + objId);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.zakaznik, 'Test s.r.o.');
  });

  await test('PUT /api/objednavky/:id updates order', async () => {
    const r = await req('PUT', '/objednavky/' + objId, { stav: 'potvrzená' });
    assert.strictEqual(r.status, 200);
  });

  await test('DELETE /api/objednavky/:id removes order', async () => {
    const r = await req('DELETE', '/objednavky/' + objId);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
  });

  // CRUD Faktury
  const fakId = 'test-fak-' + Date.now();
  await test('POST /api/faktury creates new invoice', async () => {
    const r = await req('POST', '/faktury', {
      id: fakId, cislo: 'FAK-TEST-001', zakaznik: 'Firma a.s.',
      castkaBezDph: 10000, dphSazba: 21, castka: 12100,
      stav: 'vystavená', createdAt: new Date().toISOString(),
      splatnost: new Date(Date.now() + 14 * 86400000).toISOString(),
      polozky: [{ nazev: 'Služba', mnozstvi: 1, cena: 10000 }]
    });
    assert.strictEqual(r.status, 201);
  });

  await test('DELETE /api/faktury/:id removes invoice', async () => {
    const r = await req('DELETE', '/faktury/' + fakId);
    assert.strictEqual(r.status, 200);
  });

  // Search
  await test('GET /api/search returns results', async () => {
    const r = await req('GET', '/search?q=test');
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body));
  });

  // Next number
  await test('GET /api/next-number/TEST returns sequential number', async () => {
    const r1 = await req('GET', '/next-number/TEST');
    assert.strictEqual(r1.status, 200);
    assert(r1.body.cislo.startsWith('TEST-'));
    const r2 = await req('GET', '/next-number/TEST');
    assert.notStrictEqual(r1.body.cislo, r2.body.cislo);
  });

  // Dashboard
  await test('GET /api/dashboard returns stats', async () => {
    const r = await req('GET', '/dashboard');
    assert.strictEqual(r.status, 200);
    assert(typeof r.body.objNove === 'number');
    assert(typeof r.body.fakCelkem === 'number');
    assert(Array.isArray(r.body.monthlyRevenue));
  });

  // Audit log
  await test('GET /api/audit-log returns entries', async () => {
    const r = await req('GET', '/audit-log');
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body));
  });

  // Notifications
  await test('GET /api/notifications returns list', async () => {
    const r = await req('GET', '/notifications');
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body));
  });

  await test('PUT /api/notifications/read-all works', async () => {
    const r = await req('PUT', '/notifications/read-all');
    assert.strictEqual(r.status, 200);
  });

  // Backup
  await test('GET /api/backup/json returns export data', async () => {
    const r = await req('GET', '/backup/json');
    assert.strictEqual(r.status, 200);
    assert(r.body.exportedAt);
    assert(Array.isArray(r.body.objednavky));
  });

  // 404
  await test('GET /api/objednavky/nonexistent returns 404', async () => {
    const r = await req('GET', '/objednavky/nonexistent');
    assert.strictEqual(r.status, 404);
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  return failed;
}

// Run
db.init();
server = app.listen(PORT, async () => {
  try {
    const failures = await runTests();
    server.close();
    process.exit(failures > 0 ? 1 : 0);
  } catch (e) {
    console.error('Test error:', e);
    server.close();
    process.exit(1);
  }
});
