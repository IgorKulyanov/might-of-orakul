import { useState } from "react";
import {
  loadDailies,
  todayQuests,
  type DailyQuestId,
} from "../game/dailies";
import type { OwnedState } from "../game/types";
import { GameIcon } from "./GameIcon";

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
  const quests = todayQuests(dailies);
  void tick;
  void _owned;

  return (
    <div className="daily-panel" data-tut="hub-dailies-panel">
      <h2 className="daily-title">Задания дня</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Три цели из большого пула — завтра выпадут другие. Часть зовёт на арену,
        тропу или дуэль.
      </p>
      <ul className="daily-list">
        {quests.map((q) => {
          const prog = dailies.progress[q.id] ?? 0;
          const done = prog >= q.target;
          const claimed = dailies.claimed.includes(q.id);
          const dia = q.diamonds ?? 0;
          return (
            <li key={q.id} className="daily-item">
              <div>
                <strong>{q.title}</strong>
                <span className="daily-meta inline-icos">
                  {prog}/{q.target} · +{q.xp} XP · +{q.gold}{" "}
                  <GameIcon name="gold" size={13} />
                  {dia > 0 ? (
                    <>
                      {" · +"}
                      {dia} <GameIcon name="diamond" size={13} />
                    </>
                  ) : null}
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
