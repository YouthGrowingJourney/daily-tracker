/**
 * Zeichnet den Tag als PNG im Stil der YGJ-Instagram-Posts:
 * dunkler Verlauf mit Goldschimmer oben, Headlines in Bebas Neue (Versalien),
 * Fließtext in Lora kursiv, Original-Logo oben, Handle unten.
 *
 * Breite 1080 px, Höhe mindestens 1920 px (Story-Format), bei viel Text länger.
 */

const W = 1080;
const PAD = 90;
const CW = W - PAD * 2;
const MIN_H = 1920;
const SECTION_GAP = 110;

const C = {
  gold: '#E0C280',
  goldLine: 'rgba(224, 194, 128, 0.35)',
  white: '#FFFFFF',
  text: '#F4EEE2',
  muted: '#B5AE9F',
  tile: 'rgba(43, 43, 43, 0.55)',
  onGold: '#333333',
};

const display = (px) => `400 ${px}px "Bebas Neue", "Arial Narrow", sans-serif`;
const serif = (px, weight = 400) => `${weight} ${px}px Lora, Georgia, serif`;
const italic = (px) => `italic 400 ${px}px Lora, Georgia, serif`;

/** Versalhöhe von Bebas Neue relativ zur Schriftgröße */
const CAP = 0.7;

/** Fließtext: Lora italic 31/46 */
const BODY = { size: 31, lineHeight: 46 };

export const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
export const LONG_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// ---------- Ressourcen ----------

let logoPromise = null;

function loadLogo() {
  logoPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      logoPromise = null;
      reject(new Error('Logo konnte nicht geladen werden'));
    };
    img.src = new URL('./assets/logo-gold.png', import.meta.url).href;
  });
  return logoPromise;
}

/**
 * Lädt alle benötigten Schnitte – mit Beispieltext, damit auch latin-ext (z. B. ł, ő) geladen wird.
 * Schlägt das fehl oder dauert es zu lange (schlechtes Netz), wird mit Ersatzschriften gezeichnet.
 */
async function loadFonts(sample) {
  if (!document.fonts?.load) return;
  const text = `ABC abc 0123 ${sample}`;
  const loads = Promise.all([
    document.fonts.load(display(40), text),
    document.fonts.load(serif(30), text),
    document.fonts.load(italic(30), text),
  ]).catch(() => {});
  await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 4000))]);
}

// Messen braucht kein großes Canvas; eins für alle Exporte
let measureCtx = null;

// Graphem-Cluster, damit Emoji wie 👨‍👩‍👦 beim harten Umbruch nicht zerrissen werden
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (g) => g.segment) : [...s]);

// ---------- Text-Helfer ----------

function spacedWidth(ctx, text, spacing) {
  const chars = [...text];
  return chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
}

/** Text mit Laufweite (Canvas-letterSpacing ist nicht überall verfügbar). Gibt die Breite zurück. */
function drawSpaced(ctx, text, x, y, spacing, align = 'left') {
  const w = spacedWidth(ctx, text, spacing);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return w;
}

/** Bricht Text auf maxWidth um; Zeilenumbrüche des Nutzers bleiben erhalten, überlange Wörter werden geteilt. */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
        continue;
      }
      if (line) lines.push(line);
      let chars = graphemes(word);
      while (chars.length > 1 && ctx.measureText(chars.join('')).width > maxWidth) {
        let cut = chars.length - 1;
        while (cut > 1 && ctx.measureText(chars.slice(0, cut).join('')).width > maxWidth) cut--;
        lines.push(chars.slice(0, cut).join(''));
        chars = chars.slice(cut);
      }
      line = chars.join('');
    }
    if (line) lines.push(line);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Grundlinie der ersten Zeile eines Lora-Absatzes, vertikal mittig in der Zeilenhöhe */
function loraBaseline(top, size, lineHeight) {
  return top + (lineHeight - 1.28 * size) / 2 + 1.006 * size;
}

/** Zeichnet einen umbrochenen Lora-Absatz ab top und gibt die neue y-Position zurück. */
function paragraph(ctx, draw, text, top, x = PAD, width = CW) {
  ctx.font = italic(BODY.size);
  const lines = wrap(ctx, text, width);
  if (draw) {
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    lines.forEach((line, i) => ctx.fillText(line, x, loraBaseline(top, BODY.size, BODY.lineHeight) + i * BODY.lineHeight));
  }
  return top + lines.length * BODY.lineHeight;
}

/** Größte Bebas-Größe ≤ max, bei der text in width passt */
function fitDisplay(ctx, text, max, width) {
  let size = max;
  ctx.font = display(size);
  while (size > 24 && ctx.measureText(text).width > width) {
    size -= 2;
    ctx.font = display(size);
  }
  return size;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Werte ----------

function screenValue(s) {
  if (!s) return '–';
  const { hours: h, minutes: m } = s;
  if (!h && !m) return '0 MIN';
  if (!h) return `${m} MIN`;
  if (!m) return `${h}H`;
  return `${h}H ${m}M`;
}

function gymValue(g) {
  switch (g.status) {
    case 'trained':
      return g.minutes ? `${g.minutes} MIN` : 'TRAINED';
    case 'rest':
      return 'REST DAY';
    case 'skipped':
      return 'SKIPPED';
    default:
      return '–';
  }
}

function meditationValue(m) {
  if (m.status === 'yes') return m.minutes ? `${m.minutes} MIN` : 'YES';
  if (m.status === 'no') return 'NO';
  return '–';
}

// ---------- Layout ----------

function background(ctx, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7A6C50');
  g.addColorStop(620 / H, '#3B3833');
  g.addColorStop(1350 / H, '#2D2D2D');
  g.addColorStop(1, '#2A2A2A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Läuft einmal zum Messen (draw = false) und einmal zum Zeichnen durch dasselbe Layout.
 * Gibt das Inhaltsende zurück.
 */
function paint(ctx, d, logo, draw, H) {
  ctx.textBaseline = 'alphabetic';
  let y = 96;

  // Logo
  if (logo) {
    const lw = 230;
    const lh = (lw * logo.naturalHeight) / logo.naturalWidth;
    if (draw) ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + 64;
  }

  // Pill
  ctx.font = display(30);
  const pill = 'DAILY TRACKER';
  const pw = spacedWidth(ctx, pill, 6) + 68;
  const ph = 62;
  if (draw) {
    ctx.fillStyle = C.gold;
    roundRect(ctx, (W - pw) / 2, y, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = C.onGold;
    drawSpaced(ctx, pill, W / 2, y + ph / 2 + (30 * CAP) / 2, 6, 'center');
  }
  y += ph + 58;

  // Wochentag und Datum
  const weekday = WEEKDAY.format(d.date).toUpperCase();
  const daySize = fitDisplay(ctx, weekday, 170, CW);
  if (draw) {
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.fillText(weekday, W / 2, y + daySize * CAP);
  }
  y += daySize * CAP + 34;

  ctx.font = display(54);
  if (draw) {
    ctx.fillStyle = C.gold;
    drawSpaced(ctx, LONG_DATE.format(d.date).toUpperCase(), W / 2, y + 54 * CAP, 8, 'center');
  }
  y += 54 * CAP + 100;

  // Produktivität: große Kontur-Zahl wie die Uhrzeit in den Posts
  ctx.font = display(30);
  if (draw) {
    ctx.fillStyle = C.muted;
    drawSpaced(ctx, 'PRODUCTIVITY', W / 2, y + 30 * CAP, 7, 'center');
  }
  y += 30 * CAP + 36;

  if (d.rating) {
    const big = String(d.rating).padStart(2, '0');
    const of = '/10';
    ctx.font = display(300);
    const bigW = ctx.measureText(big).width;
    ctx.font = display(84);
    const ofW = ctx.measureText(of).width;
    const gap = 24;
    const gx = (W - bigW - gap - ofW) / 2;
    if (draw) {
      ctx.textAlign = 'left';
      ctx.font = display(300);
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = C.gold;
      ctx.strokeText(big, gx, y + 300 * CAP);
      ctx.font = display(84);
      ctx.fillStyle = C.muted;
      ctx.fillText(of, gx + bigW + gap, y + 300 * CAP);
    }
    y += 300 * CAP + 50;

    // 10 Punkte, gefüllt bis zur Bewertung
    const r = 11;
    const step = 46;
    if (draw) {
      for (let i = 0; i < 10; i++) {
        const cx = W / 2 - (step * 9) / 2 + i * step;
        ctx.beginPath();
        if (i < d.rating) {
          ctx.arc(cx, y + r, r, 0, Math.PI * 2);
          ctx.fillStyle = C.gold;
          ctx.fill();
        } else {
          ctx.arc(cx, y + r, r - 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }
    y += r * 2 + 96;
  } else {
    ctx.font = display(84);
    if (draw) {
      ctx.fillStyle = C.white;
      drawSpaced(ctx, 'NOT RATED', W / 2, y + 84 * CAP, 6, 'center');
    }
    y += 84 * CAP + 96;
  }

  // Kacheln: Bildschirmzeit, Gym, Meditation
  const tiles = [
    ['SCREEN TIME', screenValue(d.screenTime)],
    ['GYM', gymValue(d.gym)],
    ['MEDITATION', meditationValue(d.meditation)],
  ];
  const tg = 24;
  const tw = (CW - tg * 2) / 3;
  const th = 176;
  if (draw) {
    tiles.forEach(([label, value], i) => {
      const tx = PAD + i * (tw + tg);
      ctx.fillStyle = C.tile;
      roundRect(ctx, tx, y, tw, th, 24);
      ctx.fill();
      ctx.strokeStyle = C.goldLine;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = display(26);
      ctx.fillStyle = C.gold;
      drawSpaced(ctx, label, tx + tw / 2, y + 50, 5, 'center');

      fitDisplay(ctx, value, 68, tw - 36);
      ctx.fillStyle = C.white;
      ctx.textAlign = 'center';
      ctx.fillText(value, tx + tw / 2, y + 134);
    });
  }
  y += th;

  // Abschnittsüberschrift mit Goldlinie
  const section = (title) => {
    y += SECTION_GAP;
    ctx.font = display(34);
    if (draw) {
      ctx.fillStyle = C.gold;
      const w = drawSpaced(ctx, title, PAD, y + 34 * CAP, 7);
      ctx.strokeStyle = C.goldLine;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD + w + 28, y + (34 * CAP) / 2);
      ctx.lineTo(W - PAD, y + (34 * CAP) / 2);
      ctx.stroke();
    }
    y += 34 * CAP + 48;
  };

  // Journal: nur beantwortete Fragen
  const answered = d.journal.filter((j) => j.answer);
  if (answered.length) {
    section('JOURNAL');
    answered.forEach((j, i) => {
      if (i) y += 48;
      ctx.font = display(40);
      const qLines = wrap(ctx, j.question.toUpperCase(), CW);
      if (draw) {
        ctx.fillStyle = C.white;
        ctx.textAlign = 'left';
        qLines.forEach((line, k) => ctx.fillText(line, PAD, y + 40 * CAP + k * 44));
      }
      y += 40 * CAP + (qLines.length - 1) * 44 + 20;
      y = paragraph(ctx, draw, j.answer, y);
    });
  }

  // Dankbarkeit und Rückblick
  const lists = [
    ['GRATEFUL FOR', d.gratitude.grateful],
    ['DONE WELL TODAY', d.gratitude.wins],
    ['COULD GO BETTER', d.gratitude.better],
  ]
    .map(([title, items]) => [title, items.filter(Boolean)])
    .filter(([, items]) => items.length);

  if (lists.length) {
    section('GRATITUDE');
    lists.forEach(([title, items], i) => {
      if (i) y += 44;
      ctx.font = display(40);
      if (draw) {
        ctx.fillStyle = C.white;
        ctx.textAlign = 'left';
        ctx.fillText(title, PAD, y + 40 * CAP);
      }
      y += 40 * CAP + 18;
      items.forEach((item, n) => {
        if (n) y += 10;
        if (draw) {
          ctx.font = display(34);
          ctx.fillStyle = C.gold;
          drawSpaced(ctx, String(n + 1).padStart(2, '0'), PAD, loraBaseline(y, BODY.size, BODY.lineHeight), 2);
        }
        y = paragraph(ctx, draw, item, y, PAD + 64, CW - 64);
      });
    });
  }

  // Pläne für morgen
  if (d.plans) {
    section('TOMORROW');
    y = paragraph(ctx, draw, d.plans, y);
  }

  // Fußzeile
  if (draw) {
    ctx.font = display(30);
    ctx.fillStyle = C.muted;
    drawSpaced(ctx, '@YOUTHGROWINGJOURNEY', PAD, H - 80, 6);
    ctx.fillStyle = C.gold;
    drawSpaced(ctx, 'DAILY TRACKER', W - PAD, H - 80, 6, 'right');
  }

  return y;
}

/** Erzeugt das Canvas mit dem fertigen Bild. Der Aufrufer gibt es nach dem Export wieder frei. */
export async function renderDay(d) {
  const sample = [
    ...d.journal.flatMap((j) => [j.question, j.answer]),
    ...d.gratitude.grateful,
    ...d.gratitude.wins,
    ...d.gratitude.better,
    d.plans,
  ].join(' ');
  await loadFonts(sample);
  const logo = await loadLogo().catch(() => null);

  measureCtx ??= document.createElement('canvas').getContext('2d');
  const contentEnd = paint(measureCtx, d, logo, false, MIN_H);
  const H = Math.max(MIN_H, Math.ceil(contentEnd + 220));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  background(ctx, H);
  paint(ctx, d, logo, true, H);
  return canvas;
}
