/**
 * FX для наблюдателя PvP: действие пришло от соперника (он = enemy).
 * Слоты в action — в системе координат кастера (= наш enemy).
 */
import { getCard } from "./cards";
import {
  attackMotionFor,
  enrichSpellFx,
  normalizeBattleFx,
  type BattleFx,
} from "./engine";
import type { PvpAction } from "./pvpProtocol";
import type { BattleState } from "./types";

function enemyAttackPreview(
  state: BattleState,
  fromSlot: number,
  target: "hero" | number,
): BattleFx {
  const atk = state.enemy.slots[fromSlot];
  const cardId = atk?.cardId;
  const motion = cardId ? attackMotionFor(cardId) : "melee";
  if (target === "hero") {
    return normalizeBattleFx({
      side: "enemy",
      kind: "lunge",
      fromSlot,
      hitHero: true,
      cardId,
      motion,
    });
  }
  return normalizeBattleFx({
    side: "enemy",
    kind: "lunge",
    fromSlot,
    hitSlots: [target],
    toSlot: typeof target === "number" ? target : undefined,
    cardId,
    motion,
  });
}

/** Собрать FX чужого хода по столу ДО применения (observer-frame). */
export function fxFromRemoteAction(
  prev: BattleState,
  action: PvpAction,
): BattleFx | null {
  switch (action.kind) {
    case "endTurn":
      return null;
    case "attack":
      return enemyAttackPreview(prev, action.fromSlot, action.target);
    case "playCard": {
      const cardId = prev.enemy.hand[action.handIndex];
      if (!cardId) return null;
      let card;
      try {
        card = getCard(cardId);
      } catch {
        return null;
      }
      if (card.kind === "creature") {
        return normalizeBattleFx({
          side: "enemy",
          kind: "play",
          toSlot: action.slotIndex ?? undefined,
          cardId,
        });
      }
      return enrichSpellFx(
        {
          side: "enemy",
          kind: "spell",
          cardId,
          toSlot: action.slotIndex ?? undefined,
        },
        prev,
      );
    }
    case "healAngel":
    case "buffMage":
      return normalizeBattleFx({
        side: "enemy",
        kind: "heal",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot === "hero" ? undefined : action.toSlot,
        hitHero: action.kind === "buffMage" && action.toSlot === "hero",
      });
    case "moveUnit":
    case "summonAquilite":
    case "summonSkeleton":
    case "summonHornet":
    case "reviveGravedigger":
      return normalizeBattleFx({
        side: "enemy",
        kind: "play",
        fromSlot: action.fromSlot,
        toSlot: "toSlot" in action ? action.toSlot : undefined,
      });
    case "shieldPaladin":
    case "sleepMermaid":
    case "sleepSuccubus":
    case "stunBanshee":
    case "swapLeshy":
    case "verdictArbiter":
    case "breakUnicorn":
    case "cleaveInferno":
    case "swapBalthazar":
      return normalizeBattleFx({
        side: "enemy",
        kind: "spell",
        fromSlot: action.fromSlot,
        toSlot: "toSlot" in action ? action.toSlot : undefined,
        cardId: prev.enemy.slots[action.fromSlot]?.cardId,
      });
    case "marionette":
    case "guardianBond": {
      const cardId = prev.enemy.hand[action.handIndex];
      return enrichSpellFx(
        {
          side: "enemy",
          kind: "spell",
          cardId,
        },
        prev,
      );
    }
    case "commitState":
      return null;
    default:
      return null;
  }
}
