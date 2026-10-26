# VPS: чтобы игроки не пропадали (и можно было расти)

Сайт остаётся на **Cloudflare Pages**.  
На VPS крутится только **API** (логины, пароли, сейвы, чат, PvP).

Переезд = перенёс файл `users.json` → **никто не теряется**.

---

## 1) Купить VPS (один раз)

Подойдёт любой из: **Beget**, **Timeweb**, **FirstVDS**, **VDSina**.

Минимум на старт:

- 1 vCPU  
- 1 ГБ RAM  
- 10–20 ГБ SSD  
- Ubuntu 22.04 / 24.04  
- регион: Москва или СПб  

Ориентир: **300–500 ₽/мес**.

В панели получишь:

- IP (например `185.x.x.x`)  
- логин `root` (или `ubuntu`)  
- пароль или SSH-ключ  

**Напиши мне IP** (пароль лучше не в чат — скажи «доступ есть», настроим по шагам).

---

## 2) Что ставим на сервер (я/ты по SSH)

Команды уже лежат в `server/deploy/`:

```bash
# на VPS под root:
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git
git clone https://github.com/IgorKulyanov/might-of-orakul.git /opt/orakul
cd /opt/orakul/server
npm install
mkdir -p /var/lib/orakul/data /var/backups/orakul
# сюда потом кладём users.json
cp deploy/orakul-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now orakul-api
```

Проверка:

```bash
curl -s http://127.0.0.1:8787/api/health
```

Должно быть `"ok":true`.

Открой в панели VPS / firewall порт **8787** (TCP) с интернета.

API снаружи: `http://ТВОЙ_IP:8787`  
(позже можно повесить домен + HTTPS через nginx — не обязательно в день 1).

---

## 3) Перенос игроков (самое важное)

На компе свежий сейв:

1. Запусти **БЭКАП-СЕЙВОВ.bat**  
   или возьми `MIGHT OF ORAKUL\server\data\users.json`

2. Залей на VPS:

```bash
# с твоего ПК (PowerShell), подставь IP:
scp "C:\Users\Дядя Гарик\Desktop\MIGHT OF ORAKUL\server\data\users.json" root@ТВОЙ_IP:/var/lib/orakul/data/users.json
```

3. На VPS:

```bash
chown -R root:root /var/lib/orakul/data
systemctl restart orakul-api
curl -s http://127.0.0.1:8787/api/health
```

В ответе смотри `"users": N` — число аккаунтов.

---

## 4) Привязать сайт

Cloudflare Pages → проект **might-of-orakul** → Settings → Environment variables:

```
VITE_API_URL=http://ТВОЙ_IP:8787
```

(без `/` в конце) → Save → **Retry deployment**.

Друзья заходят как раньше на `https://might-of-orakul.pages.dev`.

Домашние **СЕРВЕР-ДОМА** / **ТУННЕЛЬ** и free Render можно выключить.

---

## 5) Бэкапы каждый день (чтобы снова не потерять)

На VPS cron раз в сутки копирует базу:

```bash
cp /opt/orakul/server/deploy/backup.sh /usr/local/bin/orakul-backup.sh
chmod +x /usr/local/bin/orakul-backup.sh
crontab -e
# добавь строку:
15 4 * * * /usr/local/bin/orakul-backup.sh
```

Копии: `/var/backups/orakul/users-YYYY-MM-DD.json` (хранит ~14 дней).

Раз в неделю скачивай свежий файл себе на ПК (как **БЭКАП-СЕЙВОВ**).

---

## 6) Как расти потом (без сноса людей)

| Игроков | Действие |
|--------|----------|
| 10–50 | текущий мелкий VPS |
| 100–300 | в панели «увеличить RAM» (данные на диске остаются) |
| 1000+ | перенос `users.json` на больший VPS **или** SQLite/Postgres + импорт — аккаунты едут с файлом |

Правило: **новый сервер = сначала копируем `users.json`, потом переключаем `VITE_API_URL`.**  
Никогда не включаем «пустой» API для боевого сайта.

---

## Чеклист

- [ ] Куплен VPS Ubuntu, есть IP  
- [ ] API слушает `:8787`, `/api/health` ок  
- [ ] Залит `users.json`, в health верное число users  
- [ ] В Cloudflare `VITE_API_URL` = `http://IP:8787`, redeploy  
- [ ] Вход старым логином/паролем работает  
- [ ] Включён суточный backup.sh  
- [ ] Free Render / домашний туннель выключены  

Когда будет IP — пиши «IP вот …, доступ есть» — добьём до рабочего входа вместе.
