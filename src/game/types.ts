export type Faction = "water" | "hell" | "death" | "life" | "nature";

/** Школа карты: фракция или нейтрал */
export type School = Faction | "neutral";

export type CardKind = "creature" | "spell";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export type ManaPool = Record<Faction, number>;

/** Сколько какой фракции нужно (можно миксовать) */
export type ManaCost = Partial<ManaPool>;

export type AttackPattern =
  | "melee"
  | "melee_lane3"
  | "ranged"
  | "cleave3"
  /** Клеов строго из своего слота: напротив + слева + справа (цербер). */
  | "lane_cleave3"
  | "aoe_all";

export type CreatureGender = "male" | "female" | "none";

export type SpellEffect =
  | { type: "damage_hero"; amount: number }
  | { type: "heal_hero"; amount: number }
  | { type: "damage_all_enemies"; amount: number }
  | { type: "damage_undead"; amount: number }
  | { type: "draw"; amount: number }
  | {
      type: "buff_permanent";
      attack: number;
      health: number;
      /** Только существа этой школы (напр. death = нежить). */
      onlySchool?: School;
    }
  | { type: "heal_unit"; amount: number }
  | { type: "poison"; amount: number }
  | { type: "damage_unit"; amount: number }
  | { type: "gain_mana"; faction?: Faction; amount: number }
  | { type: "slow_enemy"; amount: number }
  | { type: "shield_ally"; turns: number }
  /** Оба войска не атакуют до конца хода соперника. */
  | { type: "skip_combat" }
  /** Случайно перемешать свои карты на поле (статы/эффекты сохраняются). */
  | { type: "shuffle_board" }
  /** На N следующих своих ходов — доп. добор 1 карты. */
  | { type: "extra_draw_turns"; turns: number }
  /** +ATK всем своим существам до конца хода. */
  | { type: "buff_army_attack"; amount: number }
  /** Убрать вражескую карту с поля (в сброс). */
  | { type: "banish_unit" }
  /** Снять яд с одного союзника. */
  | { type: "cure_poison" }
  /** Снять яд со всех своих существ. */
  | { type: "cure_poison_all" }
  /** Вернуть вражескую карту с поля в руку. */
  | { type: "bounce_enemy_hand" }
  /** Видеть руку врага N ходов. */
  | { type: "reveal_enemy_hand"; turns: number }
  /** Страж принимает урон за подопечного (два союзника, UI). */
  | { type: "guardian_bond" }
  /** Снять одно активное заклинание врага. */
  | { type: "break_enemy_spell" }
  /** Снять все активные заклинания врага. */
  | { type: "break_all_enemy_spells" }
  /** Изменник: враг бьёт своих после конца хода. */
  | { type: "traitor" }
  /** Заморозка: враг не атакует следующий ход (сон). */
  | { type: "freeze_enemy" }
  /** Сброс случайных карт из руки врага. */
  | { type: "discard_enemy_hand"; amount: number }
  /** Сбросить всю руку в грейв и добрать столько же из колоды. */
  | { type: "refresh_hand" }
  /**
   * Страх: враг не может атаковать существ школы твоего оракула turns ходов.
   * Школа берётся с кастера в момент каста.
   */
  | { type: "fear_protect"; turns: number }
  /** Марионетка: выбрать врага-куклу, затем цель удара/помощи; кукла спит. */
  | { type: "marionette" }
  /** Снять супер-умение с существа до конца боя. */
  | { type: "strip_ability" }
  /** +amount маны каждой школе. */
  | { type: "gain_mana_all"; amount: number }
  /** Яд на всех вражеских существ (растущий). */
  | { type: "poison_all"; amount: number }
  /** Переманить врага в свою руку (на эту битву). */
  | { type: "recruit_to_hand" }
  /**
   * Из последних сил: ×2 база ATK/HP; без резета в конце хода;
   * запас HP = новая база до конца боя.
   */
  | { type: "last_stand" }
  /** «В домике»: нельзя поразить и нельзя действовать turns ходов. */
  | { type: "bunker"; turns: number }
  /** Стрелки/маги врага не атакуют turns ходов. */
  | { type: "mute_ranged"; turns: number }
  /** Враг наносит 50% урона turns ходов. */
  | { type: "weaken_foe_damage"; turns: number }
  /** Снайпер: всем своим стрелкам/магам +attack и удар в героя на turns ход. */
  | { type: "sniper_buff"; attack: number; turns: number }
  /** Снять сон и снова дать атаку одному союзнику. */
  | { type: "wake_ally" }
  /** Снять сон и снова дать атаку всем своим существам. */
  | { type: "wake_all_allies" };

export type CreatureAbility =
  | "skeleton_pack"
  | "vampire_grow"
  | "angel_heal"
  /** Маг жизни: удар любому ИЛИ навсегда +1 HP союзнику / оракулу. */
  | "mage_flex"
  | "valkyrie_flex"
  | "triton_flex"
  | "mermaid_flex"
  | "succubus_flex"
  | "rush"
  | "leprechaun_aura"
  | "berserk_decay"
  | "immune_hell_death"
  | "immune_death"
  /** Невосприимчивость к любым заклинаниям (цели и АоЕ). */
  | "immune_spells"
  /** Пока на поле: все водные союзники +1 HP. */
  | "water_tide"
  /** Леший: удар напротив ИЛИ навсегда ATK↔HP у союзника/врага. */
  | "leshy_flex"
  /** Василиск: при ударе по существу — окаменение (сон) на след. ход. */
  | "basilisk_gaze"
  /** Паук: при ударе — постоянный яд −1/ход (не растёт), пока не снимут. */
  | "spider_poison"
  /** Шершень-воин / матка: рой — каждый доп. шершень даёт всем шершням +1 ATK. */
  | "hornet_pack"
  /** Матка шершней: удар или призвать Шершня-воина в пустой слот. */
  | "hornet_queen_flex"
  /** Паладин: удар или щит союзнику (−50% урона на 2 хода). */
  | "paladin_flex"
  /** Имп: при любой атаке дополнительно −1 HP герою врага. */
  | "imp_burn"
  /** Могильщик: удар или поднять существо из своего грейва в пустой слот. */
  | "gravedigger_flex"
  /** Лич: при ударе по существу лечит себя на 2. */
  | "lich_drain"
  /**
   * Арбитр: бьёт любую цель (ranged); вместо удара — Вердикт:
   * все существа на поле становятся 1/1, кроме него.
   */
  | "arbiter_flex"
  | "aquilite_swap"
  | "balthazar_flex"
  | "banshee_flex"
  | "necro_flex"
  | "scorpion_poison"
  | "mana_steal"
  /** Арбалетчик: при получении удара от существа сразу отвечает своей атакой. */
  | "riposte";

/**
 * Заклинание на столе (рядом с полем).
 * Висит на стороне пострадавшего/получателя эффекта.
 * active — ещё работает (яркое); echo — разовое, полупрозрачное до конца хода.
 */
export type LingeringSpell = {
  uid: string;
  cardId: string;
  /** null = пока цель жива / эффект не снят (яд) */
  turnsLeft: number | null;
  targetUid?: string;
  targetSide?: "you" | "enemy";
  /** Кто кастовал */
  casterSide?: "you" | "enemy";
  /** Для стража: uid того, кто принимает урон */
  guardianUid?: string;
  kind:
    | "poison"
    | "shield"
    | "guardian"
    | "traitor"
    | "buff"
    | "echo"
    | "bunker"
    | "fear"
    | "weaken"
    | "mute_ranged"
    | "sniper";
  /** active = работает; echo = след удара, снимется в конце хода */
  mode: "active" | "echo";
};

export type HeroTier = "base" | "epic";

export interface HeroDef {
  id: string;
  name: string;
  faction: Faction;
  maxHp: number;
  text: string;
  tier?: HeroTier;
  priceGold?: number;
  priceDiamonds?: number;
}

export interface CardDef {
  id: string;
  name: string;
  school: School;
  kind: CardKind;
  manaCost: ManaCost;
  /** Сумма для UI; если нет — считается из manaCost */
  cost?: number;
  attack?: number;
  health?: number;
  attackPattern?: AttackPattern;
  text: string;
  rarity: Rarity;
  premium: boolean;
  priceGold?: number;
  priceDiamonds?: number;
  priceStars?: number;
  /** Сила/тир карты 1…5 (скелет=1, костяной рекс=5). */
  unitLevel?: 1 | 2 | 3 | 4 | 5;
  art?: string;
  spellEffects?: SpellEffect[];
  onPlayHealHero?: number;
  ability?: CreatureAbility;
  abilities?: CreatureAbility[];
  gender?: CreatureGender;
  /**
   * Длящееся заклинание: остаётся у колоды.
   * turns — число ходов владельца цели; untilCleared — пока эффект на цели.
   */
  spellLinger?: { turns: number } | { untilCleared: true };
}

export type StatusEffect = {
  type:
    | "poison"
    | "slow"
    | "shield"
    | "sleep"
    | "traitor"
    | "bunker"
    | "sniper"
    | "last_gasp";
  amount: number;
  /** Яд без эскалации (паук): каждый ход фиксированный −amount. */
  steady?: boolean;
};

export interface CreatureInstance {
  uid: string;
  cardId: string;
  baseAttack: number;
  baseHealth: number;
  permAttack: number;
  permHealth: number;
  packBonus: number;
  /** Рой шершней: только ATK (не HP). */
  swarmBonus?: number;
  /** Аура «прилив»: +HP пока на поле есть water_tide */
  auraHp?: number;
  attack: number;
  health: number;
  canAttack: boolean;
  statuses: StatusEffect[];
  /** uid стража, который принимает урон вместо этой карты */
  guardedByUid?: string;
  /** Ничтожество: супер-умения выключены до конца боя. */
  stripped?: boolean;
  /** Из последних сил: не сбрасывать ATK/HP к базе в конце хода. */
  noRestore?: boolean;
}

export type Slot = CreatureInstance | null;

export interface PlayerState {
  id: "you" | "enemy";
  name: string;
  heroId: string;
  faction: Faction;
  hp: number;
  maxHp: number;
  mana: ManaPool;
  deck: string[];
  hand: string[];
  slots: Slot[];
  graveyard: string[];
  /** Заклинания на стороне стола (эффекты / эхо разовых ударов) */
  activeSpells: LingeringSpell[];
  /** Сколько следующих своих ходов ещё дать +1 карту в добор */
  bonusDrawTurns: number;
  /** Сколько ходов ещё видна рука врага */
  revealEnemyHandTurns: number;
  /** Пыль в глаза: исходящий урон ×0.5 столько своих ходов. */
  weakenDamageTurns: number;
  /** Чистое небо: ranged/маги не атакуют столько своих ходов. */
  muteRangedTurns: number;
  /**
   * Страх: этот игрок не может атаковать существ указанной школы столько своих ходов.
   * (Ставится на врага кастера.)
   */
  attackBanSchool: Faction | null;
  attackBanTurns: number;
}

export type AttackTarget = "hero" | number;

export interface BattleRules {
  undeadSurge?: boolean;
  heavySpells?: boolean;
  fragileBoard?: boolean;
  /** Порог хода для буйства крови (по умолчанию 20). */
  bloodFrenzyAfter?: number;
  /**
   * Id модификаторов арены, активных в этом бою
   * (чтобы UI мог показать названия, а не только флаги).
   */
  arenaMods?: string[];
}

export interface BattleState {
  turn: number;
  active: "you" | "enemy";
  you: PlayerState;
  enemy: PlayerState;
  log: string[];
  winner: "you" | "enemy" | null;
  selectedHand: number | null;
  selectedSlot: number | null;
  /** Сколько ещё чужих ходов войска не атакуют (затишье). */
  calmTurnsLeft: number;
  /**
   * Буйство крови: 0 = ещё не началось;
   * >0 = урон следующего тика (1, затем 2, 3…).
   */
  bloodFrenzy: number;
  /** Модификаторы арены / особые правила боя. */
  rules?: BattleRules;
  /**
   * Эпик смерти (дар косы): номер хода, в котором уже дали +1 ману смерти
   * за гибель своего юнита школы death (не чаще раза за ход).
   */
  deathGiftStamp?: Partial<Record<"you" | "enemy", number>>;
}

export interface OwnedState {
  /** Уникальные id открытых карт (синхрон с collection > 0). */
  unlocked: string[];
  /**
   * Копии в коллекции: cardId → сколько штук куплено/выдано.
   * В колоду нельзя положить больше, чем здесь (и не больше maxCopiesForCard).
   */
  collection?: Record<string, number>;
  /** Колоды: списки id с повторами (копии). */
  decks: Record<string, string[]>;
  activeDeckId: string;
  heroId?: string;
  /**
   * Фракция, выбранная при создании оракула.
   * Дальше можно только base/epic этой фракции — не менять школу.
   */
  homeFaction?: Faction;
  gold?: number;
  diamonds?: number;
  /** Уровень аккаунта / оракула 1…50 */
  level?: number;
  /** Опыт внутри текущего уровня */
  xp?: number;
  /** Карты, купленные за золото/кристаллы — не вычищать миграцией стартов. */
  purchased?: string[];
  /** Купленные эпические оракулы. */
  unlockedHeroes?: string[];
}
