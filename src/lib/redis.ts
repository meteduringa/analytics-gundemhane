import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

const normalizeQuotedEnv = (key: string) => {
  const value = process.env[key];
  if (!value) return;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    process.env[key] = value.slice(1, -1);
  }
};

normalizeQuotedEnv("REDIS_URL");

const globalForRedis = globalThis as unknown as {
  redisClient?: RedisClient;
  redisReady?: Promise<RedisClient>;
};

export async function getRedis() {
  if (!globalForRedis.redisReady) {
    const client = createClient({
      url: process.env.REDIS_URL,
    });

    globalForRedis.redisReady = client.connect().then(() => client);
    globalForRedis.redisClient = client;
  }

  return globalForRedis.redisReady;
}
