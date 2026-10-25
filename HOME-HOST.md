# Домашний сервер (тест) → потом платный Render

Сейвы **всех** игроков лежат на твоём ПК: `server/data/users.json`.  
Сайт по-прежнему на Cloudflare Pages; друзья ходят в интернет → туннель → твой комп.

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

## Потом — платный Render (~$7–8/мес)

1. Render: план **Starter** + **Persistent Disk** на путь `/opt/render/project/src/data`  
   (или `server/data` — как смонтируешь; env `ORACUL_DATA_DIR` при необходимости).
2. Скопируй свежий `users.json` на диск Render **или**  
   `POST /api/admin/restore` с телом файла `{ "users": [ ... ] }` и заголовком админ-ключа.
3. Cloudflare Pages: `VITE_API_URL=https://твой-сервис.onrender.com` → Redeploy.
4. Домашние **СЕРВЕР-ДОМА** / **ТУННЕЛЬ** можно выключить.

Аккаунты друзей переедут вместе с `users.json`.

## Важно

- Логин — **латиница**, не имя оракула.
- Закрыл туннель → новый URL → снова правка `VITE_API_URL`.
- Не коммить `users.json` в Git (уже в `.gitignore`).
