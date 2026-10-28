import { useState } from "react";
import {
  DAILY_QUESTS,
  loadDailies,
  type DailyQuestId,
} from "../game/dailies";
import type { OwnedState } from "../game/types";

type Props = {
  owned: OwnedState;
  onClaim: (questId: DailyQuestId) => {
    ok: boolean;
    xp: number;
    gold: number;
    diamonds: number;
    reason?: string;
  };
};

export function DailyPanel({ owned: _owned, onClaim }: Props) {
  const [tick, setTick] = useState(0);
  const dailies = loadDailies();
  void tick;
  void _owned;

  return (
    <div className="daily-panel" data-tut="hub-dailies-panel">
      <h2 className="daily-title">Ежедневные задания</h2>
      <ul className="daily-list">
        {DAILY_QUESTS.map((q) => {
          const prog = dailies.progress[q.id] ?? 0;
          const done = prog >= q.target;
          const claimed = dailies.claimed.includes(q.id);
          const dia = q.diamonds ?? 0;
          return (
            <li key={q.id} className="daily-item">
              <div>
                <strong>{q.title}</strong>
                <span className="daily-meta">
                  {prog}/{q.target} · +{q.xp} XP · +{q.gold} зол.
                  {dia > 0 ? ` · +${dia}💎` : ""}
                </span>
              </div>
              <button
                type="button"
                className={claimed ? "ghost" : "primary"}
                disabled={!done || claimed}
                onClick={() => {
                  onClaim(q.id);
                  setTick((n) => n + 1);
                }}
              >
                {claimed ? "Получено" : done ? "Забрать" : "В процессе"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
