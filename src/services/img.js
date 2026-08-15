const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

function clampHue(h) {
  const n = parseInt(h, 10);
  if (Number.isNaN(n)) return 160;
  return ((n % 360) + 360) % 360;
}

function pill(hue, x, y, w, h, rx, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
}

function productArt(hue) {
  const h = clampHue(hue);
  const accent = hsl(h, 62, 40);
  const accentDark = hsl(h, 62, 30);
  const accentLight = hsl(h, 70, 92);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accentLight}"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#f8fafc"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="rgba(15,23,42,0.14)"/>
    </filter>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <circle cx="60" cy="60" r="120" fill="#ffffff" opacity="0.35"/>
  <circle cx="350" cy="360" r="150" fill="${accent}" opacity="0.08"/>
  <g filter="url(#shadow)">
    <rect x="95" y="80" width="210" height="240" rx="20" fill="url(#card)" stroke="#e2e8f0"/>
    <rect x="95" y="80" width="210" height="64" rx="20" fill="${accent}"/>
    <rect x="95" y="124" width="210" height="20" fill="${accent}"/>
    <rect x="130" y="112" width="90" height="10" rx="5" fill="#ffffff" opacity="0.9"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const px = 120 + col * 82;
      const py = 168 + row * 44;
      const shade = i === 0 ? accent : hsl(h, 58, 52);
      const lighter = i === 0 ? accentDark : hsl(h, 55, 60);
      return pill(h, px, py, 62, 30, 8, shade, `stroke="${lighter}" stroke-width="2"`)
        + `<circle cx="${px + 20}" cy="${py + 15}" r="4" fill="#ffffff" opacity="0.5"/>`;
    }).join('')}
    <rect x="120" y="292" width="160" height="10" rx="5" fill="#cbd5e1"/>
    <rect x="140" y="308" width="120" height="8" rx="4" fill="#e2e8f0"/>
  </g>
</svg>`;
}

function categoryArt(hue, icon) {
  const h = clampHue(hue);
  const accent = hsl(h, 62, 42);
  const accentLight = hsl(h, 70, 92);
  const dark = hsl(h, 62, 30);

  const iconMap = {
    thermometer: `
      <rect x="182" y="130" width="36" height="140" rx="18" fill="#ffffff" stroke="#cbd5e1"/>
      <rect x="190" y="150" width="20" height="60" rx="10" fill="${accent}"/>
      <circle cx="200" cy="230" r="12" fill="${accent}"/>`,
    pill: `
      <rect x="150" y="170" width="70" height="60" rx="30" fill="${accent}"/>
      <rect x="180" y="170" width="70" height="60" rx="30" fill="${dark}"/>
      <circle cx="170" cy="200" r="5" fill="#ffffff" opacity="0.6"/>`,
    vitamin: `
      <rect x="130" y="150" width="140" height="100" rx="16" fill="#ffffff" stroke="#e2e8f0"/>
      <circle cx="200" cy="200" r="30" fill="${accent}"/>
      <circle cx="200" cy="200" r="14" fill="#ffffff" opacity="0.85"/>`,
    syrup: `
      <rect x="160" y="170" width="80" height="110" rx="14" fill="#ffffff" stroke="#e2e8f0"/>
      <rect x="176" y="186" width="48" height="70" rx="10" fill="${accent}"/>
      <rect x="150" y="160" width="100" height="16" rx="8" fill="${accent}"/>`,
    stomach: `
      <rect x="150" y="160" width="100" height="80" rx="26" fill="${accent}"/>
      <rect x="176" y="240" width="48" height="16" rx="6" fill="${dark}"/>`,
    droplet: `
      <path d="M200 140 Q240 210 200 250 Q160 210 200 140 Z" fill="${accent}"/>`,
    glucose: `
      <rect x="150" y="160" width="100" height="80" rx="10" fill="#ffffff" stroke="#e2e8f0"/>
      <path d="M165 210 L185 180 L197 198 L212 168 L232 210 Z" fill="${accent}"/>`,
    baby: `
      <circle cx="200" cy="190" r="30" fill="${accent}"/>
      <circle cx="200" cy="235" r="34" fill="#ffffff" stroke="#e2e8f0"/>
      <path d="M188 250 q12 10 24 0" stroke="${accent}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  };

  const body = iconMap[icon] || iconMap.pill;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accentLight}"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="rgba(15,23,42,0.12)"/>
    </filter>
  </defs>
  <rect width="400" height="300" fill="url(#bg)"/>
  <circle cx="360" cy="20" r="90" fill="${accent}" opacity="0.07"/>
  <g filter="url(#shadow)">${body}</g>
</svg>`;
}

function logoMark() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0e7a5f"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#lg)"/>
  <path d="M14 30 L21 17 L25.5 25 L30 17 L37 30" stroke="#ffffff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="17" r="1.8" fill="#ffffff"/>
</svg>`;
}

function serve(req, res) {
  const { kind, spec } = req.params;
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  if (kind === 'product') {
    return res.send(productArt(spec));
  }
  if (kind === 'category') {
    const [hue, icon] = spec.split('-');
    return res.send(categoryArt(hue || 160, icon || 'pill'));
  }
  res.status(404).end('Not found');
}

module.exports = { serve, productArt, categoryArt, logoMark };
