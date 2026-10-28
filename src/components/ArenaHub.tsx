import { useEffect, useState } from "react";
import {
  ARENA_MOD_CATALOG,
  type ArenaModId,
} from "../game/battleRules";
import {
  ARENA_ROUND_REWARDS,
  ARENA_ROUNDS,
  arenaFoeLevel,
  arenaModsForRound,
  arenaRunComplete,
  isArenaLockedToday,
  nextArenaRound,
  type ArenaState,
} from "../game/arena";
import { playerLevel } from "../game/owned";
import type { OwnedState } from "../game/types";

type Props = {
  owned: OwnedState;
  arena: ArenaState;
  onBack: () => void;
  onOpen?: () => void;
  onAcceptFight: (round: number) => void;
  /** Сброс сегодняшнего забега — чтобы сразу пробовать снова. */
  onResetRun?: () => void;
};

function ModList({
  mods,
  startIndex = 0,
  /** Индекс, с которого правило «новое» в этом бою (остальное — уже было). */
  newFromIndex,
}: {
  mods: ArenaModId[];
  startIndex?: number;
  newFromIndex?: number;
}) {
  return (
    <ul className="arena-mod-list">
      {mods.map((id, i) => {
        const meta = ARENA_MOD_CATALOG[id];
        const roundNum = startIndex + i + 1;
        const isNew =
          newFromIndex != null ? i >= newFromIndex : false;
        return (
          <li
            key={`${id}-${startIndex + i}`}
            className={`arena-mod ${isNew ? "is-new" : "is-active"}`}
          >
            <div className="arena-mod-head">
              <strong>
                Бой {roundNum}: {meta.title}
              </strong>
              {isNew ? <em className="arena-mod-badge">новое</em> : null}
            </div>
            <span>{meta.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ArenaHub({
  owned,
  arena,
  onBack,
  onOpen,
  onAcceptFight,
  onResetRun,
}: Props) {
  const [howOpen, setHowOpen] = useState(false);

  useEffect(() => {
    onOpen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const level = playerLevel(owned);
  const locked = isArenaLockedToday(arena);
  const done = arenaRunComplete(arena);
  const next = nextArenaRound(arena);
  const lost = locked && !done;
  const modsToday = arena.dayMods;
  const fightMods = next != null ? arenaModsForRound(arena, next) : modsToday;
  const reward =
    next != null
      ? ARENA_ROUND_REWARDS[next as 1 | 2 | 3 | 4 | 5]
      : null;
  const foeLv = next != null ? arenaFoeLevel(level, arena.cleared) : null;
  const newMod =
    next != null && fightMods.length > 0
      ? fightMods[fightMods.length - 1]!
      : null;

  return (
    <div className="arena-screen">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Меню
        </button>
        <h1>Арена</h1>
        <span className="arena-progress-chip">
          {arena.cleared}/{ARENA_ROUNDS}
        </span>
      </header>

      <section className="arena-how" aria-label="Как устроена арена">
        <p className="arena-how-lead">
          Это <strong>не кампания</strong>. Короткий дневной челлендж: 5 боёв
          подряд. Важно: правила <strong>складываются</strong>. В бою 5
          действуют все пять сразу — не только то, что написано как «новое».
        </p>
        <ol className="arena-how-steps">
          <li>
            <strong>Бой 1</strong> — одно правило. <strong>Бой 5</strong> — все
            пять вместе.
          </li>
          <li>
            Метка «новое» — только что добавилось; остальные из списка тоже
            уже работают.
          </li>
          <li>
            <strong>Победа</strong> — награда раунда, затем возврат сюда:
            прочитай новое правило и жми следующий бой.
          </li>
          <li>
            <strong>Поражение</strong> или выход из боя = конец забега на
            сегодня (награды за уже выигранные бои остаются).
          </li>
          <li>
            Между боями можно уйти в меню — прогресс дня сохранится. Новый
            полный забег — завтра (или сброс в режиме разработчика).
          </li>
        </ol>
        <button
          type="button"
          className="ghost arena-how-toggle"
          onClick={() => setHowOpen((v) => !v)}
          aria-expanded={howOpen}
        >
          {howOpen ? "Скрыть все правила" : "Что вообще бывают за правила?"}
        </button>
        {howOpen ? (
          <ul className="arena-how-catalog">
            {(
              Object.entries(ARENA_MOD_CATALOG) as [
                ArenaModId,
                { title: string; text: string },
              ][]
            ).map(([id, meta]) => (
              <li key={id}>
                <strong>{meta.title}</strong>
                <span>{meta.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {lost && (
        <p className="arena-lock-banner">
          Ты проиграл — арена закрыта до завтра. Награды за выигранные бои
          уже у тебя. Завтра забег с нуля и с другими правилами.
        </p>
      )}
      {done && (
        <div className="arena-win-banner">
          <p>
            Все 5 боёв дня пройдены. Лучшая серия: {arena.bestStreak}.
          </p>
          <p className="arena-win-loot">
            Награды арены за забег (уже в кошельке, по боям):{" "}
            <strong>
              зол.
              {Object.values(ARENA_ROUND_REWARDS).reduce((s, r) => s + r.gold, 0)}
            </strong>
            {" · "}
            <strong>
              💎
              {Object.values(ARENA_ROUND_REWARDS).reduce(
                (s, r) => s + r.diamonds,
                0,
              )}
            </strong>
            {" "}
            (40+60+80+100+150 золота · 0+0+1+2+5 алмазов). Плюс опыт и обычные
            награды за каждый бой с ботом.
          </p>
        </div>
      )}

      <div className="arena-panel">
        <div className="arena-stats">
          <div>
            <em>Сейчас</em>
            <strong>
              {done
                ? "готово"
                : lost
                  ? "закрыто"
                  : `бой ${next} / ${ARENA_ROUNDS}`}
            </strong>
          </div>
          <div>
            <em>Лучшая серия</em>
            <strong>{arena.bestStreak}</strong>
          </div>
          <div>
            <em>Твой ур.</em>
            <strong>{level}</strong>
          </div>
          {foeLv != null && (
            <div>
              <em>Бот ≈</em>
              <strong>{foeLv}</strong>
            </div>
          )}
        </div>

        {next != null && newMod ? (
          <div className="arena-next-callout">
            <p className="arena-next-eyebrow">В следующем бою добавится</p>
            <h2>{ARENA_MOD_CATALOG[newMod].title}</h2>
            <p>{ARENA_MOD_CATALOG[newMod].text}</p>
            {fightMods.length > 1 ? (
              <p className="hint">
                Вместе с ним в бою уже действуют все правила из списка ниже
                (не только новое). Например, если раньше выпали «Тяжёлые
                заклинания» — цены спеллов всё ещё +1.
              </p>
            ) : (
              <p className="hint">Это первый бой — только это правило.</p>
            )}
          </div>
        ) : null}

        <div className="arena-rules-rewards">
          <div className="arena-rules-col">
            <h2 className="arena-section-title">
              {next != null
                ? `Что будет действовать в бою ${next}`
                : "Правила сегодняшнего забега"}
            </h2>
            <ModList
              mods={next != null ? fightMods : modsToday}
              newFromIndex={
                next != null ? Math.max(0, fightMods.length - 1) : undefined
              }
            />

            {next != null && modsToday.length > fightMods.length ? (
              <>
                <h2 className="arena-section-title">Если дойдёшь дальше</h2>
                <p className="hint arena-later-hint">
                  Эти правила ещё не включены — каждое откроется своим боем.
                </p>
                <ModList
                  mods={modsToday.slice(fightMods.length)}
                  startIndex={fightMods.length}
                />
              </>
            ) : null}
          </div>

          <aside className="arena-rewards-col" aria-label="Награды арены">
            <h2 className="arena-section-title">Награды за бои</h2>
            <ul className="arena-reward-table">
              {([1, 2, 3, 4, 5] as const).map((r) => {
                const row = ARENA_ROUND_REWARDS[r];
                const got = arena.cleared >= r;
                const current = next === r;
                return (
                  <li
                    key={r}
                    className={[
                      "arena-reward-row",
                      got ? "is-got" : "",
                      current ? "is-current" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="arena-reward-round">Бой {r}</span>
                    <span className="arena-reward-loot">
                      зол.{row.gold}
                      {row.diamonds > 0 ? ` · 💎${row.diamonds}` : ""}
                    </span>
                    <em>
                      {got ? "получено" : current ? "сейчас" : "дальше"}
                    </em>
                  </li>
                );
              })}
            </ul>
            <p className="arena-reward-total">
              Забег целиком: зол. 430 · 💎8
              {reward ? (
                <>
                  <br />
                  За этот бой: зол.{reward.gold}
                  {reward.diamonds > 0 ? ` · 💎${reward.diamonds}` : ""}
                </>
              ) : null}
            </p>
          </aside>
        </div>

        <div className="arena-actions">
          {next != null ? (
            <button
              type="button"
              className="primary large"
              onClick={() => onAcceptFight(next)}
            >
              В бой {next} из {ARENA_ROUNDS}
            </button>
          ) : (
            <button type="button" className="ghost large" disabled>
              {done ? "На сегодня всё" : "Закрыто до завтра"}
            </button>
          )}
          {onResetRun && (locked || arena.cleared > 0) ? (
            <button
              type="button"
              className="ghost large"
              onClick={() => {
                if (
                  window.confirm(
                    "Сбросить сегодняшний забег? Прогресс боёв обнулится, правила дня останутся. Уже полученные награды не заберут.",
                  )
                ) {
                  onResetRun();
                }
              }}
            >
              Сбросить забег и начать снова
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
