const { env } = require('../config/env');

const RESEND_API = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html, text }) {
  if (!env.resend.apiKey) {
    const err = new Error('RESEND_API_KEY is not configured on the server.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.resend.from, to, subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Resend error: ${body.message || res.status}`);
    err.code = 'EMAIL_SEND_FAILED';
    throw err;
  }
  return body;
}

function otpEmailHtml({ name, code, expiryMinutes }) {
  const brandGreen = '#0e7a5f';
  const brandBlue = '#1d4ed8';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:32px 16px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(14,122,95,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${brandGreen},${brandBlue});padding:28px 32px;text-align:center;">
              <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.5px;">BIOSYM&nbsp;PHARMA</div>
              <div style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:2px;margin-top:4px;">SECURE VERIFICATION</div>
            </td>
          </tr>
          <tr><td style="padding:32px;">
            <div style="font-size:17px;color:#0f172a;font-weight:600;">Hello${name ? `, ${name}` : ''}</div>
            <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0 20px;">Use the verification code below to complete your sign-in. This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
            <div style="text-align:center;padding:18px;background:#f0fdf9;border:1px dashed ${brandGreen};border-radius:12px;font-size:34px;font-weight:800;letter-spacing:12px;color:${brandGreen};">${code}</div>
            <p style="font-size:12px;color:#94a3b8;margin-top:20px;">If you did not request this code, you can safely ignore this email. Never share your OTP with anyone.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function resetEmailHtml({ name, url, expiryMinutes }) {
  const brandGreen = '#0e7a5f';
  const brandBlue = '#1d4ed8';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:32px 16px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(14,122,95,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${brandGreen},${brandBlue});padding:28px 32px;text-align:center;">
              <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.5px;">BIOSYM&nbsp;PHARMA</div>
              <div style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:2px;margin-top:4px;">PASSWORD RESET</div>
            </td>
          </tr>
          <tr><td style="padding:32px;">
            <div style="font-size:17px;color:#0f172a;font-weight:600;">Hello${name ? `, ${name}` : ''}</div>
            <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0 20px;">We received a request to reset your BIOSYM account password. This link is valid for <strong>${expiryMinutes} minutes</strong>.</p>
            <div style="text-align:center;margin:20px 0;">
              <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,${brandGreen},${brandBlue});color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Reset Password</a>
            </div>
            <p style="font-size:12px;color:#94a3b8;margin-top:20px;">If you did not request this, please ignore this email — your password will not change.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function orderShell({ title, eyebrow, name, intro, rowsHtml, ctaLabel, ctaUrl, totalsHtml, note }) {
  const brandGreen = '#0e7a5f';
  const brandBlue = '#1d4ed8';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:32px 16px;">
      <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(14,122,95,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${brandGreen},${brandBlue});padding:28px 32px;text-align:center;">
              <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.5px;">BIOSYM&nbsp;PHARMA</div>
              <div style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:2px;margin-top:4px;">${eyebrow || ''}</div>
            </td>
          </tr>
          <tr><td style="padding:32px;">
            <div style="font-size:17px;color:#0f172a;font-weight:600;">${title || ''}</div>
            <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0 20px;">${intro || ''}</p>
            <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <div style="background:#f8fafc;padding:12px 16px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Items in this order</div>
              ${rowsHtml}
            </div>
            ${totalsHtml || ''}
            ${ctaLabel ? `<div style="text-align:center;margin:24px 0 8px;">
              <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,${brandGreen},${brandBlue});color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">${ctaLabel}</a>
            </div>` : ''}
            ${note ? `<p style="font-size:12px;color:#94a3b8;margin-top:16px;">${note}</p>` : ''}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function orderRowsHtml(items) {
  if (!items || !items.length) return '<div style="padding:16px;font-size:13px;color:#94a3b8;">No items.</div>';
  return items.map((it) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid #f1f5f9;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13.5px;color:#0f172a;font-weight:600;">${it.product_name}</div>
        <div style="font-size:12px;color:#94a3b8;">Qty ${it.qty}</div>
      </div>
      <div style="font-size:13.5px;color:#0f172a;font-weight:700;">₹${Number(it.price * it.qty).toFixed(2).replace(/\.00$/, '')}</div>
    </div>`).join('');
}

function totalsHtml(t) {
  return `<div style="padding:14px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:3px 0;"><span>Subtotal</span><span>₹${t.subtotal.toFixed(2).replace(/\.00$/, '')}</span></div>
    ${t.discount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:13px;color:#16a34a;padding:3px 0;"><span>Coupon (${t.appliedCoupon || ''})</span><span>− ₹${t.discount.toFixed(2).replace(/\.00$/, '')}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:3px 0;"><span>Delivery</span><span>${t.shipping === 0 ? 'FREE' : '₹' + t.shipping.toFixed(2).replace(/\.00$/, '')}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:15px;color:#0f172a;font-weight:800;padding-top:8px;border-top:1px solid #e2e8f0;margin-top:6px;"><span>Total</span><span>₹${t.total.toFixed(2).replace(/\.00$/, '')}</span></div>
  </div>`;
}

module.exports = {
  sendEmail,
  otpEmailHtml,
  resetEmailHtml,
  orderShell,
  orderRowsHtml,
  totalsHtml,
};
