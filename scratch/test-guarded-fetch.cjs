const activeInFlightRequests = new Map();

async function guardedFetch(url) {
  const method = 'GET';
  const key = method + ':' + url;

  if (activeInFlightRequests.has(key)) {
    return activeInFlightRequests.get(key).then(res => res.clone());
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(url);
      return res.clone();
    } finally {
      activeInFlightRequests.delete(key);
    }
  })();

  activeInFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

async function load(id) {
  try {
    console.log(`[${id}] Loading...`);
    const res = await guardedFetch('http://localhost:8787/api/health');
    console.log(`[${id}] Got response, reading json...`);
    const data = await res.json();
    console.log(`[${id}] Data read success.`);
  } catch (err) {
    console.error(`[${id}] Error in load:`, err.message);
  }
}

load(1);
load(2);
