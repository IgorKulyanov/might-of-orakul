import { useMemo, useState } from "react";
import { apiOwnerBoost } from "../game/api";
import { CARDS, sortCatalogCards } from "../game/cards";
import { ownedCopies } from "../game/owned";
import {
  loadOwnerBoostCode,
  saveOwnerBoostCode,
} from "../game/ownerCode";
import { getCachedUser } from "../game/session";
import type { OwnedState } from "../game/types";

type Props = {
  open: boolean;
  owned: OwnedState;
  onApply: (next: OwnedState) => void;
  onClose: () => void;
};

type Target = "self" | "other";

export function OwnerBoostPanel({ open, owned, onClose }: Props) {
  const [target, setTarget] = useState<Target>("self");
  const [otherLogin, setOtherLogin] = useState("");
  const [code, setCode] = useState(() => loadOwnerBoostCode());
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

  const selfLogin = getCachedUser()?.login || "";
  const otherOk = otherLogin.trim().length >= 3;
  const codeOk = code.trim().length >= 4;
  const canAct =
    codeOk && (target === "self" ? selfLogin.length >= 2 : otherOk);

  const grant = async (payload: {
    gold?: number;
    diamonds?: number;
    cardId?: string;
  }) => {
    if (!codeOk) {
      setStatus("Введи секретный код владельца");
      return;
    }
    const login =
      target === "self" ? selfLogin : otherLogin.trim();
    if (!login) {
      setStatus(
        target === "self"
          ? "Нужен вход в аккаунт"
          : "Сначала введи логин игрока",
      );
      return;
    }
    setBusy(true);
    setStatus(null);
    saveOwnerBoostCode(code);
    try {
      const res = await apiOwnerBoost({
        code: code.trim(),
        login,
        ...payload,
        note: "компенсация",
      });
      setStatus(
        target === "self"
          ? `${res.message} — обнови сейв / перезайди, чтобы увидеть.`
          : res.message,
      );
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

        <p className="community-hint">
          Код не хранится в игре — только на сервере. Локальная «накрутка себе»
          без сервера отключена.
        </p>
        <label className="admin-section">
          Секретный код
          <input
            type="password"
            autoComplete="off"
            value={code}
            placeholder="код владельца"
            onChange={(e) => setCode(e.target.value)}
          />
        </label>

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
            На аккаунт «{selfLogin || "…"}» — через сервер (pending grant).
          </p>
        )}

        <section className="admin-section">
          <h3>Валюта</h3>
          <div className="admin-row">
            <button
              type="button"
              className="primary"
              disabled={busy || !canAct}
              onClick={() => void grant({ gold: 500 })}
            >
              +500 зол.
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !canAct}
              onClick={() => void grant({ diamonds: 25 })}
            >
              +25 💎
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy || !canAct}
              onClick={() => void grant({ gold: 2000, diamonds: 50 })}
            >
              +2000 зол. +50💎
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
                  disabled={busy || !canAct}
                  onClick={() => void grant({ cardId: c.id })}
                >
                  <strong>{c.name}</strong>
                  <span>
                    {target === "self"
                      ? `есть ${have}`
                      : `выдать → ${otherLogin.trim() || "…"}`}
                    {" · "}
                    {c.priceGold ?? 0} зол.
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
