// Refuse accidental test writes against production. Never infer safety from a
// tenant's name. CI must provision a disposable local database named *test*.
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname) || !url.pathname.includes('test')) {
    throw new Error('Tests require a disposable loopback PostgreSQL database with test in its name');
  }
}
