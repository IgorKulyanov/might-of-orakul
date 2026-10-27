/**
 * Отправка писем: Resend API и/или SMTP (nodemailer).
 *
 * Env:
 *   MAIL_FROM=Might of Orakul <noreply@yourdomain.ru>
 *   RESEND_API_KEY=re_...
 *   SMTP_HOST=smtp.yandex.ru  SMTP_PORT=465  SMTP_USER=...  SMTP_PASS=...
 *   ORACUL_MAIL_DEV=1 — не слать, код в лог (+ в ответ API для тестов)
 */

function fromAddress() {
  return String(process.env.MAIL_FROM || "").trim();
}

export function mailConfigured() {
  if (process.env.ORACUL_MAIL_DEV === "1") return true;
  if (!fromAddress()) return false;
  if (String(process.env.RESEND_API_KEY || "").trim()) return true;
  if (String(process.env.SMTP_HOST || "").trim()) return true;
  return false;
}

export function mailDevMode() {
  return process.env.ORACUL_MAIL_DEV === "1";
}

export function sanitizeEmail(raw) {
  const e = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "";
  return e;
}

export function makeVerifyCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendViaResend(to, subject, text) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

async function sendViaSmtp(to, subject, text) {
  const host = String(process.env.SMTP_HOST || "").trim();
  if (!host) return false;
  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch {
    throw new Error(
      "Для SMTP: npm install nodemailer --prefix server",
    );
  }
  const port = Number(process.env.SMTP_PORT || 465);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });
  await transporter.sendMail({
    from: fromAddress() || user,
    to,
    subject,
    text,
  });
  return true;
}

/** @returns {{ ok: true, devCode?: string } | { ok: false, error: string }} */
export async function sendVerifyEmail(toRaw, code) {
  const to = sanitizeEmail(toRaw);
  if (!to) return { ok: false, error: "Некорректный email" };

  const subject = "Might of Orakul — код подтверждения";
  const text =
    `Код подтверждения: ${code}\n\n` +
    `Действует 15 минут. Если это не ты — просто игнорируй письмо.\n`;

  if (mailDevMode()) {
    console.log(`[mail:dev] → ${to} code=${code}`);
    return { ok: true, devCode: code };
  }

  if (!mailConfigured()) {
    return {
      ok: false,
      error: "Почта на сервере не настроена (MAIL_FROM + Resend или SMTP)",
    };
  }

  try {
    if (await sendViaResend(to, subject, text)) return { ok: true };
    if (await sendViaSmtp(to, subject, text)) return { ok: true };
    return {
      ok: false,
      error: "Нет рабочего канала отправки (Resend/SMTP)",
    };
  } catch (e) {
    console.error("[mail] send fail:", e?.message || e);
    return {
      ok: false,
      error: "Не удалось отправить письмо. Попробуй позже.",
    };
  }
}
