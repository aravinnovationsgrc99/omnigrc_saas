import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';

// Basic .env parser
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.error('Could not read .env file:', err);
  }
}

loadEnv();

async function testRedis() {
  console.log('=== REDIS CONNECTION VERIFICATION ===');
  const rawUrl = process.env.REDIS_URL;
  console.log('Raw REDIS_URL from .env:', rawUrl);

  if (!rawUrl) {
    console.error('REDIS_URL is not set in .env');
    return;
  }

  // Check if rawUrl has redis-cli prefix
  let cleanUrl = rawUrl.trim();
  if (cleanUrl.startsWith('redis-cli')) {
    console.log('\n[!] Detected "redis-cli" command string in REDIS_URL environment variable.');
    const match = cleanUrl.match(/redis:\/\/[^\s"]+/);
    if (match) {
      cleanUrl = match[0];
      console.log('Extracted underlying URL:', cleanUrl);
    }
  }

  // Upstash over TLS can use rediss:// or redis:// with tls options
  let targetUrl = cleanUrl;
  if (targetUrl.startsWith('redis://') && (rawUrl.includes('--tls') || targetUrl.includes('upstash.io'))) {
    targetUrl = targetUrl.replace('redis://', 'rediss://');
    console.log('Converted to rediss:// for TLS connection:', targetUrl.replace(/:[^:@]+@/, ':****@'));
  }

  console.log('\n--- Test 1: Trying raw REDIS_URL string ---');
  try {
    const redisRaw = new Redis(rawUrl, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    
    redisRaw.on('error', (err) => console.log('Raw connection error event:', err.message));
    
    const pingRes = await Promise.race([
      redisRaw.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 5s')), 5000))
    ]);
    console.log('Raw Connection PING Success:', pingRes);
    await redisRaw.quit();
  } catch (err: any) {
    console.error('Raw Connection Failed:', err.message);
  }

  console.log('\n--- Test 2: Trying cleaned TLS URL ---');
  try {
    const redisClean = new Redis(targetUrl, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      tls: {
        rejectUnauthorized: false
      }
    });

    redisClean.on('error', (err) => console.log('Clean connection error event:', err.message));

    const pingRes = await Promise.race([
      redisClean.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 5s')), 5000))
    ]);
    console.log('Clean Connection PING Success! Server responded:', pingRes);
    
    // Set and Get test key
    const testKey = 'omnigrc:test:' + Date.now();
    await redisClean.set(testKey, 'verification-passed', 'EX', 60);
    const val = await redisClean.get(testKey);
    console.log('SET/GET test successful. Key:', testKey, 'Value:', val);
    
    await redisClean.quit();
    console.log('\nVERIFICATION RESULT: Redis database is reachable and operational with cleaned URL!');
  } catch (err: any) {
    console.error('Clean Connection Failed:', err.message);
  }
}

testRedis().catch(console.error);
