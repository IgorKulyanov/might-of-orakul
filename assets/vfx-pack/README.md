# VFX-пак для боя (источник)

Сюда лежит архив анимаций с рабочего стола (`архив карт/анимация`).
Это **исходник**. В рантайм игры идут копии в `public/fx/`.

## Как пользоваться

1. Берём кадры отсюда.
2. Копируем нужное в `public/fx/<тип>/`.
3. Подключаем в `src/game/battleVfx.ts` (`SEQ` / слои).
4. Рисуем в `Battle.tsx` через `FxSpriteBurst` / слои попадания.

**Не** рисовать огонь/дым CSS-пузырями, если в паке уже есть спрайты.

## Что внутри

| Папка | Назначение |
|--------|------------|
| `PNG/Explosion` | Взрыв при попадании фаербола |
| `PNG/Black smoke` | Чёрный дым |
| `PNG/White puff` | Светлый дым/пар |
| `PNG/Flash` | Вспышка |
| `PNG (Transparent)/flame_*`, `fire_*` | Пламя |
| `PNG (Transparent)/muzzle_*` | Выстрел / ядро фаербола |
| `PNG (Transparent)/slash_*` | Режущий удар |
| `PNG (Transparent)/spark_*` | Искры |
| `lightning/` | Молния |
| `Water_Effect/` | Вода |
| `Arcane_Effect/` | Магия |
| `magic and smoke/` | Доп. магия/дым (часто spritesheet) |

## Уже в игре (`public/fx/`)

`explosion`, `smoke`, `flash`, `flame`, `muzzle`, `white_puff`, `slash`, `spark`, `water`, `lightning`, `arcane`, `scorch`
