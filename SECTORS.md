# Карта секторов — MIGHT OF ORAKUL

Корень: `C:\Users\Дядя Гарик\Desktop\MIGHT OF ORAKUL`  
Сайт: Cloudflare Pages · API/PvP: `server/` на VPS  
Правило для агента: **один сектор за раз**. Сначала этот файл, потом только файлы сектора.

Журнал действий (браузер): `window.__orakulLog` / `window.__orakulDumpLog()`  
Хранение: `localStorage.orakul_action_log` (кольцо ~400 строк). Не ломает бой.

---

## СТОП: арты карт (инцидент «чёрные карты»)

**Никогда не повторять:** в `КАРТЫ.json` поменяли `.png` → `.jpg` пачкой, а JPG на GitHub/Pages не залили → у игроков чёрные карты.

### Обязательный чеклист перед `git push` по артам

1. Менять **только** те карты, о которых просил пользователь (1–2 id), не весь JSON «заодно».
2. В коммит класть **пару**: файл в `public/cards/...` **и** поле `"art"` в `КАРТЫ.json`.
3. Проверка: `git ls-tree -r HEAD --name-only` / `origin/main` содержит **точный** путь из `"art"`. Нет файла на remote — **не** менять путь.
4. Локальные JPG без `git add` = их **нет** на сайте. Не ссылаться на них в JSON.
5. Смена расширения (png↔jpg) или имени файла = **новый URL**; бамп `CARD_ART_VER` в `src/game/cards.ts`.
6. Перед push: `git diff --stat` — если в diff десятки чужих `art:` — **откатить** лишнее из JSON.
7. После аварии: откатить `"art"` на пути, которые уже есть на Pages; потом уже аккуратно заливать JPG.

---

## Быстрый указатель

| Сектор | Зачем открывать | Главные пути |
|--------|-----------------|--------------|
| **nav** | Заставка, меню, смена экранов | `src/App.tsx`, `src/components/SplashMenu.tsx`, `src/main.tsx` |
| **auth** | Регистрация, вход, почта | `src/components/AuthScreen.tsx`, `src/game/session.ts`, `src/game/api.ts`, `server/main.ts` |
| **onboard** | Выбор школы/оракула новичка | `src/components/OnboardingScreen.tsx`, `src/game/owned.ts` (`beginWithHero`) |
| **shop** | Магазин карт, алмазы, обмен | `src/components/Collection.tsx`, `src/game/shop.ts`, `src/game/owned.ts` |
| **cabinet** | Кабинет, колода, кейс | `src/components/Cabinet.tsx`, `src/game/owned.ts` |
| **hero** | Смена/покупка оракула | `src/components/HeroSelect.tsx`, `src/game/heroes.ts`, `src/game/oracleGifts.ts` |
| **cards** | Данные карт, стоимость, школы | `src/game/cards.ts`, `КАРТЫ.json`, `public/cards/` |
| **icons** | Иконки маны/валюты | `public/ui/*.svg`, `src/components/GameIcon.tsx` |
| **battle-ui** | Экран боя, клики, FX | `src/components/Battle.tsx`, `src/components/CardView.tsx`, `src/components/ManaBar.tsx` |
| **engine** | Правила боя, ходы, AI | `src/game/engine.ts`, `src/game/mana.ts`, `src/game/battleRules.ts` |
| **bot** | Колоды бота | `src/game/botDeck.ts`, `src/game/starterDecks.ts` |
| **pvp** | Сетевой бой | `src/game/pvpClient.ts`, `pvpProtocol.ts`, `pvpValidate.ts`, `server/pvpRooms.ts` |
| **campaign** | Тропа | `src/components/CampaignMap.tsx`, `src/game/campaign.ts` |
| **arena** | Арена | `src/components/ArenaHub.tsx`, `src/game/arena.ts` |
| **progress** | XP, награды, ежедневки | `src/game/progression.ts`, `src/game/dailies.ts`, `src/components/DailyPanel.tsx` |
| **bg-art** | Фоны / заставка стихии | `public/cards/заставка_стихии.jpg`, CSS в `src/App.css`, `index.css` |
| **qa** | Автотесты без UI | `src/game/qa.ts`, `qa-pvp.ts`, `qa-meta.ts`, `scripts/` |
| **deploy** | Выкладка | `DEPLOY.md`, `scripts/deploy_*.py`, `server/deploy/` |

---

## Как искать ошибку (по нотам)

1. Спросить/назвать **сектор** (из таблицы).
2. Открыть только его файлы из таблицы.
3. В консоли браузера: `__orakulDumpLog()` — последние действия до сбоя.
4. Бой/мана/победа → сначала `engine` + `battle-ui`, не магазин.
5. Рассинхрон PvP → `pvp` + сервер, не править `engine` «вслепую» без протокола.
6. Иконка/арт → `icons` или `cards`, не трогать движок.

---

## Журнал (секторы в логе)

Теги: `nav` · `auth` · `shop` · `battle` · `engine` · `pvp` · `ui` · `error`  
Код: `src/game/actionLog.ts`
