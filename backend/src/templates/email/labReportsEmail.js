/**
 * Email template: lab reports delivered as a single .zip attachment.
 *
 * Table-based layout with inline styles — the only thing Gmail/Outlook render reliably.
 * Brand colours follow the app's green palette. English only (per product decision).
 */

const BRAND = {
  name: process.env.REPORT_EMAIL_BRAND_NAME || 'Shiv Agri Consultancy',
  website: process.env.PUBLIC_APP_URL || 'https://shivagri.com',
  supportPhone: process.env.REPORT_EMAIL_SUPPORT_PHONE || '',
  supportEmail: process.env.REPORT_EMAIL_SUPPORT_EMAIL || '',
  primary: '#2e7d32',
  primaryLight: '#e8f5e9',
  text: '#1f2933',
  muted: '#52606d',
  border: '#e4e7eb'
};

const TYPE_LABELS = {
  soil: 'Soil Testing',
  water: 'Water Testing',
  fertilizer: 'Fertilizer Recommendation'
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * @param {object} params
 * @param {'soil'|'water'|'fertilizer'} params.sampleType
 * @param {Array<{ sampleNumber: string, farmerName: string, farmsName: string, sessionDate: string }>} params.reports
 * @param {string} params.zipFileName
 * @param {string} [params.sentByName]
 * @returns {{ subject: string, html: string }}
 */
function buildLabReportsEmail({ sampleType, reports, zipFileName, sentByName }) {
  const typeLabel = TYPE_LABELS[sampleType] || 'Lab';
  const count = reports.length;
  const plural = count === 1 ? 'report' : 'reports';
  const subject = `${BRAND.name} — ${count} ${typeLabel} ${plural}`;

  const rows = reports.map((r, i) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:13px;">${i + 1}</td>
            <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">${escapeHtml(r.sampleNumber || '—')}</td>
            <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">${escapeHtml(r.farmerName || '—')}</td>
            <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:13px;">${escapeHtml(r.farmsName || '—')}</td>
          </tr>`).join('');

  const contactBits = [
    BRAND.supportPhone && `Phone: ${escapeHtml(BRAND.supportPhone)}`,
    BRAND.supportEmail && `Email: <a href="mailto:${escapeHtml(BRAND.supportEmail)}" style="color:${BRAND.primary};text-decoration:none;">${escapeHtml(BRAND.supportEmail)}</a>`
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};">
          <tr>
            <td style="background:${BRAND.primary};padding:20px 24px;">
              <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">${escapeHtml(BRAND.name)}</div>
              <div style="color:#c8e6c9;font-size:13px;margin-top:2px;">${escapeHtml(typeLabel)} Reports</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 12px;color:${BRAND.text};font-size:15px;line-height:1.55;">Hello,</p>
              <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.55;">
                Please find attached <strong>${count} ${escapeHtml(typeLabel.toLowerCase())} ${plural}</strong>
                from ${escapeHtml(BRAND.name)}. All reports are bundled into a single ZIP file.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.primaryLight};border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td style="padding:12px 16px;color:${BRAND.text};font-size:13px;">
                    📎 <strong>${escapeHtml(zipFileName)}</strong><br>
                    <span style="color:${BRAND.muted};">Unzip the file to open each PDF report.</span>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.border};border-radius:8px;border-collapse:separate;overflow:hidden;">
                <tr style="background:#f8fafb;">
                  <th align="left" style="padding:10px 12px;color:${BRAND.muted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid ${BRAND.border};">#</th>
                  <th align="left" style="padding:10px 12px;color:${BRAND.muted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid ${BRAND.border};">Sample No.</th>
                  <th align="left" style="padding:10px 12px;color:${BRAND.muted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid ${BRAND.border};">Farmer</th>
                  <th align="left" style="padding:10px 12px;color:${BRAND.muted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid ${BRAND.border};">Farm</th>
                </tr>${rows}
              </table>

              <p style="margin:20px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.55;">
                For questions about these results, simply reply to this email${BRAND.supportPhone ? ' or call us' : ''}.
              </p>
              <p style="margin:16px 0 0;color:${BRAND.text};font-size:14px;">
                Regards,<br><strong>${escapeHtml(BRAND.name)}</strong>${sentByName ? `<br><span style="color:${BRAND.muted};font-size:13px;">Sent by ${escapeHtml(sentByName)}</span>` : ''}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid ${BRAND.border};background:#fafbfc;color:${BRAND.muted};font-size:12px;line-height:1.5;">
              <a href="${escapeHtml(BRAND.website)}" style="color:${BRAND.primary};text-decoration:none;font-weight:600;">${escapeHtml(BRAND.website.replace(/^https?:\/\//, ''))}</a>
              ${contactBits ? `<br>${contactBits}` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

module.exports = { buildLabReportsEmail, TYPE_LABELS };
