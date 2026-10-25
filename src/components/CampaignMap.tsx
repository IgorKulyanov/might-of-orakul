import { useEffect, useMemo, useState } from "react";
import { getHero, orakulArtUrl } from "../game/heroes";
import { activeHeroId, playerLevel } from "../game/owned";
import {
  CAMPAIGN_MILESTONES,
  CAMPAIGN_NODE_POS,
  CAMPAIGN_NODES,
  campaignFoeLevel,
  campaignFoeName,
  canFightNode,
  isCampaignLockedToday,
  nextCampaignNode,
  type CampaignState,
} from "../game/campaign";
import type { OwnedState } from "../game/types";

type Props = {
  owned: OwnedState;
  campaign: CampaignState;
  onBack: () => void;
  /** Проверка смены суток при открытии карты. */
  onOpen?: () => void;
  onAcceptFight: (node: number) => void;
};

export function CampaignMap({
  owned,
  campaign,
  onBack,
  onOpen,
  onAcceptFight,
}: Props) {
  useEffect(() => {
    onOpen?.();
    // только при монтировании экрана
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const level = playerLevel(owned);
  const hero = getHero(activeHeroId(owned));
  const locked = isCampaignLockedToday(campaign);
  const next = nextCampaignNode(campaign);
  const [preview, setPreview] = useState<number | null>(null);

  const oraclePos = useMemo(() => {
    const idx = Math.min(campaign.cleared, CAMPAIGN_NODES - 1);
    // Стоит на последнем пройденном; если 0 — у старта (узел 1)
    const pos = CAMPAIGN_NODE_POS[campaign.cleared === 0 ? 0 : idx]!;
    return pos;
  }, [campaign.cleared]);

  const previewNode = preview;

  return (
    <div className="campaign-screen">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Меню
        </button>
        <h1>Тропа испытаний</h1>
        <span className="campaign-progress-chip">
          {campaign.cleared}/{CAMPAIGN_NODES}
        </span>
      </header>

      {locked && (
        <p className="campaign-lock-banner">
          Поражение закрыло тропу до завтра. С новым днём забег начнётся с
          начала.
        </p>
      )}
      {!locked && campaign.cleared === 0 && (
        <p className="hint" style={{ margin: "0.5rem 1rem" }}>
          Забег на сегодня: 15 узлов. Новый календарный день — прогресс с нуля.
        </p>
      )}

      <div className="campaign-map-wrap">
        <img
          className="campaign-map-art"
          src="/campaign-map.jpg"
          alt="Карта испытаний"
          draggable={false}
        />

        <svg className="campaign-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline
            fill="none"
            stroke="rgba(240, 208, 96, 0.45)"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={CAMPAIGN_NODE_POS.map((p) => `${p.x},${p.y}`).join(" ")}
          />
        </svg>

        {CAMPAIGN_NODE_POS.map((pos, i) => {
          const node = i + 1;
          const cleared = node <= campaign.cleared;
          const current = node === next;
          const fightable = canFightNode(campaign, node);
          const cls = [
            "campaign-node",
            cleared ? "is-cleared" : "is-locked-red",
            current ? "is-current" : "",
            fightable ? "is-fightable" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={node}
              type="button"
              className={cls}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              disabled={!fightable}
              title={
                cleared
                  ? `Пройден · ${campaignFoeName(node)}`
                  : fightable
                    ? `Бой ${node}: ${campaignFoeName(node)}`
                    : locked
                      ? "Закрыто до завтра"
                      : "Сначала предыдущие бои"
              }
              onClick={() => setPreview(node)}
            >
              <span className="campaign-node-num">{node}</span>
              {cleared && <span className="campaign-node-flag" aria-hidden>⚑</span>}
            </button>
          );
        })}

        <div
          className="campaign-oracle"
          style={{ left: `${oraclePos.x}%`, top: `${oraclePos.y}%` }}
          title={hero.name}
        >
          <img src={orakulArtUrl(hero)} alt="" draggable={false} />
        </div>
      </div>

      <div className="campaign-milestones">
        {([5, 10, 15] as const).map((m) => {
          const done = campaign.claimed.includes(m);
          const r = CAMPAIGN_MILESTONES[m];
          return (
            <div
              key={m}
              className={`campaign-mile ${done ? "is-done" : ""}`}
            >
              <strong>{m}</strong>
              <span>
                {r.gold > 0 ? `🪙${r.gold}` : ""}
                {r.gold > 0 && r.diamonds > 0 ? " · " : ""}
                {r.diamonds > 0 ? `💎${r.diamonds}` : ""}
              </span>
              <em>{done ? "получено" : r.title}</em>
            </div>
          );
        })}
      </div>

      {previewNode != null && (
        <div
          className="overlay campaign-preview-overlay"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="campaign-preview-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Перед боем"
          >
            <p className="campaign-preview-eyebrow">Испытание {previewNode}</p>
            <h2>{campaignFoeName(previewNode)}</h2>
            <p className="hint">
              Уровень врага ≈{" "}
              <strong>{campaignFoeLevel(level, previewNode)}</strong> (ты ур.{" "}
              {level}). Чем дальше по тропе — тем жёстче колода и оракул.
            </p>
            <p className="hint">
              За бой — только опыт. Золото и алмазы на квадратах{" "}
              <strong>5 / 10 / 15</strong>.
            </p>
            {previewNode === 15 && (
              <p className="campaign-preview-warn">
                Вершина: пройти всех пятнадцать — редкий подвиг.
              </p>
            )}
            <div className="campaign-preview-actions">
              {canFightNode(campaign, previewNode) ? (
                <button
                  type="button"
                  className="primary large"
                  onClick={() => {
                    setPreview(null);
                    onAcceptFight(previewNode);
                  }}
                >
                  Принять бой
                </button>
              ) : (
                <p className="hint">
                  {locked
                    ? "После поражения — только завтра."
                    : "Сначала победи предыдущих стражей."}
                </p>
              )}
              <button
                type="button"
                className="ghost large"
                onClick={() => setPreview(null)}
              >
                Отказаться
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
