/**
 * YGJ Daily Tracker – Formularlogik.
 * Bewusst ohne Accounts und ohne Speicherung: Die Eingaben leben nur in diesem Tab,
 * der Bild-Export ist der einzige Weg, den Tag zu behalten.
 */
import { renderDay, WEEKDAY, LONG_DATE } from './export.js';

const JOURNAL_MAX = 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const form = $('#tracker');
const dateInput = $('#date');
const journalFields = $$('[data-journal]', form);
const plans = $('#plans');
const preview = $('#preview');

let dirty = false; // es gibt Eingaben
let exported = false; // seit der letzten Änderung exportiert
let imageUrl = null;
let shareFile = null;

// In-App-Browser (Instagram, TikTok, Facebook, Android-WebView …) blockieren Downloads und oft das Teilen.
// iOS-WebViews erkennt man daran, dass "Safari/" im User-Agent fehlt (Safari, Chrome, Firefox auf iOS haben es).
const UA = navigator.userAgent;
const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IN_APP =
  /Instagram|FBAN|FBAV|FB_IAB|Snapchat|TikTok|BytedanceWebview|musical_ly|LinkedInApp|Line\/|; wv\)/i.test(UA) ||
  (IS_IOS && !/Safari\//.test(UA));

// ---------- Datum ----------

const pad = (n) => String(n).padStart(2, '0');
const toIsoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function selectedDate() {
  const [y, m, d] = dateInput.value.split('-').map(Number);
  return y ? new Date(y, m - 1, d) : new Date();
}

function renderDate() {
  const d = selectedDate();
  $('#dayWeekday').textContent = WEEKDAY.format(d);
  $('#dayDate').textContent = LONG_DATE.format(d);
}

// ---------- Eingaben ----------

/** Textareas wachsen mit dem Inhalt */
function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

/** Gemeinsames Zeichenbudget für alle acht Journal-Fragen */
function enforceBudget(active) {
  let used = journalFields.reduce((n, f) => n + f.value.length, 0);
  if (active && used > JOURNAL_MAX) {
    active.value = active.value.slice(0, active.value.length - (used - JOURNAL_MAX));
    used = JOURNAL_MAX;
  }
  const left = JOURNAL_MAX - used;
  for (const f of journalFields) f.maxLength = f.value.length + left;
  $('#budgetUsed').textContent = used.toLocaleString('en-US');
  $('#budgetFill').style.width = `${(used / JOURNAL_MAX) * 100}%`;
  $('.budget').classList.toggle('is-full', left === 0);
}

function readNumber(el) {
  const v = parseInt(el.value, 10);
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), Number(el.max)) : null;
}

function collect() {
  const radio = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
  const list = (key) => $$(`[data-list="${key}"] input`, form).map((i) => i.value.slice(0, i.maxLength).trim());
  const hours = readNumber($('#screenH'));
  const minutes = readNumber($('#screenM'));
  const rating = radio('rating');

  return {
    date: selectedDate(),
    journal: journalFields.map((f) => ({ question: f.labels[0].textContent.trim(), answer: f.value.trim() })),
    gratitude: { grateful: list('grateful'), wins: list('wins'), better: list('better') },
    screenTime: hours === null && minutes === null ? null : { hours: hours ?? 0, minutes: minutes ?? 0 },
    gym: { status: radio('gym'), minutes: readNumber($('#gymMin')) },
    meditation: { status: radio('meditation'), minutes: readNumber($('#medMin')) },
    plans: plans.value.slice(0, plans.maxLength).trim(),
    rating: rating ? Number(rating) : null,
  };
}

/** Anteil ausgefüllter Punkte (22 insgesamt) in Prozent */
function completion(d) {
  const items = [
    ...d.journal.map((j) => j.answer),
    ...d.gratitude.grateful,
    ...d.gratitude.wins,
    ...d.gratitude.better,
    d.screenTime,
    d.gym.status,
    d.meditation.status,
    d.plans,
    d.rating,
  ];
  return Math.round((items.filter(Boolean).length / items.length) * 100);
}

function update() {
  const d = collect();
  const done = completion(d);
  $('#progressValue').textContent = done;
  $('#progressFill').style.width = `${done}%`;
  $('#ratingBig').textContent = d.rating ? pad(d.rating) : '–';
  $('#ratingBig').classList.toggle('is-empty', !d.rating);
  $('#gymDuration').hidden = d.gym.status !== 'trained';
  $('#medDuration').hidden = d.meditation.status !== 'yes';
  $('#plansCount').textContent = plans.value.length;
  dirty = done > 0;
}

// ---------- Export ----------

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3000);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(async (b) => {
      if (b) return resolve(b);
      // manche Handy-Browser liefern bei großen Bildern null – dann über die Data-URL
      try {
        resolve(await (await fetch(canvas.toDataURL('image/png'))).blob());
      } catch (err) {
        reject(err);
      }
    }, 'image/png'),
  );
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function openPreview() {
  if (typeof preview.showModal === 'function') preview.showModal();
  else {
    // sehr alte Browser ohne <dialog>
    preview.setAttribute('open', '');
    preview.scrollIntoView();
  }
}

function closePreview() {
  if (typeof preview.close === 'function') preview.close();
  else preview.removeAttribute('open');
}

async function exportImage() {
  const d = collect();
  if (!completion(d)) {
    toast('Fill in at least one field first.');
    return;
  }

  const buttons = $$('[data-action="export"]');
  buttons.forEach((b) => (b.disabled = true));
  try {
    const canvas = await renderDay(d);
    const blob = await canvasToBlob(canvas);
    const name = `ygj-daily-${toIsoDate(d.date)}.png`;

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(blob);
    // Data-URL fürs Vorschaubild: Gedrückthalten → "Bild sichern" klappt damit auch in In-App-Browsern
    $('#previewImg').src = await blobToDataUrl(blob);
    const link = $('#downloadLink');
    link.href = imageUrl;
    link.download = name;

    // Am Handy ist das Teilen-Menü der Hauptweg (iOS: "Bild sichern" landet in den Fotos)
    shareFile = new File([blob], name, { type: 'image/png' });
    const canShareFiles = Boolean(navigator.canShare?.({ files: [shareFile] }));
    const shareFirst = canShareFiles && matchMedia('(pointer: coarse)').matches;
    const shareBtn = $('#shareBtn');
    shareBtn.hidden = !canShareFiles;
    shareBtn.className = `btn ${shareFirst ? 'btn-gold' : 'btn-ghost'}`;
    shareBtn.style.order = shareFirst ? '-1' : '';
    link.className = `btn ${shareFirst ? 'btn-ghost' : 'btn-gold'}`;

    $('#inAppNote').hidden = !IN_APP;
    $('#previewHint').textContent =
      IS_IOS && canShareFiles
        ? 'Tip: tap “Save / Share” and choose “Save Image” to put it in your Photos. You can also press and hold the image.'
        : 'You can also press and hold the image to save it.';

    openPreview();
  } catch (err) {
    console.error(err);
    toast(`Could not create the image (${err.name || 'error'}). Please try again.`);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function shareImage() {
  try {
    // nur die Datei teilen: mit Titel oder Text fehlt auf iOS teils "Bild sichern"
    await navigator.share({ files: [shareFile] });
    exported = true;
  } catch (err) {
    if (err.name !== 'AbortError') toast(`Sharing failed (${err.name}). Use Download or press and hold the image.`);
  }
}

async function copyLink() {
  const url = location.origin + location.pathname;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied – paste it into Safari or Chrome.');
  } catch {
    toast(url);
  }
}

function resetAll() {
  if (dirty && !confirm('Clear all answers and start over?')) return;
  form.reset();
  [...journalFields, plans].forEach(autosize);
  enforceBudget();
  update();
  exported = false;
  window.scrollTo({ top: 0 });
}

// ---------- Ereignisse ----------

form.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('[data-journal]')) enforceBudget(t);
  if (t.tagName === 'TEXTAREA') autosize(t);
  exported = false;
  update();
});

form.addEventListener('change', update);

// Zahlen beim Verlassen auf den erlaubten Bereich begrenzen
for (const el of $$('.duration input', form)) {
  el.addEventListener('blur', () => {
    if (el.value === '') return;
    el.value = readNumber(el) ?? '';
    update();
  });
}

dateInput.addEventListener('change', () => {
  if (!dateInput.value) dateInput.value = toIsoDate(new Date());
  exported = false;
  renderDate();
});

document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'export') exportImage();
  else if (action === 'reset') resetAll();
  else if (action === 'close') closePreview();
  else if (action === 'copy-link') copyLink();
});

$('#shareBtn').addEventListener('click', shareImage);

// Klick auf den abgedunkelten Hintergrund schließt die Vorschau
preview.addEventListener('click', (e) => {
  if (e.target === preview) closePreview();
});

$('#downloadLink').addEventListener('click', () => {
  exported = true;
});

window.addEventListener('beforeunload', (e) => {
  if (dirty && !exported) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- Start ----------

dateInput.value = toIsoDate(new Date());
$('#year').textContent = new Date().getFullYear();
$('#inAppBanner').hidden = !IN_APP;
renderDate();
enforceBudget();
update();
