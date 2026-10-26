import { useMemo, useState } from "react";
import { apiOwnerBoost } from "../game/api";
import { CARDS, sortCatalogCards } from "../game/cards";
import {
  grantCardCopy,
  grantCurrency,
  ownedCopies,
} from "../game/owned";
import { OWNER_BOOST_CODE } from "../game/ownerCode";
import type { OwnedState } from "../game/types";

type Props = {
  open: boolean;
  owned: OwnedState;
  onApply: (next: OwnedState) => void;
  onClose: () => void;
};

type Target = "self" | "other";

export function OwnerBoostPanel({ open, owned, onApply, onClose }: Props) {
  const [target, setTarget] = useState<Target>("self");
  const [otherLogin, setOtherLogin] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sortCatalogCards(CARDS).filter((c) => {
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.id.toLowerCase().includes(needle)
      );
    });
  }, [q]);

  if (!open) return null;

  const otherOk = otherLogin.trim().length >= 3;

  const giveSelf = (gold: number, dia: number) => {
    const next = grantCurrency(owned, gold, dia);
    onApply(next);
    setStatus(`Себе: +${gold}🪙 +${dia}💎`);
  };

  const giveSelfCard = (cardId: string, name: string) => {
    const before = ownedCopies(owned, cardId);
    const next = grantCardCopy(owned, cardId);
    const after = ownedCopies(next, cardId);
    if (after <= before) {
      setStatus(`${name}: уже максимум копий`);
      return;
    }
    onApply(next);
    setStatus(`Себе: ${name} ×${after}`);
  };

  const giveOther = async (payload: {
    gold?: number;
    diamonds?: number;
    cardId?: string;
  }) => {
    if (!otherOk) {
      setStatus("Сначала введи логин игрока");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await apiOwnerBoost({
        code: OWNER_BOOST_CODE,
        login: otherLogin.trim(),
        ...payload,
        note: "компенсация",
      });
      setStatus(res.message);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="community-overlay" role="dialog" aria-label="Компенсация">
      <div className="community-panel admin-panel">
        <header className="community-bar">
          <strong>Компенсация</strong>
          <button type="button" className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="admin-row">
          <button
            type="button"
            className={target === "self" ? "primary" : "ghost"}
            onClick={() => setTarget("self")}
          >
            Себе
          </button>
          <button
            type="button"
            className={target === "other" ? "primary" : "ghost"}
            onClick={() => setTarget("other")}
          >
            Другому
          </button>
        </div>

        {target === "other" ? (
          <>
            <p className="community-hint">
              Логин игрока (как при входе). Увидит награду после входа или
              обновления сейва.
            </p>
            <input
              value={otherLogin}
              placeholder="логин игрока"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setOtherLogin(e.target.value)}
            />
          </>
        ) : (
          <p className="community-hint">
            На этот аккаунт в браузере — сразу в магазине и колоде.
          </p>
        )}

        <section className="admin-section">
          <h3>Валюта</h3>
          <div className="admin-row">
            <button
              type="button"
              className="primary"
              disabled={busy || (target === "other" && !otherOk)}
              onClick={() =>
                target === "self"
                  ? giveSelf(500, 0)
                  : void giveOther({ gold: 500 })
              }
            >
              +500 🪙
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || (target === "other" && !otherOk)}
              onClick={() =>
                target === "self"
                  ? giveSelf(0, 25)
                  : void giveOther({ diamonds: 25 })
              }
            >
              +25 💎
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy || (target === "other" && !otherOk)}
              onClick={() =>
                target === "self"
                  ? giveSelf(2000, 50)
                  : void giveOther({ gold: 2000, diamonds: 50 })
              }
            >
              +2000🪙 +50💎
            </button>
          </div>
        </section>

        <section className="admin-section">
          <h3>Карта</h3>
          <input
            value={q}
            placeholder="поиск по имени…"
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="community-log admin-log">
            {list.map((c) => {
              const have = ownedCopies(owned, c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  className="admin-user"
                  disabled={busy || (target === "other" && !otherOk)}
                  onClick={() =>
                    target === "self"
                      ? giveSelfCard(c.id, c.name)
                      : void giveOther({ cardId: c.id })
                  }
                >
                  <strong>{c.name}</strong>
                  <span>
                    {target === "self"
                      ? `есть ${have}`
                      : `выдать → ${otherLogin.trim() || "…"}`}
                    {" · "}
                    {c.priceGold ?? 0}🪙
                    {c.priceDiamonds ? ` / ${c.priceDiamonds}💎` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        {status ? <p className="community-status">{status}</p> : null}
      </div>
    </div>
  );
}
