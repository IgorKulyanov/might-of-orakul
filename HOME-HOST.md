# Домашний сервер (тест) → потом VPS (чтобы не терять игроков)

Сейвы **всех** игроков лежат на твоём ПК: `server/data/users.json`.  
Сайт по-прежнему на Cloudflare Pages; друзья ходят в интернет → туннель → твой комп.

**Когда надо стабильно и с ростом** — не free Render, а свой VPS: пошагово в **[DEPLOY-VPS.md](DEPLOY-VPS.md)**.  
Переезд = копируем `users.json` → логины/колоды остаются.

## Каждый день (тест)

1. **СЕРВЕР-ДОМА.bat** — не закрывать (API + запись сейвов).
2. Туннель (не закрывать):
   - если **VPN выключен**: `ТУННЕЛЬ.bat` → `https://….trycloudflare.com`
   - если **VPN включён** (Cloudflare Tunnel падает с `argotunnel.com: no such host`):  
     **`TUNNEL-LT.bat`** → `https://….loca.lt`  
     (первый раз браузер loca.lt может попросить «Click to continue» — открой ссылку один раз)
3. Один раз (или после перезагрузки ПК):  
   Cloudflare Pages → проект → **Settings → Environment variables**  
   `VITE_API_URL` = ссылка из туннеля **без** `/` в конце → **Save** → **Deployments → Retry deployment**.
4. Друзья открывают `https://might-of-orakul.pages.dev` как раньше.

Комп 24/7 + оба окна открыты = аккаунты **не стираются**, без ожидания Render.

### VPN

Cloudflare Tunnel часто **не работает через VPN** (DNS не резолвит `argotunnel.com`).  
Либо выключи VPN на ПК только для туннеля, либо используй **`TUNNEL-LT.bat`**.

## Бэкап на диск

**БЭКАП-СЕЙВОВ.bat** → копия на Рабочий стол `\orakul-backups\`.

Или с любого места в интернете (админ-ключ из лога сервера / `server/data/admin.key`):

```
GET https://ТВОЙ-ТУННЕЛЬ/api/admin/backup
Header: X-Admin-Key: ora_....
```

Скачается `users.json` со всеми игроками.

## Потом — VPS (рекомендуется)

См. **[DEPLOY-VPS.md](DEPLOY-VPS.md)** — Beget/Timeweb ~300–500 ₽/мес, бэкапы, рост без сноса аккаунтов.

Запасной вариант: платный Render Starter + Persistent Disk (~$7–8/мес) — тоже ок, если удобнее карта зарубежья.

## Важно

- Логин — **латиница**, не имя оракула.
- Закрыл туннель → новый URL → снова правка `VITE_API_URL`.
- Не коммить `users.json` в Git (уже в `.gitignore`).
