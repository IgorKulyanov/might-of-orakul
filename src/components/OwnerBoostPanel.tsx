import { useMemo, useState } from "react";
import { CARDS, sortCatalogCards } from "../game/cards";
import {
  grantCardCopy,
  grantCurrency,
  ownedCopies,
} from "../game/owned";
import type { OwnedState } from "../game/types";

type Props = {
  open: boolean;
  owned: OwnedState;
  onApply: (next: OwnedState) => void;
  onClose: () => void;
};

export function OwnerBoostPanel({ open, owned, onApply, onClose }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | null>(null);

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

  const give = (gold: number, dia: number) => {
    const next = grantCurrency(owned, gold, dia);
    onApply(next);
    setStatus(`+${gold}🪙 +${dia}💎`);
  };

  const giveCard = (cardId: string, name: string) => {
    const before = ownedCopies(owned, cardId);
    const next = grantCardCopy(owned, cardId);
    const after = ownedCopies(next, cardId);
    if (after <= before) {
      setStatus(`${name}: уже максимум копий`);
      return;
    }
    onApply(next);
    setStatus(`${name}: копия ×${after}`);
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
        <p className="community-hint">
          Себе на этот аккаунт: валюта или карта. Прогресс сразу в магазине и
          колоде.
        </p>
        <section className="admin-section">
          <h3>Валюта</h3>
          <div className="admin-row">
            <button
              type="button"
              className="primary"
              onClick={() => give(500, 0)}
            >
              +500 🪙
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => give(0, 25)}
            >
              +25 💎
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => give(2000, 50)}
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
                  onClick={() => giveCard(c.id, c.name)}
                >
                  <strong>{c.name}</strong>
                  <span>
                    есть {have} · {c.priceGold ?? 0}🪙
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
