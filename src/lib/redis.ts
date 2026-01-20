import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

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
