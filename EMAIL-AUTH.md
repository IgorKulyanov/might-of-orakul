# Регистрация по почте

Новые игроки указывают **почту + пароль**, получают **код на email**, подтверждают — только потом вход в игру.  
**Ник оракула** выбирается после входа (онбординг), не на экране регистрации.

Вход: **почта** (новые) или **старый логин** (аккаунты без почты / до перехода).

## Что настроить на VPS

В `/etc/orakul/` или в unit `orakul-api.service` (Environment=…):

```bash
MAIL_FROM=Might of Orakul <noreply@ТВОЙ-ДОМЕН.ru>
```

И **один** из каналов:

### A) Resend (проще)
1. https://resend.com → API key  
2. `RESEND_API_KEY=re_....`  
3. Домен в Resend подтвердить (DNS)

### B) SMTP (Яндекс / Mail.ru / свой)
```bash
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=твой@yandex.ru
SMTP_PASS=пароль_приложения
MAIL_FROM=Might of Orakul <твой@yandex.ru>
```

На сервере: `npm install nodemailer --prefix /opt/orakul/server`  
(уже в зависимостях при свежем деплое `package.json`).

Потом: `systemctl restart orakul-api`

Проверка:  
`curl -s http://127.0.0.1:8787/api/health` → `"mail": true`

## Тест без писем
```bash
Environment=ORACUL_MAIL_DEV=1
```
Код пишется в лог сервера и отдаётся в JSON как `devCode` (только для отладки).

## Поведение
- Без подтверждённой почты вход → «Подтверди почту».
- Повторный вход **не сбрасывает** token других вкладок (чат меньше «вылетает»).
- Одна почта = один аккаунт.
- Отдельного «логина» при регистрации больше нет — сервер сам заводит внутренний id из части почты до @.
