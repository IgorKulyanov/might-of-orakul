import { useMemo, useState } from "react";
import {
  loadDailies,
  todayQuests,
  type DailyQuestId,
} from "../game/dailies";
import {
  loadLifetimeQuests,
  syncLifetimeFromOwned,
  visibleLifetimeQuests,
  type LifetimeQuestId,
} from "../game/lifetimeQuests";
import type { OwnedState } from "../game/types";
import { GameIcon } from "./GameIcon";

type ClaimFn = (questId: DailyQuestId) => {
  ok: boolean;
  xp: number;
  gold: number;
  diamonds: number;
  reason?: string;
};

type LifetimeClaimFn = (questId: LifetimeQuestId) => {
  ok: boolean;
  xp: number;
  gold: number;
  diamonds: number;
  reason?: string;
};

type Props = {
  owned: OwnedState;
  onClaim: ClaimFn;
  onClaimLifetime: LifetimeClaimFn;
};

export function DailyPanel({ owned, onClaim, onClaimLifetime }: Props) {
  const [tick, setTick] = useState(0);
  void tick;

  const dailies = loadDailies();
  const quests = todayQuests(dailies);
  const lifetime = useMemo(() => {
    syncLifetimeFromOwned(owned);
    return loadLifetimeQuests();
  }, [owned, tick]);
  const lifeQuests = visibleLifetimeQuests(lifetime);

  return (
    <div className="daily-panel" data-tut="hub-dailies-panel">
      <h2 className="daily-title">Задания дня</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Четыре цели из большого пула — победы, магазин, заклинания, Тропа.
        Завтра выпадут другие.
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

      <h2 className="daily-title daily-title-life">Путь оракула</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Одноразовые цели: уровень, коллекция, Тропа, покупки, заклинания.
        Награда забирается один раз.
      </p>
      <ul className="daily-list">
        {lifeQuests.length === 0 ? (
          <li className="daily-item">
            <div>
              <strong>Все ближайшие цели закрыты</strong>
              <span className="daily-meta">Открой карты, побеждай — появятся новые</span>
            </div>
          </li>
        ) : (
          lifeQuests.map((q) => {
            const prog = lifetime.progress[q.id] ?? 0;
            const done = prog >= q.target;
            const claimed = lifetime.claimed.includes(q.id);
            const dia = q.diamonds ?? 0;
            return (
              <li key={q.id} className="daily-item">
                <div>
                  <strong>{q.title}</strong>
                  <span className="daily-meta inline-icos">
                    {q.hint} · {prog}/{q.target} · +{q.xp} XP · +{q.gold}{" "}
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
                    onClaimLifetime(q.id);
                    setTick((n) => n + 1);
                  }}
                >
                  {claimed ? "Получено" : done ? "Забрать" : "В процессе"}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
