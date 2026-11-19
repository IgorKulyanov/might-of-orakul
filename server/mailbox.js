import crypto from "node:crypto";

const MAX_MAIL = 40;
const MAX_SUBJECT = 80;
const MAX_BODY = 1200;

/**
 * @typedef {{
 *   id: string,
 *   at: string,
 *   from: string,
 *   subject: string,
 *   body: string,
 *   gold: number,
 *   diamonds: number,
 *   read: boolean,
 *   claimed: boolean,
 * }} MailItem
 */

/** @param {unknown} raw */
export function normalizeMailbox(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").slice(0, 64);
    if (!id) continue;
    out.push({
      id,
      at: String(row.at || new Date().toISOString()).slice(0, 40),
      from: String(row.from || "Оракул").slice(0, 40),
      subject: String(row.subject || "Письмо").slice(0, MAX_SUBJECT),
      body: String(row.body || "").slice(0, MAX_BODY),
      gold: Math.max(0, Math.min(500_000, Math.floor(Number(row.gold) || 0))),
      diamonds: Math.max(
        0,
        Math.min(50_000, Math.floor(Number(row.diamonds) || 0)),
      ),
      read: Boolean(row.read),
      claimed: Boolean(row.claimed),
    });
    if (out.length >= MAX_MAIL) break;
  }
  return out;
}

/** @param {MailItem} m */
export function mailNeedsAttention(m) {
  if (!m.read) return true;
  if ((m.gold > 0 || m.diamonds > 0) && !m.claimed) return true;
  return false;
}

/** @param {import('./index.js').User | { mailbox?: unknown }} user */
export function ensureMailbox(user) {
  user.mailbox = normalizeMailbox(user.mailbox);
  return user.mailbox;
}

/**
 * @param {object} user
 * @param {{ subject: string, body?: string, gold?: number, diamonds?: number, from?: string }} opts
 */
export function pushMail(user, opts) {
  const box = ensureMailbox(user);
  const gold = Math.max(0, Math.min(500_000, Math.floor(Number(opts.gold) || 0)));
  const diamonds = Math.max(
    0,
    Math.min(50_000, Math.floor(Number(opts.diamonds) || 0)),
  );
  const subject = String(opts.subject || "Письмо")
    .trim()
    .slice(0, MAX_SUBJECT);
  const body = String(opts.body || "")
    .trim()
    .slice(0, MAX_BODY);
  if (!subject && !body && gold <= 0 && diamonds <= 0) {
    return null;
  }
  /** @type {MailItem} */
  const item = {
    id: `m_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
    at: new Date().toISOString(),
    from: String(opts.from || "Оракул").slice(0, 40),
    subject: subject || "Письмо от Оракула",
    body,
    gold,
    diamonds,
    read: false,
    claimed: gold <= 0 && diamonds <= 0,
  };
  box.unshift(item);
  while (box.length > MAX_MAIL) box.pop();
  user.mailbox = box;
  return item;
}

/** @param {object} user */
export function countAttentionMail(user) {
  return ensureMailbox(user).filter(mailNeedsAttention).length;
}

/**
 * @param {object} user
 * @param {string} mailId
 */
export function markMailRead(user, mailId) {
  const box = ensureMailbox(user);
  const id = String(mailId || "");
  const item = box.find((m) => m.id === id);
  if (!item) return null;
  item.read = true;
  user.mailbox = box;
  return item;
}

/**
 * @param {object} user
 * @param {string} mailId
 * @returns {{ item: MailItem, gold: number, diamonds: number } | null}
 */
export function claimMailRewards(user, mailId) {
  const box = ensureMailbox(user);
  const id = String(mailId || "");
  const item = box.find((m) => m.id === id);
  if (!item) return null;
  item.read = true;
  if (item.claimed || (item.gold <= 0 && item.diamonds <= 0)) {
    item.claimed = true;
    user.mailbox = box;
    return { item, gold: 0, diamonds: 0 };
  }
  const gold = item.gold;
  const diamonds = item.diamonds;
  item.claimed = true;
  item.gold = 0;
  item.diamonds = 0;
  user.mailbox = box;
  return { item, gold, diamonds };
}

/** Публичный список для клиента (без лишнего). */
export function publicMailbox(user) {
  return ensureMailbox(user).map((m) => ({
    id: m.id,
    at: m.at,
    from: m.from,
    subject: m.subject,
    body: m.body,
    gold: m.claimed ? 0 : m.gold,
    diamonds: m.claimed ? 0 : m.diamonds,
    read: m.read,
    claimed: m.claimed,
    needsAttention: mailNeedsAttention(m),
  }));
}
