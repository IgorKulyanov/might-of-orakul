/**
 * Умения оракула: пул школы → покупка очками (без рангов) → в бой до 4.
 * Активки — 1× за бой. Эпик чуть усиливает числа.
 */
import type {
  BattleState,
  CreatureInstance,
  Faction,
  HeroTier,
  OwnedState,
  PlayerState,
} from "./types";
import { getCard } from "./cards";
import { isEpicGift } from "./oracleGifts";

/** Невосприимчив к заклинаниям — умения оракула тоже не трогают. */
export function unitImmuneToOracleSkills(u: CreatureInstance): boolean {
  if (u.stripped) return false;
  try {
    const c = getCard(u.cardId);
    return c.ability === "immune_spells" || (c.abilities ?? []).includes("immune_spells");
  } catch {
    return false;
  }
}

/** Очков за каждый новый уровень аккаунта. */
export const SKILL_POINTS_PER_LEVEL = 1;
/** Цена открытия умения (без рангов). */
export const SKILL_UNLOCK_COST = 5;
/** Сброс одного умения. */
export const SKILL_RESET_DIAMONDS = 100;
/** Слотов в бой. */
export const SKILL_LOADOUT_SIZE = 4;

/** Порядок открытия в пуле: индекс умения → мин. уровень аккаунта. */
export const SKILL_POOL_UNLOCK_LEVELS = [
  1, 1, 1, 10, 10, 15, 15, 20, 20, 25, 25, 30,
] as const;

export type SkillKind = "active" | "passive";
export type SkillIconId =
  | "mana"
  | "strike"
  | "heal"
  | "burn"
  | "sleep"
  | "buff"
  | "shield"
  | "sacrifice"
  | "harvest"
  | "armor"
  | "card"
  | "sprout"
  | "bounce"
  | "shift"
  | "poison"
  | "generic";

export type SkillTarget =
  | "none"
  | "enemy_unit"
  | "enemy_unit_or_hero"
  | "ally_unit"
  | "ally_unit_or_hero"
  | "ally_unit_sacrifice"
  | "empty_ally_slot";

export type OracleSkillDef = {
  id: string;
  faction: Faction;
  name: string;
  kind: SkillKind;
  /** Коротко, без пафоса. */
  text: string;
  icon: SkillIconId;
  target: SkillTarget;
  /** Мана своей школы (только активки). */
  manaCost?: number;
};

function L(
  faction: Faction,
  id: string,
  name: string,
  kind: SkillKind,
  text: string,
  icon: SkillIconId,
  target: SkillTarget = "none",
  manaCost?: number,
): OracleSkillDef {
  return {
    id: `${faction}_${id}`,
    faction,
    name,
    kind,
    text,
    icon,
    target,
    manaCost: kind === "active" ? (manaCost ?? 2) : undefined,
  };
}

/** 12 умений на школу, порядок = порядок открытия по уровню. */
export const SKILLS_BY_FACTION: Record<Faction, OracleSkillDef[]> = {
  life: [
    L("life", "school_mana", "Мана школы каждый ход", "passive", "В начале хода +1 маны жизни.", "mana"),
    L("life", "mana_heal_self", "Лечение маной", "active", "2 маны жизни: оракул +5 HP.", "heal", "none", 2),
    L("life", "mana_heal_unit", "Хил юниту", "active", "2 маны жизни: своему юниту +6 HP.", "heal", "ally_unit", 2),
    L("life", "heal_all", "Хил отряду", "active", "2 маны жизни: всем своим юнитам +3 HP.", "heal", "none", 2),
    L("life", "cleanse", "Снять вред", "active", "2 маны жизни: снять яд/ожог с себя или юнита.", "heal", "ally_unit_or_hero", 2),
    L("life", "shield", "Щит юниту", "active", "2 маны жизни: юнит получает щит на 1 удар.", "shield", "ally_unit", 2),
    L("life", "second_chance", "Второй шанс", "passive", "1× за бой: смертельный удар оставляет 1 HP.", "armor"),
    L("life", "quiet_heal", "Тихий хил", "passive", "Каждый 2-й твой ход: оракул +1 HP.", "heal"),
    L("life", "aura_heal", "Аура", "passive", "Если своих юнитов ≥2 — в конце хода оракул +1 HP.", "heal"),
    L("life", "tough", "Жёсткость", "passive", "Первый урон по оракулу за бой −1.", "armor"),
    L("life", "extra_card", "Лишняя карта", "passive", "В начале боя +1 карта в руку.", "card"),
    L("life", "mana_drip", "Запас маны", "passive", "Каждый 3-й твой ход: +1 мана жизни.", "mana"),
  ],
  death: [
    L("death", "school_mana", "Мана школы каждый ход", "passive", "В начале хода +1 маны смерти.", "mana"),
    L("death", "harvest", "Жатва", "passive", "Любой труп на поле → оракул +1 HP.", "harvest"),
    L("death", "mana_strike", "Удар маной", "active", "2 маны смерти: 4 урона оракулу или юниту врага.", "strike", "enemy_unit_or_hero", 2),
    L("death", "sacrifice", "Жертва", "active", "Убить своего юнита → забрать его текущие HP себе.", "sacrifice", "ally_unit_sacrifice", 0),
    L("death", "execute", "Добивание", "active", "2 маны смерти: снять врага с HP ≤ 4.", "strike", "enemy_unit", 2),
    L("death", "corpse_drain", "Высос из трупа", "active", "Съесть труп из могилы: +4 HP и +1 мана смерти.", "harvest", "none", 0),
    L("death", "plague", "Чума", "active", "2 маны смерти: яд 2 на вражеского юнита.", "poison", "enemy_unit", 2),
    L("death", "death_mana", "Смерть → мана", "passive", "Когда твой юнит умер: +1 мана смерти (без лимита).", "mana"),
    L("death", "scythe", "Коса", "passive", "Убил вражеского юнита → враг-оракул −1 HP.", "strike"),
    L("death", "blood_start", "Кровавый старт", "passive", "Старт боя: −2 HP себе, +2 маны смерти.", "sacrifice"),
    L("death", "undead_near", "Нежить рядом", "passive", "Пока есть свой юнит смерти — в конце хода +1 HP.", "harvest"),
    L("death", "last_breath", "Последний вздох", "passive", "1×: смертельный удар → 1 HP, только если в могиле есть труп.", "armor"),
  ],
  hell: [
    L("hell", "school_mana", "Мана школы каждый ход", "passive", "В начале хода +1 маны ада.", "mana"),
    L("hell", "burn_hero", "Поджог врага", "active", "2 маны ада: враг-оракул горит −2 HP/ход, 2 хода.", "burn", "none", 2),
    L("hell", "burn_unit", "Поджог юнита", "active", "2 маны ада: юнит горит −1 HP/ход, 3 хода.", "burn", "enemy_unit", 2),
    L("hell", "fire_strike", "Удар огнём", "active", "2 маны ада: 4 урона врагу-оракулу.", "strike", "none", 2),
    L("hell", "line_burn", "Поджог линии", "active", "2 маны ада: все враги на поле горят −1 HP/ход (новые не трогает).", "burn", "none", 2),
    L("hell", "kill_spark", "Жар от трупа", "passive", "Убил юнита → враг-оракул −1 HP.", "burn"),
    L("hell", "smolder", "Тление", "passive", "Каждый 3-й твой ход: враг-оракул −1 HP.", "burn"),
    L("hell", "spark_start", "Искра в старте", "passive", "Старт боя: +1 мана ада.", "mana"),
    L("hell", "deal", "Сделка", "passive", "Старт боя: −2 HP себе, +2 маны ада.", "sacrifice"),
    L("hell", "tough", "Жёсткость", "passive", "Первый урон по оракулу за бой −1.", "armor"),
    L("hell", "mana_drip", "Запас маны", "passive", "Каждый 3-й твой ход: +1 мана ада.", "mana"),
    L("hell", "mana_strike", "Удар маной", "active", "2 маны ада: 3 урона оракулу или юниту.", "strike", "enemy_unit_or_hero", 2),
  ],
  water: [
    L("water", "school_mana", "Мана школы каждый ход", "passive", "В начале хода +1 маны воды.", "mana"),
    L("water", "sleep", "Усыпить", "active", "2 маны воды: враг спит 1 ход.", "sleep", "enemy_unit", 2),
    L("water", "bounce", "Вернуть в руку", "active", "2 маны воды: враг с ATK ≤ 2 → в руку владельца.", "bounce", "enemy_unit", 2),
    L("water", "shift", "Сдвинуть", "active", "2 маны воды: сдвинуть врага на соседнюю пустую клетку.", "shift", "enemy_unit", 2),
    L("water", "discount", "Скидка воде", "passive", "1× за бой: следующая карта воды −1 маны воды.", "mana"),
    L("water", "tide", "Прилив", "passive", "Каждый 3-й твой ход: +1 мана воды.", "mana"),
    L("water", "wet_armor", "Мокрая броня", "passive", "Первый урон по оракулу за бой −50%.", "armor"),
    L("water", "cleanse", "Чистая вода", "active", "2 маны воды: снять яд/ожог с себя.", "heal", "none", 2),
    L("water", "extra_card", "Лишняя карта", "passive", "В начале боя +1 карта в руку.", "card"),
    L("water", "mana_drip", "Запас маны", "passive", "Каждый 3-й твой ход: +1 мана воды (если нет Прилива — дубль слабый).", "mana"),
    L("water", "calm", "Затишье", "passive", "1× за бой: в конце хода у врага с макс. ATK −1 ATK до его хода.", "sleep"),
    L("water", "mana_heal", "Лечение маной", "active", "2 маны воды: оракул +4 HP.", "heal", "none", 2),
  ],
  nature: [
    L("nature", "school_mana", "Мана школы каждый ход", "passive", "В начале хода +1 маны природы.", "mana"),
    L("nature", "buff", "Усилить юнита", "active", "2 маны природы: своему +1/+1.", "buff", "ally_unit", 2),
    L("nature", "mana_heal", "Хил маной", "active", "2 маны природы: юниту +5 HP или всем +2.", "heal", "ally_unit_or_hero", 2),
    L("nature", "sprout", "Росток", "active", "2 маны природы: в пустую клетку юнит 1/1 (паук-росток).", "sprout", "empty_ally_slot", 2),
    L("nature", "empty_sprout", "Пустое место", "passive", "1× за бой: конец хода с пустой клеткой → росток 1/1.", "sprout"),
    L("nature", "roots", "Корни", "passive", "Каждый 2-й твой ход: оракул +1 HP.", "heal"),
    L("nature", "seeds", "Семена", "passive", "Старт боя: +1 мана природы.", "mana"),
    L("nature", "thicket", "Чаща", "passive", "Если своих ≥3 — в конце хода все свои +0/+1 до конца твоего след. хода.", "buff"),
    L("nature", "thorns", "Шипы", "passive", "1× за бой: когда бьют твоего юнита, атакующий −1 HP.", "strike"),
    L("nature", "tough", "Жёсткость", "passive", "Первый урон по оракулу за бой −1.", "armor"),
    L("nature", "mana_drip", "Запас маны", "passive", "Каждый 3-й твой ход: +1 мана природы.", "mana"),
    L("nature", "wild_start", "Дикий старт", "passive", "Старт боя: если есть пустая клетка — росток 1/1.", "sprout"),
  ],
};

const SKILL_MAP = new Map<string, OracleSkillDef>();
for (const list of Object.values(SKILLS_BY_FACTION)) {
  for (const s of list) SKILL_MAP.set(s.id, s);
}

export function getSkill(id: string): OracleSkillDef | null {
  return SKILL_MAP.get(id) ?? null;
}

export function skillsForFaction(faction: Faction): OracleSkillDef[] {
  return SKILLS_BY_FACTION[faction];
}

export function skillUnlockLevel(faction: Faction, skillId: string): number {
  const list = SKILLS_BY_FACTION[faction];
  const idx = list.findIndex((s) => s.id === skillId);
  if (idx < 0) return 99;
  return SKILL_POOL_UNLOCK_LEVELS[Math.min(idx, SKILL_POOL_UNLOCK_LEVELS.length - 1)] ?? 99;
}

export function isSkillVisible(faction: Faction, skillId: string, level: number): boolean {
  return level >= skillUnlockLevel(faction, skillId);
}

export function starterSkillId(faction: Faction): string {
  return `${faction}_school_mana`;
}

export function epicMult(tier?: HeroTier | null): boolean {
  return isEpicGift(tier);
}

export function nEpic(base: number, epic: boolean): number {
  return epic ? base + 1 : base;
}

/** Нормализация сейва умений. */
export function normalizeOracleSkillState(
  owned: OwnedState,
  faction: Faction,
): {
  willPoints: number;
  ownedSkills: string[];
  loadout: (string | null)[];
} {
  const level = Math.max(1, Math.floor(owned.level ?? 1));
  const earned = Math.max(0, level - 1) * SKILL_POINTS_PER_LEVEL;
  const starter = starterSkillId(faction);
  let ownedSkills = Array.isArray(owned.oracleSkillsOwned)
    ? [...owned.oracleSkillsOwned]
    : [];
  // Миграция: стартовое умение бесплатно.
  if (!ownedSkills.includes(starter)) ownedSkills.push(starter);
  ownedSkills = ownedSkills.filter((id) => {
    const def = getSkill(id);
    return def && def.faction === faction;
  });

  let loadout = Array.isArray(owned.oracleSkillLoadout)
    ? [...owned.oracleSkillLoadout]
    : [];
  while (loadout.length < SKILL_LOADOUT_SIZE) loadout.push(null);
  loadout = loadout.slice(0, SKILL_LOADOUT_SIZE).map((id) => {
    if (!id || !ownedSkills.includes(id)) return null;
    return id;
  });
  if (!loadout.some(Boolean)) {
    loadout[0] = starter;
  }

  const spent = ownedSkills.reduce((sum, id) => {
    if (id === starter) return sum;
    return sum + SKILL_UNLOCK_COST;
  }, 0);
  // Если в сейве уже есть willPoints — доверяем, но не даём уйти ниже 0.
  let willPoints =
    owned.willPoints != null
      ? Math.max(0, Math.floor(owned.willPoints))
      : Math.max(0, earned - spent);

  return { willPoints, ownedSkills, loadout };
}

export function skillsUnlockedOnLevel(newLevel: number): string[] {
  const lv = Math.floor(newLevel);
  if (lv === 10 || lv === 15 || lv === 20 || lv === 25 || lv === 30) {
    return [`Открыты новые умения школы для покупки (ур. ${lv}).`];
  }
  if (lv > 1) return ["+1 очко умений."];
  return [];
}

export function hasEquippedSkill(p: PlayerState, skillSuffixOrId: string): boolean {
  const list = p.oracleSkillLoadout ?? [];
  if (list.includes(skillSuffixOrId)) return true;
  const full = `${p.faction}_${skillSuffixOrId}`;
  return list.includes(full);
}

export function skillUsedKey(skillId: string): string {
  return skillId;
}

export function applySkillStateToOwned(
  owned: OwnedState,
  faction: Faction,
): OwnedState {
  const n = normalizeOracleSkillState(owned, faction);
  return {
    ...owned,
    willPoints: n.willPoints,
    oracleSkillsOwned: n.ownedSkills,
    oracleSkillLoadout: n.loadout,
  };
}

export function buyOracleSkill(
  owned: OwnedState,
  faction: Faction,
  skillId: string,
): { owned: OwnedState; ok: boolean; reason?: string } {
  const level = Math.max(1, Math.floor(owned.level ?? 1));
  const def = getSkill(skillId);
  if (!def || def.faction !== faction) {
    return { owned, ok: false, reason: "Нет такого умения" };
  }
  if (!isSkillVisible(faction, skillId, level)) {
    return {
      owned,
      ok: false,
      reason: `Откроется на ур. ${skillUnlockLevel(faction, skillId)}`,
    };
  }
  let next = applySkillStateToOwned(owned, faction);
  if ((next.oracleSkillsOwned ?? []).includes(skillId)) {
    return { owned: next, ok: false, reason: "Уже куплено" };
  }
  const pts = next.willPoints ?? 0;
  const starter = starterSkillId(faction);
  const cost = skillId === starter ? 0 : SKILL_UNLOCK_COST;
  if (pts < cost) {
    return { owned: next, ok: false, reason: `Нужно ${cost} очков (есть ${pts})` };
  }
  next = {
    ...next,
    willPoints: pts - cost,
    oracleSkillsOwned: [...(next.oracleSkillsOwned ?? []), skillId],
  };
  return { owned: next, ok: true };
}

export function resetOracleSkill(
  owned: OwnedState,
  faction: Faction,
  skillId: string,
): { owned: OwnedState; ok: boolean; reason?: string } {
  let next = applySkillStateToOwned(owned, faction);
  const ownedList = next.oracleSkillsOwned ?? [];
  if (!ownedList.includes(skillId)) {
    return { owned: next, ok: false, reason: "Умение не куплено" };
  }
  const dia = next.diamonds ?? 0;
  if (dia < SKILL_RESET_DIAMONDS) {
    return {
      owned: next,
      ok: false,
      reason: `Нужно ${SKILL_RESET_DIAMONDS} алмазов`,
    };
  }
  const starter = starterSkillId(faction);
  const refund = skillId === starter ? 0 : SKILL_UNLOCK_COST;
  const loadout = (next.oracleSkillLoadout ?? []).map((id) =>
    id === skillId ? null : id,
  ) as (string | null)[];
  next = {
    ...next,
    diamonds: dia - SKILL_RESET_DIAMONDS,
    willPoints: (next.willPoints ?? 0) + refund,
    oracleSkillsOwned: ownedList.filter((id) => id !== skillId),
    oracleSkillLoadout: loadout,
  };
  // Стартовое после сброса можно купить снова бесплатно через buy (cost 0) —
  // сразу вернём в owned без экипа, игрок сам наденет.
  return { owned: next, ok: true };
}

export function setOracleSkillLoadoutSlot(
  owned: OwnedState,
  faction: Faction,
  slotIndex: number,
  skillId: string | null,
): { owned: OwnedState; ok: boolean; reason?: string } {
  let next = applySkillStateToOwned(owned, faction);
  if (slotIndex < 0 || slotIndex >= SKILL_LOADOUT_SIZE) {
    return { owned: next, ok: false, reason: "Слот 0…3" };
  }
  if (skillId) {
    if (!(next.oracleSkillsOwned ?? []).includes(skillId)) {
      return { owned: next, ok: false, reason: "Сначала купи умение" };
    }
    const def = getSkill(skillId);
    if (!def || def.faction !== faction) {
      return { owned: next, ok: false, reason: "Чужая школа" };
    }
  }
  const loadout = [...(next.oracleSkillLoadout ?? [])] as (string | null)[];
  while (loadout.length < SKILL_LOADOUT_SIZE) loadout.push(null);
  // Убрать дубликат из другого слота
  if (skillId) {
    for (let i = 0; i < loadout.length; i++) {
      if (i !== slotIndex && loadout[i] === skillId) loadout[i] = null;
    }
  }
  loadout[slotIndex] = skillId;
  next = { ...next, oracleSkillLoadout: loadout };
  return { owned: next, ok: true };
}

/** Начислить очки за апы (вызвать после grantXp). */
export function grantWillPointsForLevels(
  owned: OwnedState,
  gainedLevels: number,
): OwnedState {
  if (gainedLevels <= 0) return owned;
  const cur = Math.max(0, Math.floor(owned.willPoints ?? 0));
  return {
    ...owned,
    willPoints: cur + gainedLevels * SKILL_POINTS_PER_LEVEL,
  };
}
