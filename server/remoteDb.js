/**
 * Зеркало users.json во внешний Redis (Render Key Value / REDIS_URL).
 * Без него бесплатный Render при sleep обнуляет диск — аккаунты пропадают.
 */
import { createClient } from "redis";

const REMOTE_KEY = "orakul:users-v1";

let clientPromise = null;

function redisUrl() {
  return (
    process.env.REDIS_URL ||
    process.env.ORACUL_REDIS_URL ||
    process.env.KV_URL ||
    ""
  ).trim();
}

async function getClient() {
  const url = redisUrl();
  if (!url) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = createClient({ url });
      client.on("error", (err) => {
        console.warn("[orakul] redis:", err.message);
      });
      await client.connect();
      console.log("[orakul] Redis зеркало подключено");
      return client;
    })().catch((e) => {
      console.warn("[orakul] Redis недоступен:", e.message);
      clientPromise = null;
      return null;
    });
  }
  return clientPromise;
}

export function hasRemoteDb() {
  return Boolean(redisUrl());
}

/** Тянем базу с Redis. null = нет зеркала / пусто / ошибка. */
export async function pullRemoteUsers() {
  try {
    const client = await getClient();
    if (!client) return null;
    const raw = await client.get(REMOTE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.users)) return null;
    return data;
  } catch (e) {
    console.warn("[orakul] pullRemoteUsers:", e.message);
    return null;
  }
}

/** Пишем зеркало. Ошибки не роняют API. */
export async function pushRemoteUsers(db) {
  try {
    if (!db || !Array.isArray(db.users)) return;
    const client = await getClient();
    if (!client) return;
    await client.set(REMOTE_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn("[orakul] pushRemoteUsers:", e.message);
  }
}
