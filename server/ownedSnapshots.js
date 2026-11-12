/**
 * Снимки прогресса игрока — откат после сбоя / ошибочного wipe.
 * Хранятся в users.json → user.ownedSnapshots (до MAX штук).
 */

const MAX_OWNED_SNAPSHOTS = 5;
const AUTO_SNAP_MIN_MS = 6 * 60 * 60 * 1000;

function collectionSize(owned) {
  if (!owned?.collection || typeof owned.collection !== "object") return 0;
  return Object.values(owned.collection).reduce(
    (s, n) => s + (Math.floor(Number(n)) || 0),
    0,
  );
}

/** Есть ли что сохранять (не пустой онбординг). */
export function ownedWorthSnapshot(owned) {
  if (!owned || typeof owned !== "object") return false;
  const level = Math.max(1, Math.floor(Number(owned.level) || 1));
  if (level > 1) return true;
  if (owned.homeFaction) return true;
  if ((owned.purchased?.length ?? 0) > 0) return true;
  if ((owned.unlockedHeroes?.length ?? 0) > 0) return true;
  if (collectionSize(owned) > 0) return true;
  if ((Number(owned.gold) || 0) > 500) return true;
  if ((Number(owned.diamonds) || 0) > 25) return true;
  return false;
}

/**
 * Кладёт снимок в начало истории. Не трогает текущий owned.
 * @returns {boolean} true если снимок записан
 */
export function pushOwnedSnapshot(user, reason = "auto") {
  if (!user || !ownedWorthSnapshot(user.owned)) return false;
  const snap = {
    at: new Date().toISOString(),
    reason: String(reason || "auto").slice(0, 48),
    heroId: user.heroId ?? user.owned?.heroId ?? null,
    displayName: user.displayName ?? null,
    owned: JSON.parse(JSON.stringify(user.owned)),
  };
  const hist = Array.isArray(user.ownedSnapshots) ? user.ownedSnapshots : [];
  // Не плодить идентичные снимки подряд (тот же level+gold+col).
  const head = hist[0];
  if (head?.owned) {
    const same =
      (Number(head.owned.level) || 1) === (Number(snap.owned.level) || 1) &&
      (Number(head.owned.gold) || 0) === (Number(snap.owned.gold) || 0) &&
      (Number(head.owned.diamonds) || 0) === (Number(snap.owned.diamonds) || 0) &&
      collectionSize(head.owned) === collectionSize(snap.owned) &&
      String(head.heroId || "") === String(snap.heroId || "");
    if (same) return false;
  }
  hist.unshift(snap);
  user.ownedSnapshots = hist.slice(0, MAX_OWNED_SNAPSHOTS);
  return true;
}

/** Автоснимок при входе — не чаще раза в AUTO_SNAP_MIN_MS. */
export function maybeAutoSnapshot(user) {
  if (!user || !ownedWorthSnapshot(user.owned)) return false;
  const hist = Array.isArray(user.ownedSnapshots) ? user.ownedSnapshots : [];
  const last = hist[0];
  if (last?.at) {
    const t = Date.parse(last.at);
    if (Number.isFinite(t) && Date.now() - t < AUTO_SNAP_MIN_MS) return false;
  }
  return pushOwnedSnapshot(user, "login");
}

/**
 * Восстановить owned из снимка (0 = самый свежий).
 * @returns {{ ok: true, at: string, reason: string } | { ok: false, error: string }}
 */
export function restoreOwnedFromSnapshot(user, index = 0) {
  const hist = Array.isArray(user.ownedSnapshots) ? user.ownedSnapshots : [];
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const snap = hist[i];
  if (!snap?.owned || typeof snap.owned !== "object") {
    return { ok: false, error: "Нет снимка для отката" };
  }
  // Текущее (даже пустое) сохранить, чтобы можно было откатить откат.
  if (ownedWorthSnapshot(user.owned)) {
    pushOwnedSnapshot(user, "before-restore");
  }
  user.owned = JSON.parse(JSON.stringify(snap.owned));
  user.heroId = snap.heroId ?? user.owned.heroId ?? null;
  user.pendingWipeOwned = false;
  user.pendingResetCampaign = false;
  return {
    ok: true,
    at: snap.at || "",
    reason: snap.reason || "",
    level: user.owned.level ?? 1,
  };
}

export function snapshotMeta(user) {
  const hist = Array.isArray(user?.ownedSnapshots) ? user.ownedSnapshots : [];
  return hist.slice(0, MAX_OWNED_SNAPSHOTS).map((s, i) => ({
    index: i,
    at: s?.at ?? null,
    reason: s?.reason ?? null,
    level: s?.owned?.level ?? null,
    gold: s?.owned?.gold ?? null,
    diamonds: s?.owned?.diamonds ?? null,
    col: collectionSize(s?.owned),
    homeFaction: s?.owned?.homeFaction ?? null,
  }));
}
