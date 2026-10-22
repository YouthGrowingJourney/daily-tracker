/**
 * YGJ Daily Tracker – Formularlogik.
 * Bewusst ohne Accounts und ohne Speicherung: Die Eingaben leben nur in diesem Tab,
 * der Bild-Export ist der einzige Weg, den Tag zu behalten.
 */
import { renderDay, WEEKDAY, LONG_DATE } from './export.js';
import { detectEnv, escapeLink, encodeState, decodeState } from './handoff.js';

const JOURNAL_MAX = 1000;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const form = $('#tracker');
const dateInput = $('#date');
const journalFields = $$('[data-journal]', form);
const listInputs = $$('[data-list] input', form);
const plans = $('#plans');
const preview = $('#preview');

const ENV = detectEnv(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);

let dirty = false; // es gibt Eingaben
let exported = false; // seit der letzten Änderung exportiert
let leaving = false; // Wechsel in den System-Browser läuft, keine Rückfrage beim Verlassen
let handoffActive = false; // Eingaben stehen im Fragment der Adresse (nur im In-App-Browser)
let imageUrl = null;
let shareFile = null;

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

/**
 * Gemeinsames Zeichenbudget für alle acht Journal-Fragen.
 * Überzählige Zeichen werden an der Einfügestelle entfernt, nicht am Textende.
 */
function enforceBudget(active) {
  let used = journalFields.reduce((n, f) => n + f.value.length, 0);
  if (active && used > JOURNAL_MAX) {
    let excess = used - JOURNAL_MAX;
    const end = active.selectionEnd ?? active.value.length;
    const cut = Math.max(0, end - excess);
    active.value = active.value.slice(0, cut) + active.value.slice(end);
    excess -= end - cut;
    if (excess > 0) active.value = active.value.slice(0, active.value.length - excess);
    active.setSelectionRange(cut, cut);
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

const checkedValue = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value ?? null;

function setChecked(name, value) {
  for (const radio of $$(`input[name="${name}"]`, form)) radio.checked = radio.value === value;
}

function collect() {
  const list = (key) => $$(`[data-list="${key}"] input`, form).map((i) => i.value.slice(0, i.maxLength).trim());
  const hours = readNumber($('#screenH'));
  const minutes = readNumber($('#screenM'));
  const rating = checkedValue('rating');

  return {
    date: selectedDate(),
    journal: journalFields.map((f) => ({ question: f.labels[0].textContent.trim(), answer: f.value.trim() })),
    gratitude: { grateful: list('grateful'), wins: list('wins'), better: list('better') },
    screenTime: hours === null && minutes === null ? null : { hours: hours ?? 0, minutes: minutes ?? 0 },
    gym: { status: checkedValue('gym'), minutes: readNumber($('#gymMin')) },
    meditation: { status: checkedValue('meditation'), minutes: readNumber($('#medMin')) },
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
  // nach "Open in browser" bleibt der Link aktuell, falls man doch das App-Menü nimmt
  if (handoffActive) history.replaceState(null, '', handoffLink(false));
}

// ---------- Übergabe an den System-Browser ----------

/** Alle Eingaben als kompaktes Objekt (e = nach dem Öffnen direkt exportieren) */
function snapshot(autoExport) {
  return {
    v: 1,
    e: autoExport ? 1 : 0,
    date: dateInput.value,
    j: journalFields.map((f) => f.value),
    l: listInputs.map((i) => i.value),
    s: [$('#screenH').value, $('#screenM').value],
    g: [checkedValue('gym') ?? '', $('#gymMin').value],
    m: [checkedValue('meditation') ?? '', $('#medMin').value],
    p: plans.value,
    r: checkedValue('rating') ?? '',
  };
}

/** Eingaben aus einem Übergabe-Link übernehmen; Werte werden geprüft, weil Links von überall kommen können */
function applySnapshot(s) {
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.date)) dateInput.value = s.date;
  let left = JOURNAL_MAX;
  journalFields.forEach((f, i) => {
    f.value = str(s.j?.[i], left);
    left -= f.value.length;
  });
  listInputs.forEach((input, i) => (input.value = str(s.l?.[i], input.maxLength)));
  $('#screenH').value = str(s.s?.[0], 4);
  $('#screenM').value = str(s.s?.[1], 4);
  setChecked('gym', s.g?.[0]);
  $('#gymMin').value = str(s.g?.[1], 4);
  setChecked('meditation', s.m?.[0]);
  $('#medMin').value = str(s.m?.[1], 4);
  plans.value = str(s.p, plans.maxLength);
  setChecked('rating', s.r);
  for (const el of $$('.duration input', form)) if (el.value !== '') el.value = readNumber(el) ?? '';
  renderDate();
  [...journalFields, plans].forEach(autosize);
  enforceBudget();
  update();
}

function handoffLink(autoExport) {
  const url = new URL(location.pathname, location.origin);
  if (dirty) url.hash = `d=${encodeState(snapshot(autoExport))}`;
  return url.href;
}

/** Liest #d=… beim Laden, übernimmt die Eingaben und entfernt sie sofort aus der Adresszeile */
function restoreFromLink() {
  const match = /^#d=([\w-]+)$/.exec(location.hash);
  if (!match) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const state = decodeState(match[1]);
    if (state?.v !== 1) throw new Error('unknown version');
    applySnapshot(state);
    return state;
  } catch {
    toast('This link could not be read.');
    return null;
  }
}

function openInBrowser(autoExport) {
  const target = handoffLink(autoExport);
  // steht auch in der Adresse, damit „Im Browser öffnen“ aus dem App-Menü die Eingaben mitnimmt
  history.replaceState(null, '', target);
  handoffActive = dirty;
  const { href, popup } = escapeLink(ENV, target);
  leaving = true;
  if (popup) window.open(href, '_blank');
  else location.href = href;
  // Ist die Seite danach noch sichtbar, hat die App den Wechsel blockiert → Anleitung zeigen
  setTimeout(() => {
    leaving = false;
    if (document.visibilityState === 'visible') $$('.notice-help').forEach((el) => (el.hidden = false));
  }, 1500);
}

async function copyLink() {
  const url = handoffLink(false);
  try {
    await navigator.clipboard.writeText(url);
    toast(dirty ? 'Link copied – paste it into Safari or Chrome. Your entries come with it.' : 'Link copied – paste it into Safari or Chrome.');
  } catch {
    // Zwischenablage gesperrt (häufig in In-App-Browsern): Link zum Kopieren anzeigen
    window.prompt('Copy this link and open it in Safari or Chrome:', url);
  }
}

// ---------- Export ----------

let toastTimer;
function toast(message) {
  const el = $('#toast');
  // die offene Vorschau liegt in der obersten Ebene; dort muss der Hinweis hin, sonst ist er verdeckt
  const host = preview.open ? preview : document.body;
  if (el.parentElement !== host) host.append(el);
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4000);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob?.size ? resolve(blob) : reject(new Error('not enough memory'))),
      'image/png',
    ),
  );
}

function openPreview() {
  if (typeof preview.showModal === 'function') {
    if (!preview.open) preview.showModal();
  } else {
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
    let blob;
    try {
      blob = await canvasToBlob(canvas);
    } finally {
      // Canvas-Speicher sofort freigeben: Handy-Browser stürzen sonst nach ein paar Exporten ab
      canvas.width = 0;
      canvas.height = 0;
    }
    const name = `ygj-daily-${toIsoDate(d.date)}.png`;

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(blob);
    $('#previewImg').src = imageUrl;
    const link = $('#downloadLink');
    link.href = imageUrl;
    link.download = name;

    // Am Handy ist das Teilen-Menü der Hauptweg (iOS: „Bild sichern“ landet in den Fotos)
    shareFile = new File([blob], name, { type: 'image/png' });
    const canShareFiles = Boolean(navigator.canShare?.({ files: [shareFile] }));
    const shareFirst = canShareFiles && !ENV.inApp && matchMedia('(pointer: coarse)').matches;
    const shareBtn = $('#shareBtn');
    shareBtn.hidden = !canShareFiles;
    shareBtn.className = `btn ${shareFirst ? 'btn-gold' : 'btn-ghost'}`;
    shareBtn.style.order = shareFirst ? '-1' : '';
    link.className = `btn ${shareFirst ? 'btn-ghost' : 'btn-gold'}`;
    // In-App-Browser blockieren Downloads immer; dort führt der Weg über den System-Browser
    link.hidden = ENV.inApp;
    $('.preview-actions').hidden = link.hidden && shareBtn.hidden;
    $('#inAppNote').hidden = !ENV.inApp;

    const hint = $('#previewHint');
    hint.hidden = ENV.inApp;
    hint.textContent =
      ENV.ios && canShareFiles
        ? 'Tip: tap “Save / Share” and choose “Save Image” to put it in your Photos. You can also press and hold the image.'
        : 'You can also press and hold the image to save it.';

    openPreview();
  } catch (err) {
    console.error(err);
    toast(`Could not create the image (${err.message || err.name}). Close other tabs and try again.`);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function shareImage() {
  try {
    // nur die Datei teilen: mit Titel oder Text fehlt auf iOS teils „Bild sichern“
    await navigator.share({ files: [shareFile] });
    exported = true;
  } catch (err) {
    if (err.name !== 'AbortError') toast(`Sharing failed (${err.name}). Use Download or press and hold the image.`);
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
  // während der Wortvorschläge der Tastatur (IME) nicht eingreifen, sonst verdoppelt Android Text
  if (t.matches('[data-journal]') && !e.isComposing) enforceBudget(t);
  if (t.tagName === 'TEXTAREA') autosize(t);
  exported = false;
  update();
});

form.addEventListener('compositionend', (e) => {
  if (!e.target.matches('[data-journal]')) return;
  enforceBudget(e.target);
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
  update();
});

document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'export') exportImage();
  else if (action === 'reset') resetAll();
  else if (action === 'close') closePreview();
  else if (action === 'copy-link') copyLink();
  else if (action === 'open-browser') openInBrowser(false);
  else if (action === 'open-browser-export') openInBrowser(true);
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
  if (dirty && !exported && !leaving) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- Start ----------

dateInput.value = toIsoDate(new Date());
$('#year').textContent = new Date().getFullYear();
$('#inAppBanner').hidden = !ENV.inApp;
for (const el of $$('[data-app-name]')) el.textContent = ENV.app ? `${ENV.app}'s browser` : 'This in-app browser';
renderDate();
enforceBudget();
update();

const restored = restoreFromLink();
if (restored?.e) {
  // kam aus „Open in browser“ in der Vorschau: Bild direkt wieder erzeugen
  exportImage().then(() => toast('Your entries are back – save your image now.'));
} else if (restored) {
  toast('Your entries are back.');
}
