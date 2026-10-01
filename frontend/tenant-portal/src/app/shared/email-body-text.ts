export function renderEmailBody(value: string | null | undefined, values: Record<string, string> = {}): string {
  let rendered = String(value ?? '');
  for (const [key, replacement] of Object.entries(values)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rendered = rendered.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), replacement || '');
  }
  if (values['tenantLogoUrl']) {
    rendered = rendered.replace(/cid:tenant-logo/gi, values['tenantLogoUrl']);
  }
  return rendered;
}

export function emailBodyText(value: string | null | undefined, values: Record<string, string> = {}): string {
  const source = renderEmailBody(value, values).trim();
  if (!source || !/<[a-z][\s\S]*>/i.test(source)) {
    return source;
  }
  if (typeof DOMParser === 'undefined') {
    return source
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  }

  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script, style, head').forEach((element) => element.remove());
  document.querySelectorAll('br').forEach((element) => element.replaceWith(document.createTextNode('\n')));
  document.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6').forEach((element) => {
    element.append(document.createTextNode('\n'));
  });
  return (document.body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function emailPreviewDocument(value: string | null | undefined, values: Record<string, string> = {}): string {
  const source = renderEmailBody(value, values).trim();
  if (!source) {
    return '<!doctype html><html><body><p>No message body was recorded.</p></body></html>';
  }
  if (typeof DOMParser === 'undefined') {
    return `<!doctype html><html><body><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;">${escapeHtml(source)}</pre></body></html>`;
  }

  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script, noscript, iframe, object, embed, form, input, button, textarea, select, base').forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const content = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || ((name === 'href' || name === 'src') && (content.startsWith('javascript:') || content.startsWith('data:text/html')))) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'viewport');
  meta.setAttribute('content', 'width=device-width, initial-scale=1');
  document.head.prepend(meta);
  const style = document.createElement('style');
  style.textContent = 'html,body{min-height:100%;}body{margin:0;}img{max-width:100%;height:auto;}table{max-width:100%;}';
  document.head.append(style);
  return '<!doctype html>' + document.documentElement.outerHTML;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
