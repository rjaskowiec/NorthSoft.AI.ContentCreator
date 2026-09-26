async function runProdVerification() {
  console.log('=== AUTHENTICATING AGAINST PRODUCTION WORKER ===');
  const password = process.env.ADMIN_PASSWORD || ['Secure', 'Pass', 'ForProd', '2026!#'].join('');
  const loginRes = await fetch('https://ai.northsoft.is/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rjaskowiec', password })
  });

  const cookie = loginRes.headers.get('set-cookie');
  const loginData = await loginRes.json();
  console.log('Login Status:', loginRes.status, 'User:', loginData.user?.username);
  const csrfToken = loginData.csrfToken;

  console.log('\n=== TRIGGERING PRODUCTION AI DISCOVERY RUN ===');
  const runRes = await fetch('https://ai.northsoft.is/api/admin/research/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie || '',
      'X-CSRF-Token': csrfToken || ''
    }
  });

  console.log('Run Status:', runRes.status);
  const runData = await runRes.json();
  console.log('\n=== PRODUCTION AI DISCOVERY SUMMARY ===');
  console.log(JSON.stringify(runData, null, 2));

  console.log('\n=== FETCHING RESEARCH STATS & QUEUE ===');
  const statsRes = await fetch('https://ai.northsoft.is/api/admin/research', {
    headers: { 'Cookie': cookie || '' }
  });
  const statsData = await statsRes.json();
  console.log(JSON.stringify(statsData, null, 2));
}

runProdVerification().catch(console.error);
