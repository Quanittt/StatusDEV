const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// У темі листа не місце переносам рядків: вони дозволили б підмінити заголовки.
export const oneLine = (s: string, max = 150) =>
  s.replace(/\s+/g, " ").trim().slice(0, max);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface EmailContent {
  /** Назва у шапці листа: бренд власника або StatusDEV. */
  brand: string;
  brandColor?: string | null;
  heading: string;
  /** Звичайні абзаци: HTML екранується, переноси рядків зберігаються. */
  paragraphs: string[];
  /** Цитата (коментар клієнта, примітка до правок). */
  quote?: string;
  button?: { label: string; url: string };
}

const withBreaks = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");

// Повертає і HTML, і текстову версію: так лист читається і в клієнтах без HTML.
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const color =
    c.brandColor && HEX_COLOR.test(c.brandColor) ? c.brandColor : "#2563eb";
  const paragraphs = c.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1f2937">${withBreaks(p)}</p>`,
    )
    .join("");
  const quote = c.quote
    ? `<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid ${color};background:#f3f4f6;font-size:15px;line-height:1.5;color:#374151">${withBreaks(c.quote)}</blockquote>`
    : "";
  const button = c.button
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(c.button.url)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(c.button.label)}</a></p>`
    : "";

  const html = `<!doctype html><html lang="uk"><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
<div style="padding:14px 20px;background:${color};color:#ffffff;font-weight:600;font-size:16px">${escapeHtml(c.brand)}</div>
<div style="padding:20px">
<h1 style="margin:0 0 14px;font-size:20px;color:#111827">${escapeHtml(c.heading)}</h1>
${paragraphs}${quote}${button}
</div></div>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#9ca3af;text-align:center">Надіслано через StatusDEV</p>
</body></html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs,
    ...(c.quote ? ["", `> ${c.quote.replace(/\n/g, "\n> ")}`] : []),
    ...(c.button ? ["", `${c.button.label}: ${c.button.url}`] : []),
  ].join("\n");

  return { html, text };
}
