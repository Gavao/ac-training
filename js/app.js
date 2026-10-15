// AC Training: schede di allenamento importate, registro dei pesi serie per serie, progressi e misure.
// Tutti i dati restano nel telefono (IndexedDB); il backup è un file che si salva o si condivide.
import { db, getSetting, setSetting } from './db.js';
import { EXERCISES, GROUPS, exerciseById } from './exercises.js';
import { parsePlan, exKey, CLAUDE_PROMPT } from './plan.js';
import { bars, lines } from './charts.js';
import { APP_VERSION } from './version.js';

const $ = sel => document.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');
const native = window.Android;   // presente solo nell'APK Android

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const num = v => (v === '' || v == null ? null : parseFloat(String(v).replace(',', '.')));
const fmt = n => (n == null || isNaN(n) ? '—' : (Math.round(n * 10) / 10).toLocaleString('it-IT'));
// Data di oggi nel fuso del telefono (toISOString da sola darebbe la data UTC: dopo mezzanotte sbaglia).
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' });
const longDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const duration = ms => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const clock = s => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------------------------------------------------------------------------
// Stato: schede, allenamento in corso, storico e misure (tutto caricato all'avvio)
// ---------------------------------------------------------------------------
let plans = [];          // schede importate
let activeId = null;     // scheda in uso
let current = null;      // allenamento in corso (salvato a ogni modifica: se l'app si chiude non si perde)
let sessions = [];       // allenamenti fatti, dal più vecchio
let bodyLog = [];        // misurazioni, dalla più vecchia
let profile = { nome: '' };
let pickedDay = null;    // giorno scelto a mano nella pagina Oggi (altrimenti quello a rotazione)
let lastBackup = null;   // data dell'ultimo backup salvato (per ricordarlo ogni tanto)

const activePlan = () => plans.find(p => p.id === activeId) ?? null;
const savePlans = () => setSetting('plans', plans);
const saveCurrent = () => setSetting('current', current);

// ---------------------------------------------------------------------------
// Libreria e storia degli esercizi
// ---------------------------------------------------------------------------
const libOf = item => (item?.ex ? exerciseById(item.ex) : null);
const imgSrc = (lib, n = 0) => `img/ex/${lib.img}/${n}.jpg`;
const DUMBBELL = '<svg viewBox="0 0 24 24"><path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/></svg>';
const thumb = item => {
  const lib = libOf(item);
  return `<span class="thumb">${lib ? `<img src="${imgSrc(lib)}" alt="" loading="lazy">` : DUMBBELL}</span>`;
};

/** Le volte in cui è stato fatto un esercizio, dalla più recente: [{ session, item }]. */
function historyOf(key) {
  const out = [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    const item = sessions[i].items.find(it => it.key === key);
    if (item) out.push({ session: sessions[i], item });
  }
  return out;
}

const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : 0);
const topSet = item => item.sets.reduce((best, s) => (!best || (s.kg ?? 0) > (best.kg ?? 0) || ((s.kg ?? 0) === (best.kg ?? 0) && (s.reps ?? 0) > (best.reps ?? 0)) ? s : best), null);
const volumeOf = item => item.sets.reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0);

/** Riassunto di una volta: "40 kg × 12, 12, 10" oppure "30 s, 30 s" o "10 min". */
function setsText(item) {
  if (item.tipo === 'sec') return item.sets.map(s => `${fmt(s.val)} s`).join(', ');
  if (item.tipo === 'min') return item.sets.map(s => `${fmt(s.val)} min`).join(', ');
  const groups = [];
  for (const s of item.sets) {
    const kg = s.kg ? `${fmt(s.kg)} kg` : (item.tipo === 'corpo' ? 'corpo libero' : '— kg');
    const last = groups.at(-1);
    if (last && last.kg === kg) last.reps.push(s.reps ?? '—');
    else groups.push({ kg, reps: [s.reps ?? '—'] });
  }
  return groups.map(g => `${g.kg} × ${g.reps.join(', ')}`).join(' · ');
}

/**
 * Consiglio di carico, come nelle regole delle schede: se nelle ultime 2 volte hai fatto tutte le serie
 * con tutte le ripetizioni allo stesso peso, è ora di aumentare.
 */
function suggestion(planItem) {
  if (planItem.tipo !== 'kg' || planItem.target.unit !== 'reps') return null;
  const [a, b] = historyOf(exKey(planItem));
  const full = h => h && h.item.sets.length >= planItem.serie
    && h.item.sets.every(s => (s.reps ?? 0) >= (planItem.target.max ?? 0) && s.kg > 0);
  if (!full(a) || !full(b)) return null;
  const kg = Math.max(...a.item.sets.map(s => s.kg));
  if (Math.max(...b.item.sets.map(s => s.kg)) !== kg) return null;
  const next = kg + (kg < 20 ? 1 : 2.5);
  return `Nelle ultime 2 volte hai fatto tutte le ripetizioni con ${fmt(kg)} kg: prova ${fmt(next)} kg.`;
}

// Giorni a rotazione: si propone quello dopo l'ultimo fatto con la scheda in uso. I giorni "extra"
// (es. scheda leggera per i giorni di ciclo) non entrano nella rotazione: si scelgono a mano.
const isExtraDay = d => /legger|scarico|extra|ciclo/i.test(d.nome);
function nextDayIndex(plan) {
  const rot = plan.giorni.map((d, i) => i).filter(i => !isExtraDay(plan.giorni[i]));
  if (!rot.length) return 0;
  const last = [...sessions].reverse().find(s => s.planId === plan.id && rot.includes(s.dayIndex));
  if (!last) return rot[0];
  return rot[(rot.indexOf(last.dayIndex) + 1) % rot.length];
}

// ---------------------------------------------------------------------------
// Oggi: l'allenamento del giorno
// ---------------------------------------------------------------------------
function todayPage() {
  const plan = activePlan();
  const greet = profile.nome ? `Ciao ${esc(profile.nome)}` : 'Oggi';
  if (!plan) {
    view.innerHTML = `<header class="top"><div class="brand">AC</div><h1>${greet}</h1></header>
      ${updateBanner()}
      <div class="empty-state">${DUMBBELL}
        <h2>Nessuna scheda</h2>
        <p>Importa la scheda che ti ha preparato Claude: poi qui trovi ogni volta l'allenamento del giorno.</p>
        <a class="primary" href="#/schede">Importa una scheda</a></div>`;
    return;
  }
  const di = pickedDay ?? nextDayIndex(plan);
  const day = plan.giorni[di];
  const running = current ? `<a class="resume" href="#/allenamento"><span class="pulse"></span><span><b>Allenamento ${esc(current.dayName)} in corso</b>
      <small>iniziato alle ${new Date(current.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</small></span><b>Riprendi ›</b></a>` : '';
  view.innerHTML = `<header class="top"><div class="brand">AC</div><h1>${greet}</h1></header>
    ${updateBanner()}
    ${running}
    ${backupReminder()}
    <p class="date">${esc(longDate(today()))} · ${esc(plan.nome)}</p>
    <div class="days">${plan.giorni.map((d, i) => `<button class="chip ${i === di ? 'on' : ''}" data-day="${i}">${esc(d.nome.length <= 2 ? 'Allenamento ' + d.nome : d.nome)}</button>`).join('')}</div>
    ${pickedDay == null ? `<p class="note">${sessions.some(s => s.planId === plan.id)
      ? 'Proposto a rotazione: è quello dopo l\'ultimo che hai fatto.'
      : 'Si parte da qui; poi l\'app propone da sola il giorno successivo.'}</p>` : ''}
    ${day.titolo ? `<h2 class="day-title">${esc(day.titolo)}</h2>` : ''}
    ${listBlock('Riscaldamento', plan.riscaldamento)}
    <div class="ex-list">${day.esercizi.map((it, i) => {
      const last = historyOf(exKey(it))[0];
      const tip = suggestion(it);
      return `<button class="ex-card" data-info="${di}:${i}">
        ${thumb(it)}
        <span class="ex-body"><b>${esc(it.nome)}</b>${it.dettaglio ? `<small>${esc(it.dettaglio)}</small>` : ''}
          <span class="ex-target">${it.serie} × ${esc(it.ripetizioni)} · riposo ${it.riposo} s${it.superserie ? ` · superserie ${esc(it.superserie)}` : ''}</span>
          ${last ? `<span class="ex-last">Ultima volta: ${esc(setsText(last.item))}</span>` : it.peso ? `<span class="ex-last">Peso consigliato: ${fmt(it.peso)} kg</span>` : ''}
          ${tip ? `<span class="ex-tip">↑ ${esc(tip)}</span>` : ''}</span>
      </button>`;
    }).join('')}</div>
    ${listBlock('Defaticamento', plan.defaticamento)}
    ${current ? '' : `<button class="primary sticky" data-start="${di}">Inizia allenamento ${esc(day.nome)}</button>`}`;
}

// Promemoria del backup: dopo qualche allenamento, se l'ultimo backup ha più di 2 settimane (o non c'è).
function backupReminder() {
  if (sessions.length < 3) return '';
  const days = lastBackup ? (new Date(today()) - new Date(lastBackup)) / 86400000 : Infinity;
  if (days < 14) return '';
  return `<a class="hint" href="#/altro"><b>Fai un backup</b><span>${lastBackup ? `L'ultimo è del ${shortDate(lastBackup)}` : 'Non ne hai ancora fatto uno'}:
    salvalo su Drive o iCloud, così non perdi allenamenti e misure se cambi telefono.</span></a>`;
}

const listBlock = (title, items) => (items?.length ? `<details class="box"><summary>${esc(title)}</summary>
  <ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : '');

// ---------------------------------------------------------------------------
// Allenamento in corso: serie, pesi, ripetizioni, recupero
// ---------------------------------------------------------------------------
function startWorkout(di) {
  const plan = activePlan();
  const day = plan.giorni[di];
  current = {
    id: Date.now(), planId: plan.id, planName: plan.nome, dayIndex: di, dayName: day.nome, date: today(), start: Date.now(),
    items: day.esercizi.map(it => {
      const last = historyOf(exKey(it))[0]?.item;
      // Si parte dai pesi della volta scorsa (serie per serie), altrimenti dal peso consigliato.
      const sets = Array.from({ length: it.serie }, (_, i) => {
        const prev = last?.sets[Math.min(i, last.sets.length - 1)];
        return { kg: prev?.kg ?? it.peso ?? null, reps: null, val: prev?.val ?? null, done: false };
      });
      return { ...it, key: exKey(it), sets };
    }),
  };
  pickedDay = null;
  saveCurrent();
  location.hash = '#/allenamento';
}

function workoutPage() {
  if (!current) { location.hash = '#/'; return; }
  const done = current.items.reduce((a, it) => a + it.sets.filter(s => s.done).length, 0);
  const total = current.items.reduce((a, it) => a + it.sets.length, 0);
  view.innerHTML = `<header class="top"><a class="back" href="#/" aria-label="Indietro">‹</a>
      <h1>Allenamento ${esc(current.dayName)}</h1><span class="elapsed" id="elapsed"></span></header>
    <div class="progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    <p class="note">${done} di ${total} serie · tocca ✓ alla fine di ogni serie: parte il recupero.</p>
    ${current.items.map((it, i) => workoutItem(it, i)).join('')}
    <button class="primary" data-finish>Termina allenamento</button>
    <button class="link danger" data-cancel>Annulla allenamento</button>`;
  tickElapsed();
}

function workoutItem(it, i) {
  const last = historyOf(it.key)[0];
  const tip = suggestion(it);
  const unit = it.tipo === 'sec' ? 'secondi' : it.tipo === 'min' ? 'minuti' : null;
  const allDone = it.sets.every(s => s.done);
  return `<section class="wo-item ${allDone ? 'complete' : ''}" data-item="${i}">
    <button class="wo-head" data-info="w:${i}">${thumb(it)}<span class="ex-body"><b>${esc(it.nome)}</b>
      <span class="ex-target">${it.serie} × ${esc(it.ripetizioni)} · riposo ${it.riposo} s${it.superserie ? ` · superserie ${esc(it.superserie)}` : ''}</span>
      ${it.dettaglio ? `<small>${esc(it.dettaglio)}</small>` : ''}</span><span class="info-i">i</span></button>
    ${last ? `<p class="ex-last">Ultima volta (${shortDate(last.session.date)}): ${esc(setsText(last.item))}</p>` : ''}
    ${tip ? `<p class="ex-tip">↑ ${esc(tip)}</p>` : ''}
    ${it.note ? `<p class="ex-note">${esc(it.note)}</p>` : ''}
    <div class="sets">${it.sets.map((s, si) => `<div class="set ${s.done ? 'done' : ''}" data-set="${si}">
      <span class="set-n">${si + 1}</span>
      ${unit
        ? `<input data-k="val" inputmode="decimal" value="${s.val ?? ''}" placeholder="${it.target.min ?? ''}"><span class="u">${unit}</span>
           ${it.tipo === 'sec' && !s.done ? `<button class="hold" data-hold aria-label="Avvia il cronometro">${hold?.i === i && hold?.si === si ? clock(Math.max(0, Math.ceil((hold.end - Date.now()) / 1000))) : '▶'}</button>` : ''}`
        : `<input data-k="kg" inputmode="decimal" value="${s.kg ?? ''}" placeholder="${it.tipo === 'corpo' ? '+kg' : 'kg'}"><span class="u">kg ×</span>
           <input data-k="reps" inputmode="numeric" value="${s.reps ?? ''}" placeholder="${it.target.max ?? ''}"><span class="u">rip.</span>`}
      <button class="tick" data-done aria-label="Serie fatta">✓</button>
    </div>`).join('')}</div>
    <div class="set-tools"><button class="link" data-addset>+ Serie</button>${it.sets.length > 1 ? '<button class="link" data-delset>− Serie</button>' : ''}</div>
  </section>`;
}

function tickElapsed() {
  clearInterval(tickElapsed.timer);
  const el = () => $('#elapsed');
  const update = () => { if (el() && current) el().textContent = clock(Math.floor((Date.now() - current.start) / 1000)); };
  update();
  tickElapsed.timer = setInterval(() => (el() ? update() : clearInterval(tickElapsed.timer)), 1000);
}

// Cronometro per le tenute (plank, plank laterale…): conto alla rovescia dei secondi della serie,
// alla fine suono e vibrazione, la serie si segna da sola e parte il recupero.
let hold = null;   // { i, si, end, timer }
function startHold(i, si) {
  if (hold) { clearInterval(hold.timer); const same = hold.i === i && hold.si === si; hold = null; if (same) return rerenderWorkout(); }
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { /* niente suono */ }
  const it = current.items[i];
  const secs = num(it.sets[si].val) ?? it.target.min ?? 30;
  it.sets[si].val = secs;
  hold = { i, si, end: Date.now() + secs * 1000 };
  const btn = () => document.querySelector(`[data-item="${i}"] [data-set="${si}"] [data-hold]`);
  hold.timer = setInterval(() => {
    const left = Math.ceil((hold.end - Date.now()) / 1000);
    if (btn()) btn().textContent = clock(Math.max(0, left));
    if (left <= 0) {
      clearInterval(hold.timer);
      hold = null;
      navigator.vibrate?.([300, 120, 300]);
      beep();
      if (current && !current.items[i].sets[si].done) toggleSet(i, si);
    }
  }, 250);
  rerenderWorkout();
}

function rerenderWorkout() {
  if (location.hash !== '#/allenamento') return;   // il cronometro può finire mentre sei su un'altra pagina
  const y = scrollY;
  workoutPage();
  scrollTo(0, y);
}

/** Segna una serie come fatta (o la riapre), completa i campi vuoti e fa partire il recupero. */
function toggleSet(i, si) {
  const it = current.items[i];
  const s = it.sets[si];
  s.done = !s.done;
  if (s.done) {
    if (it.tipo === 'sec' || it.tipo === 'min') s.val ??= it.target.min;
    else s.reps ??= it.target.max;
    // Senza peso la serie conta 0 kg e falsa record e consigli: si avvisa (si può correggere anche dopo).
    if (it.tipo === 'kg' && s.kg == null) toast('Serie segnata senza peso: scrivi i kg, servono per i progressi.');
    const next = it.sets[si + 1];
    if (next && !next.done) {   // la serie dopo parte con lo stesso peso
      if (next.kg == null) next.kg = s.kg;
      if (next.val == null) next.val = s.val;
    }
    // Superserie: niente recupero finché non si arriva all'ultimo esercizio del gruppo.
    const nextItem = current.items[i + 1];
    const inSuperset = it.superserie && nextItem?.superserie === it.superserie;
    if (!inSuperset) startRest(it.riposo);
  }
  saveCurrent();
  rerenderWorkout();
}

async function finishWorkout() {
  const pending = current.items.some(it => it.sets.some(s => !s.done));
  const anyDone = current.items.some(it => it.sets.some(s => s.done));
  if (!anyDone) return toast('Segna almeno una serie con ✓ prima di terminare.');
  if (pending && !confirm('Alcune serie non sono segnate come fatte: vengono lasciate fuori. Termino l\'allenamento?')) return;
  const session = {
    id: current.id, date: current.date, planId: current.planId, planName: current.planName,
    dayIndex: current.dayIndex, dayName: current.dayName, start: current.start, end: Date.now(),
    items: current.items.map(it => ({
      key: it.key, ex: it.ex, nome: it.nome, tipo: it.tipo,
      sets: it.sets.filter(s => s.done).map(s => (it.tipo === 'sec' || it.tipo === 'min'
        ? { val: num(s.val) } : { kg: num(s.kg) ?? 0, reps: num(s.reps) ?? 0 })),
    })).filter(it => it.sets.length),
  };
  const records = newRecords(session);
  sessions.push(session);
  await db.put('sessions', session);
  current = null;
  await saveCurrent();
  stopRest();
  releaseWakeLock();
  location.hash = '#/';
  showSummary(session, records);
}

/** Record battuti in questo allenamento: peso massimo e massimale stimato, per esercizio. */
function newRecords(session) {
  const out = [];
  for (const it of session.items) {
    if (it.tipo !== 'kg' && it.tipo !== 'corpo') continue;
    const prev = historyOf(it.key).map(h => h.item);
    if (!prev.length) continue;   // la prima volta non è un record
    const maxKg = Math.max(...prev.flatMap(p => p.sets.map(s => s.kg ?? 0)));
    const maxE = Math.max(...prev.flatMap(p => p.sets.map(s => e1rm(s.kg, s.reps))));
    const top = topSet(it);
    const bestE = Math.max(...it.sets.map(s => e1rm(s.kg, s.reps)));
    if (top?.kg > maxKg) out.push(`${it.nome}: nuovo peso massimo, ${fmt(top.kg)} kg × ${top.reps}`);
    else if (bestE > maxE + 0.1) out.push(`${it.nome}: nuovo massimale stimato, ${fmt(bestE)} kg`);
  }
  return out;
}

function showSummary(s, records) {
  const sets = s.items.reduce((a, it) => a + it.sets.length, 0);
  const vol = s.items.reduce((a, it) => a + volumeOf(it), 0);
  sheet.innerHTML = `<div class="sheet-head"><h2>Allenamento ${esc(s.dayName)} completato</h2><button class="icon" data-close>✕</button></div>
    <div class="kpis"><div><b>${duration(s.end - s.start)}</b><small>durata</small></div>
      <div><b>${sets}</b><small>serie</small></div>
      <div><b>${fmt(vol)} kg</b><small>volume (kg × rip.)</small></div>
      <div><b>${s.items.length}</b><small>esercizi</small></div></div>
    ${records.length ? `<h3>Record</h3><ul class="records">${records.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    <button class="primary" data-close>Ottimo!</button>`;
  sheet.showModal();
}

// Schermo sempre acceso durante l'allenamento (se il telefono lo permette).
let wakeLock = null;
async function keepAwake() {
  try { if (!wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* non disponibile */ }
}
function releaseWakeLock() { wakeLock?.release().catch(() => {}); wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && location.hash === '#/allenamento') { wakeLock = null; keepAwake(); }
});

// ---------------------------------------------------------------------------
// Recupero: conto alla rovescia con vibrazione e suono alla fine
// ---------------------------------------------------------------------------
let restEnd = 0, restTotal = 0, restTimer = null, audio = null;
const restBox = $('#rest');

function startRest(seconds) {
  if (!seconds) return;
  // Il suono si può preparare solo durante un tocco: qui siamo dentro il tocco su ✓.
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { /* niente suono */ }
  restTotal = seconds;
  restEnd = Date.now() + seconds * 1000;
  restBox.hidden = false;
  restBox.classList.remove('over');
  clearInterval(restTimer);
  restTimer = setInterval(updateRest, 250);
  updateRest();
}

function updateRest() {
  const left = Math.ceil((restEnd - Date.now()) / 1000);
  $('#restTime').textContent = left > 0 ? clock(left) : 'Via!';
  $('#restFill').style.width = `${Math.max(0, Math.min(1, left / restTotal)) * 100}%`;
  if (left <= 0 && !restBox.classList.contains('over')) {
    restBox.classList.add('over');
    navigator.vibrate?.([300, 120, 300]);
    beep();
    clearInterval(restTimer);
    restTimer = setTimeout(stopRest, 4000);
  }
}

function stopRest() {
  clearInterval(restTimer);
  clearTimeout(restTimer);
  restBox.hidden = true;
}

function beep() {
  if (!audio) return;
  for (const [at, freq] of [[0, 880], [0.22, 1175]]) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audio.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.18);
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + at);
    o.stop(audio.currentTime + at + 0.2);
  }
}

restBox.addEventListener('click', e => {
  const b = e.target.closest('[data-rest]');
  if (!b) return;
  if (b.dataset.rest === 'skip') return stopRest();
  restEnd += +b.dataset.rest * 1000;
  restTotal = Math.max(restTotal, Math.ceil((restEnd - Date.now()) / 1000));
  if (restBox.classList.contains('over')) startRest(Math.max(5, Math.ceil((restEnd - Date.now()) / 1000)));
  updateRest();
});

// ---------------------------------------------------------------------------
// Scheda dell'esercizio: foto animate, spiegazione, consigli, video
// ---------------------------------------------------------------------------
function openExercise(item) {
  const lib = libOf(item) ?? (item.id ? item : null);
  const nome = item.nome;
  const video = `https://www.youtube.com/results?search_query=${encodeURIComponent(nome + ' esecuzione corretta')}`;
  const key = item.key ?? (item.ex ? item.ex : item.id ? item.id : exKey(item));
  const hist = historyOf(key);
  sheet.innerHTML = `<div class="sheet-head"><div><h2>${esc(nome)}</h2><small>${esc(item.muscoli || lib?.muscoli || '')}</small></div>
      <button class="icon" data-close aria-label="Chiudi">✕</button></div>
    ${lib ? `<div class="flip"><img src="${imgSrc(lib, 0)}" alt="Posizione di partenza"><img src="${imgSrc(lib, 1)}" alt="Posizione finale"></div>
      <p class="caption">Le due foto si alternano: partenza e arrivo del movimento.</p>` : ''}
    ${item.dettaglio || item.note ? `<div class="from-plan"><b>Dalla scheda</b>${item.dettaglio ? `<p>${esc(item.dettaglio)}</p>` : ''}${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>` : ''}
    ${lib ? `<h3>Come si fa</h3><ol class="steps">${lib.passi.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      <h3>Consigli</h3><ul class="tips">${lib.consigli.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
      : '<p class="note">Questo esercizio non è nella libreria dell\'app: guarda il video per l\'esecuzione.</p>'}
    <a class="video" href="${video}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M10 8.5v7l6-3.5z"/></svg>Guarda un video su YouTube</a>
    ${hist.length ? `<a class="link-row" href="#/esercizio/${encodeURIComponent(key)}" data-close>I tuoi progressi: ${plural(hist.length, 'volta', 'volte')} ›</a>` : ''}`;
  sheet.showModal();
}

sheet.addEventListener('click', e => {
  if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
});

// ---------------------------------------------------------------------------
// Schede: elenco, importazione, dettaglio
// ---------------------------------------------------------------------------
function plansPage() {
  view.innerHTML = `<header class="top"><h1>Schede</h1></header>
    <div class="actions"><button class="primary" data-import>Importa una scheda</button>
      <button class="secondary" data-prompt>Come farla preparare a Claude</button></div>
    ${plans.length ? plans.map(p => `<a class="plan-card ${p.id === activeId ? 'active' : ''}" href="#/scheda/${p.id}">
        <span><b>${esc(p.nome)}</b><small>${esc([p.persona, p.obiettivo].filter(Boolean).join(' · '))}</small>
        <small>${plural(p.giorni.length, 'giorno', 'giorni')}: ${p.giorni.map(d => esc(d.nome)).join(', ')} · importata il ${shortDate(p.imported)}</small></span>
        ${p.id === activeId ? '<span class="badge">In uso</span>' : '<span class="chev">›</span>'}</a>`).join('')
      : '<p class="note">Ancora nessuna scheda. Chiedi a Claude la scheda nel formato di AC Training (vedi "Come farla preparare a Claude"), poi importala qui.</p>'}`;
}

function planDetail(id) {
  const p = plans.find(x => x.id === id);
  if (!p) { location.hash = '#/schede'; return; }
  const missing = p.giorni.flatMap(d => d.esercizi).filter(e => !e.ex).length;
  view.innerHTML = `<header class="top"><a class="back" href="#/schede" aria-label="Indietro">‹</a><h1>${esc(p.nome)}</h1></header>
    ${p.persona || p.obiettivo ? `<p class="note">${esc([p.persona, p.obiettivo].filter(Boolean).join(' · '))}</p>` : ''}
    ${p.id === activeId ? '<p class="badge-line">Questa è la scheda in uso</p>' : `<button class="primary" data-activate="${p.id}">Usa questa scheda</button>`}
    ${listBlock('Come funziona', p.note)}${listBlock('Regole', p.regole)}
    ${listBlock('Riscaldamento', p.riscaldamento)}${listBlock('Defaticamento', p.defaticamento)}
    ${p.giorni.map((d, di) => `<h2>${esc(d.nome.length <= 2 ? 'Allenamento ' + d.nome : d.nome)}</h2>
      ${d.titolo ? `<p class="note">${esc(d.titolo)}</p>` : ''}
      <div class="ex-list">${d.esercizi.map((e, i) => `<button class="ex-card" data-info="p:${p.id}:${di}:${i}">${thumb(e)}
        <span class="ex-body"><b>${i + 1}. ${esc(e.nome)}</b>${e.dettaglio ? `<small>${esc(e.dettaglio)}</small>` : ''}
        <span class="ex-target">${esc(e.muscoli)}${e.muscoli ? ' · ' : ''}${e.serie} × ${esc(e.ripetizioni)} · ${e.riposo} s</span></span></button>`).join('')}</div>`).join('')}
    ${missing ? `<p class="note">${plural(missing, 'esercizio non è', 'esercizi non sono')} nella libreria dell'app: niente foto, ma c'è il video.</p>` : ''}
    <button class="link danger" data-delplan="${p.id}">Elimina questa scheda</button>`;
}

function importSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>Importa una scheda</h2><button class="icon" data-close>✕</button></div>
    <p class="note">Copia tutta la risposta di Claude (con il blocco JSON) e incollala qui, oppure scegli il file .json.</p>
    <textarea id="planText" rows="9" placeholder="Incolla qui la scheda…"></textarea>
    <div class="actions"><button class="secondary" data-paste>Incolla</button>
      <label class="secondary">Scegli file<input type="file" id="planFile" accept=".json,application/json,text/plain" hidden></label></div>
    <p class="error" id="importMsg"></p>
    <button class="primary" data-doimport>Importa</button>`;
  sheet.showModal();
}

async function doImport(text) {
  const msg = $('#importMsg');
  try {
    const plan = parsePlan(text);
    // Stessa scheda aggiornata da Claude: si sostituisce mantenendo l'identità, così la rotazione
    // dei giorni continua da dove era e la scheda resta quella in uso.
    const same = plans.find(p => p.nome.trim().toLowerCase() === plan.nome.trim().toLowerCase());
    if (same && confirm(`Hai già la scheda "${same.nome}". La sostituisco con questa nuova versione?\n(Allenamenti fatti e progressi restano.)`)) {
      plan.id = same.id;
      plans = plans.map(p => (p === same ? plan : p));
    } else {
      plans.push(plan);
    }
    if (!activeId) { activeId = plan.id; await setSetting('activePlan', activeId); }
    await savePlans();
    sheet.close();
    const ex = plan.giorni.reduce((a, d) => a + d.esercizi.length, 0);
    const missing = plan.giorni.flatMap(d => d.esercizi).filter(e => !e.ex).length;
    toast(`Importata: ${plural(plan.giorni.length, 'giorno', 'giorni')}, ${plural(ex, 'esercizio', 'esercizi')}${missing ? ` (${missing} senza foto)` : ''}`);
    location.hash = '#/scheda/' + plan.id;
  } catch (err) {
    msg.textContent = err.message;
  }
}

function promptSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>Schede preparate da Claude</h2><button class="icon" data-close>✕</button></div>
    <p class="note">Incolla questo testo nella chat dove Claude ti prepara le schede (basta una volta). Da lì in poi, insieme
      alla scheda ti darà anche la versione da importare qui.</p>
    <pre class="prompt" id="promptText">${esc(CLAUDE_PROMPT)}</pre>
    <div class="actions"><button class="primary" data-copy>Copia il testo</button>
      ${native?.shareText || navigator.share ? '<button class="secondary" data-share-prompt>Condividi</button>' : ''}</div>`;
  sheet.showModal();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiato: ora incollalo nella chat con Claude');
  } catch {
    const r = document.createRange();
    r.selectNodeContents($('#promptText'));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    toast('Testo selezionato: tieni premuto e scegli Copia');
  }
}

// ---------------------------------------------------------------------------
// Progressi
// ---------------------------------------------------------------------------
const C_MAIN = '#4ade80', C_ALT = '#60a5fa';   // verde dell'app e azzurro: distinguibili anche per chi non vede bene i colori

function weekStart(iso) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function progressPage() {
  const weeks = [];
  const start = new Date(weekStart(today()) + 'T12:00:00');
  for (let i = 11; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  const perWeek = weeks.map(w => sessions.filter(s => weekStart(s.date) === w).length);
  const month = today().slice(0, 7);
  // Settimane di fila con almeno un allenamento (quella in corso conta se c'è già un allenamento).
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (perWeek[i]) streak++;
    else if (i !== weeks.length - 1) break;
  }
  const byKey = new Map();
  for (const s of sessions) for (const it of s.items) {
    const e = byKey.get(it.key) ?? { key: it.key, nome: it.nome, tipo: it.tipo, ex: it.ex, last: s.date, count: 0, best: null, bestE: 0 };
    e.count++;
    e.last = s.date;
    e.nome = it.nome;
    for (const set of it.sets) {
      if (it.tipo === 'kg' || it.tipo === 'corpo') {
        if (!e.best || (set.kg ?? 0) > (e.best.kg ?? 0)) e.best = set;
        e.bestE = Math.max(e.bestE, e1rm(set.kg, set.reps));
      } else if (!e.best || (set.val ?? 0) > (e.best.val ?? 0)) e.best = set;
    }
    byKey.set(it.key, e);
  }
  const exercises = [...byKey.values()].sort((a, b) => b.last.localeCompare(a.last));
  const bestText = e => (!e.best ? '' : e.tipo === 'sec' ? `record ${fmt(e.best.val)} s` : e.tipo === 'min' ? `record ${fmt(e.best.val)} min`
    : `record ${fmt(e.best.kg)} kg × ${e.best.reps}${e.bestE ? ` · massimale stimato ${fmt(e.bestE)} kg` : ''}`);
  view.innerHTML = `<header class="top"><h1>Progressi</h1></header>
    <div class="kpis"><div><b>${sessions.length}</b><small>allenamenti in tutto</small></div>
      <div><b>${sessions.filter(s => s.date.startsWith(month)).length}</b><small>questo mese</small></div>
      <div><b>${streak}</b><small>${streak === 1 ? 'settimana' : 'settimane'} di fila</small></div>
      <div><b>${duration(sessions.reduce((a, s) => a + (s.end - s.start), 0))}</b><small>in palestra</small></div></div>
    <h2>Allenamenti per settimana</h2>
    ${bars({ labels: weeks.map(w => shortDate(w).replace(/ \d+$/, '')), series: [{ name: 'Allenamenti', color: C_MAIN, values: perWeek }], fmt: v => plural(v, 'allenamento', 'allenamenti'), hint: 'Tocca una barra: settimana che inizia quel lunedì' })}
    <h2>Esercizi</h2>
    ${exercises.length ? `<div class="ex-list">${exercises.map(e => `<a class="ex-card" href="#/esercizio/${encodeURIComponent(e.key)}">${thumb(e)}
      <span class="ex-body"><b>${esc(e.nome)}</b><span class="ex-target">${esc(bestText(e))}</span>
      <small>${plural(e.count, 'volta', 'volte')} · ultima il ${shortDate(e.last)}</small></span><span class="chev">›</span></a>`).join('')}</div>`
      : '<p class="note">Finisci il primo allenamento: qui vedrai record e grafici di ogni esercizio.</p>'}
    <h2>Storico allenamenti</h2>
    ${sessions.length ? [...sessions].reverse().slice(0, 30).map(s => `<button class="row" data-session="${s.id}">
      <span><b>${esc(shortDate(s.date))} · Allenamento ${esc(s.dayName)}</b><small>${esc(s.planName)} · ${duration(s.end - s.start)} · ${plural(s.items.reduce((a, it) => a + it.sets.length, 0), 'serie', 'serie')}</small></span>
      <span class="chev">›</span></button>`).join('') : '<p class="note">Nessun allenamento ancora.</p>'}`;
}

function exerciseProgress(key) {
  const hist = historyOf(key).reverse();   // dal più vecchio
  if (!hist.length) { location.hash = '#/progressi'; return; }
  const last = hist.at(-1).item;
  const lib = last.ex ? exerciseById(last.ex) : null;
  const labels = hist.map(h => shortDate(h.session.date));
  const weighted = last.tipo === 'kg' || last.tipo === 'corpo';
  const chart = weighted
    ? lines({ labels, series: [
      { name: 'Peso massimo', color: C_MAIN, values: hist.map(h => Math.max(...h.item.sets.map(s => s.kg ?? 0)) || null) },
      { name: 'Massimale stimato', color: C_ALT, values: hist.map(h => Math.round(Math.max(...h.item.sets.map(s => e1rm(s.kg, s.reps))) * 10) / 10 || null) },
    ], fmt: v => `${fmt(v)} kg` })
    : lines({ labels, series: [{ name: last.tipo === 'sec' ? 'Secondi' : 'Minuti', color: C_MAIN, values: hist.map(h => Math.max(...h.item.sets.map(s => s.val ?? 0))) }],
      fmt: v => `${fmt(v)} ${last.tipo === 'sec' ? 's' : 'min'}` });
  view.innerHTML = `<header class="top"><a class="back" href="#/progressi" aria-label="Indietro">‹</a><h1>${esc(last.nome)}</h1></header>
    ${lib ? `<div class="flip small"><img src="${imgSrc(lib, 0)}" alt=""><img src="${imgSrc(lib, 1)}" alt=""></div>` : ''}
    <button class="secondary wide" data-info="k:${esc(key)}">Come si fa</button>
    <h2>Andamento</h2>
    ${chart}
    ${weighted ? '<p class="note">Massimale stimato: il peso che riusciresti a sollevare una volta sola, calcolato dalle tue serie (formula di Epley).</p>' : ''}
    <h2>Tutte le volte</h2>
    ${[...hist].reverse().map(h => `<button class="row" data-session="${h.session.id}"><span><b>${esc(shortDate(h.session.date))}</b><small>${esc(setsText(h.item))}</small></span>
      ${weighted ? `<small>${fmt(volumeOf(h.item))} kg</small>` : ''}<span class="chev">›</span></button>`).join('')}`;
}

function sessionSheet(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  sheet.innerHTML = `<div class="sheet-head"><div><h2>Allenamento ${esc(s.dayName)}</h2><small>${esc(longDate(s.date))} · ${duration(s.end - s.start)}</small></div>
      <button class="icon" data-close>✕</button></div>
    ${s.items.map(it => `<div class="row static"><span><b>${esc(it.nome)}</b><small>${esc(setsText(it))}</small></span></div>`).join('')}
    <button class="primary" data-editsession="${s.id}">Modifica pesi e ripetizioni</button>
    <button class="link danger" data-delsession="${s.id}">Elimina questo allenamento</button>`;
  if (!sheet.open) sheet.showModal();
}

// Modifica di un allenamento già salvato: data, peso e ripetizioni (o secondi/minuti) di ogni serie,
// serie tolte o aggiunte. Record, grafici e consigli si ricalcolano da soli dai dati corretti.
let editing = null;   // copia dell'allenamento in modifica

function editSessionSheet(id) {
  if (id != null) editing = structuredClone(sessions.find(x => x.id === id));
  if (!editing) return;
  const s = editing;
  sheet.innerHTML = `<div class="sheet-head"><div><h2>Modifica allenamento ${esc(s.dayName)}</h2><small>${esc(s.planName)}</small></div>
      <button class="icon" data-close>✕</button></div>
    <label class="field"><span>Data</span><input type="date" id="editDate" value="${s.date}" max="${today()}"></label>
    ${s.items.map((it, i) => `<div class="edit-item"><b>${esc(it.nome)}</b>
      ${it.sets.map((set, si) => `<div class="set" data-eset="${i}:${si}"><span class="set-n">${si + 1}</span>
        ${it.tipo === 'sec' || it.tipo === 'min'
          ? `<input data-ek="val" inputmode="decimal" value="${set.val ?? ''}"><span class="u">${it.tipo === 'sec' ? 'secondi' : 'minuti'}</span>`
          : `<input data-ek="kg" inputmode="decimal" value="${set.kg || ''}" placeholder="kg"><span class="u">kg ×</span>
             <input data-ek="reps" inputmode="numeric" value="${set.reps || ''}"><span class="u">rip.</span>`}
        <button class="icon small" data-edelset="${i}:${si}" aria-label="Togli la serie">✕</button></div>`).join('')}
      <button class="link" data-eaddset="${i}">+ Serie</button></div>`).join('')}
    <button class="primary" data-esave>Salva le modifiche</button>
    <button class="link" data-session="${s.id}">Annulla</button>`;
  if (!sheet.open) sheet.showModal();
}

/** Legge i campi della finestra di modifica nella copia (prima di aggiungere/togliere serie o salvare). */
function readEditFields() {
  editing.date = $('#editDate')?.value || editing.date;
  for (const row of sheet.querySelectorAll('[data-eset]')) {
    const [i, si] = row.dataset.eset.split(':').map(Number);
    const set = editing.items[i].sets[si];
    for (const input of row.querySelectorAll('[data-ek]')) set[input.dataset.ek] = num(input.value);
  }
}

async function saveEditedSession() {
  readEditFields();
  const s = editing;
  // Serie vuote e esercizi senza serie non contano.
  for (const it of s.items) {
    it.sets = it.sets.filter(set => (it.tipo === 'sec' || it.tipo === 'min' ? set.val != null : set.reps != null || set.kg != null))
      .map(set => (it.tipo === 'sec' || it.tipo === 'min' ? { val: set.val } : { kg: set.kg ?? 0, reps: set.reps ?? 0 }));
  }
  s.items = s.items.filter(it => it.sets.length);
  if (!s.items.length) return toast('Lascia almeno una serie, oppure elimina l\'allenamento.');
  sessions = sessions.map(x => (x.id === s.id ? s : x)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  await db.put('sessions', s);
  editing = null;
  toast('Allenamento aggiornato');
  sessionSheet(s.id);
  route();
}

// ---------------------------------------------------------------------------
// Corpo: peso, composizione, misure
// ---------------------------------------------------------------------------
const MEASURES = [['vita', 'Vita'], ['fianchi', 'Fianchi'], ['glutei', 'Glutei'], ['petto', 'Petto'], ['braccio', 'Braccio'], ['coscia', 'Coscia'], ['polpaccio', 'Polpaccio']];
let measurePick = 'vita';

function delta(key, unit, sub = null) {
  const vals = bodyLog.map(b => (sub ? b.misure?.[sub] : b[key])).filter(v => v != null);
  if (!vals.length) return { last: '—', diff: '' };
  const lastV = vals.at(-1), first = vals[0];
  const d = lastV - first;
  return { last: `${fmt(lastV)} ${unit}`, diff: vals.length > 1 ? `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmt(Math.abs(d))} ${unit} dall'inizio` : 'prima misurazione' };
}

function bodyPage() {
  const k = [['peso', 'Peso', 'kg'], ['grasso', 'Massa grassa', '%'], ['muscolo', 'Massa muscolare', 'kg']];
  const labels = bodyLog.map(b => shortDate(b.date));
  const chartOf = (key, name, unit, sub = null) => {
    const values = bodyLog.map(b => (sub ? b.misure?.[sub] : b[key]) ?? null);
    return values.some(v => v != null) ? lines({ labels, series: [{ name, color: C_MAIN, values }], fmt: v => `${fmt(v)} ${unit}` }) : '';
  };
  const hasMeasures = bodyLog.some(b => Object.values(b.misure ?? {}).some(v => v != null));
  view.innerHTML = `<header class="top"><h1>Corpo</h1></header>
    <button class="primary" data-addbody>Aggiungi una misurazione</button>
    ${bodyLog.length ? `<div class="kpis">${k.map(([key, name, unit]) => { const d = delta(key, unit); return `<div><b>${d.last}</b><small>${name}</small><small class="diff">${d.diff}</small></div>`; }).join('')}
      <div><b>${shortDate(bodyLog.at(-1).date)}</b><small>ultima misurazione</small><small class="diff">${plural(bodyLog.length, 'misurazione', 'misurazioni')}</small></div></div>
      ${k.map(([key, name, unit]) => { const c = chartOf(key, name, unit); return c ? `<h2>${name}</h2>${c}` : ''; }).join('')}
      ${hasMeasures ? `<h2>Misure</h2>
        <div class="days">${MEASURES.map(([m, label]) => `<button class="chip ${m === measurePick ? 'on' : ''}" data-measure="${m}">${label}</button>`).join('')}</div>
        ${chartOf(null, MEASURES.find(m => m[0] === measurePick)[1], 'cm', measurePick) || '<p class="note">Nessun valore per questa misura.</p>'}` : ''}
      <h2>Tutte le misurazioni</h2>
      ${[...bodyLog].reverse().map(b => `<button class="row" data-editbody="${b.id}"><span><b>${esc(shortDate(b.date))}</b>
        <small>${esc([b.peso != null && `${fmt(b.peso)} kg`, b.grasso != null && `grasso ${fmt(b.grasso)}%`, b.muscolo != null && `muscolo ${fmt(b.muscolo)} kg`,
          ...MEASURES.filter(([m]) => b.misure?.[m] != null).map(([m, l]) => `${l.toLowerCase()} ${fmt(b.misure[m])}`)].filter(Boolean).join(' · '))}</small></span><span class="chev">›</span></button>`).join('')}`
      : `<p class="note">Segna peso, massa grassa, massa muscolare e misure (vita, fianchi, braccio…) ogni 1-2 settimane,
          sempre nelle stesse condizioni (es. al mattino a digiuno): qui vedrai come cambiano.</p>`}`;
}

function bodySheet(id = null) {
  const b = bodyLog.find(x => x.id === id) ?? { date: today(), misure: {} };
  const field = (key, label, unit, value) => `<label class="field"><span>${label}</span>
    <input data-body="${key}" inputmode="decimal" value="${value ?? ''}" placeholder="${unit}"><small>${unit}</small></label>`;
  sheet.innerHTML = `<div class="sheet-head"><h2>${id ? 'Modifica misurazione' : 'Nuova misurazione'}</h2><button class="icon" data-close>✕</button></div>
    <label class="field"><span>Data</span><input type="date" id="bodyDate" value="${b.date}" max="${today()}"></label>
    ${field('peso', 'Peso', 'kg', b.peso)}${field('grasso', 'Massa grassa', '%', b.grasso)}${field('muscolo', 'Massa muscolare', 'kg', b.muscolo)}
    <h3>Misure (cm)</h3>
    <div class="fields2">${MEASURES.map(([m, label]) => field('m:' + m, label, 'cm', b.misure?.[m])).join('')}</div>
    <p class="note">Lascia vuoto quello che non hai misurato.</p>
    <button class="primary" data-savebody="${id ?? ''}">Salva</button>
    ${id ? `<button class="link danger" data-delbody="${id}">Elimina questa misurazione</button>` : ''}`;
  sheet.showModal();
}

async function saveBody(id) {
  const entry = { id: id ? +id : Date.now(), date: $('#bodyDate').value || today(), misure: {} };
  for (const input of sheet.querySelectorAll('[data-body]')) {
    const v = num(input.value);
    const k = input.dataset.body;
    if (k.startsWith('m:')) { if (v != null) entry.misure[k.slice(2)] = v; } else entry[k] = v;
  }
  if (entry.peso == null && entry.grasso == null && entry.muscolo == null && !Object.keys(entry.misure).length) {
    return toast('Scrivi almeno un valore.');
  }
  bodyLog = bodyLog.filter(b => b.id !== entry.id).concat(entry).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  await db.put('body', entry);
  sheet.close();
  toast('Misurazione salvata');
  bodyPage();
}

// ---------------------------------------------------------------------------
// Altro: profilo, libreria esercizi, backup, aggiornamenti
// ---------------------------------------------------------------------------
function morePage() {
  view.innerHTML = `<header class="top"><h1>Altro</h1></header>
    <h2>Profilo</h2>
    <label class="field"><span>Il tuo nome</span><input id="profileName" value="${esc(profile.nome)}" placeholder="es. Andrea" autocomplete="off"></label>
    <h2>Esercizi</h2>
    <a class="row" href="#/libreria"><span><b>Libreria degli esercizi</b><small>${EXERCISES.length} esercizi con foto, spiegazione e consigli</small></span><span class="chev">›</span></a>
    <h2>Backup</h2>
    <p class="note">I dati restano solo su questo telefono. Salva ogni tanto una copia: serve se cambi telefono o reinstalli l'app.
      ${lastBackup ? `Ultimo backup: ${shortDate(lastBackup)}.` : 'Non hai ancora fatto un backup.'}</p>
    <div class="list">
      <button class="row" data-backup><span><b>${native ? 'Salva e condividi il backup' : 'Salva il backup'}</b><small>su Drive, email, iCloud o dove preferisci</small></span></button>
      <button class="row" data-restore><span><b>Ripristina da un backup</b><small>sostituisce i dati di questo telefono</small></span></button>
    </div>
    <input type="file" id="restoreFile" accept=".json,application/json,text/plain" hidden>
    <h2>App</h2>
    <p class="note">Versione ${esc(APP_VERSION)}${native ? ` · app Android ${esc(apkVersion())}` : ''}</p>
    ${native ? '<div class="list"><button class="row" data-checkupdate><span><b>Controlla aggiornamenti</b></span></button></div><p class="note" id="updateMsg"></p>' : ''}
    ${!native ? `<p class="note">Su iPhone: apri questa pagina in Safari, tocca Condividi e poi "Aggiungi alla schermata Home":
      l'app si apre a tutto schermo dalla sua icona e funziona anche senza rete.</p>` : ''}`;
}

function libraryPage() {
  view.innerHTML = `<header class="top"><a class="back" href="#/altro" aria-label="Indietro">‹</a><h1>Libreria esercizi</h1></header>
    <input type="search" id="libSearch" placeholder="Cerca un esercizio" autocomplete="off">
    <div id="libList">${libraryList('')}</div>`;
}

function libraryList(q) {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const match = e => !q || [e.nome, e.muscoli, ...e.alias].some(t => norm(t).includes(norm(q)));
  return GROUPS.map(g => {
    const list = EXERCISES.filter(e => e.gruppo === g && match(e));
    return list.length ? `<h2>${g}</h2><div class="ex-list">${list.map(e => `<button class="ex-card" data-lib="${e.id}">${thumb({ ex: e.id })}
      <span class="ex-body"><b>${esc(e.nome)}</b><small>${esc(e.muscoli)}</small></span></button>`).join('')}</div>` : '';
  }).join('') || '<p class="note">Nessun esercizio trovato.</p>';
}

async function backupJson() {
  return JSON.stringify({ app: 'ac-training', version: 1, date: today(), profile, plans, activeId,
    sessions, body: bodyLog });
}

async function saveBackup() {
  const json = await backupJson();
  const name = `ac-training-backup-${today()}.json`;
  lastBackup = today();
  setSetting('lastBackup', lastBackup);
  if (native?.shareBackup) {
    if (!native.shareBackup(json)) toast('Backup non riuscito');
    return;
  }
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {   // iPhone e Android dal browser: menu Condividi
    try { await navigator.share({ files: [file], title: 'Backup AC Training' }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function restoreBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'ac-training') throw new Error('non è un backup di AC Training');
    if (!confirm(`Ripristinare il backup del ${data.date ? shortDate(data.date) : '?'}? I dati di questo telefono vengono sostituiti.`)) return;
    plans = data.plans ?? [];
    activeId = data.activeId ?? plans[0]?.id ?? null;
    profile = data.profile ?? profile;
    sessions = (data.sessions ?? []).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    bodyLog = (data.body ?? []).sort((a, b) => a.date.localeCompare(b.date));
    await Promise.all([db.clear('sessions'), db.clear('body')]);
    for (const s of sessions) await db.put('sessions', s);
    for (const b of bodyLog) await db.put('body', b);
    await Promise.all([savePlans(), setSetting('activePlan', activeId), setSetting('profile', profile)]);
    toast(`Ripristinati ${plural(sessions.length, 'allenamento', 'allenamenti')} e ${plural(plans.length, 'scheda', 'schede')}`);
    route();
  } catch (err) {
    toast('Ripristino non riuscito: ' + err.message);
  }
}

// Aggiornamenti dell'APK: si confronta la versione installata con l'ultima release su GitHub.
// (Il contenuto dell'app invece si aggiorna da solo, arriva da GitHub Pages.)
const RELEASES = 'https://api.github.com/repos/Gavao/ac-training/releases/latest';
let apkUpdate = null;
const apkVersion = () => native?.appVersion?.() ?? '';
const newer = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};
async function checkApkUpdate() {
  if (!native) return;
  try {
    const rel = await (await fetch(RELEASES)).json();
    const version = rel.tag_name?.replace(/^v/, '');
    const asset = rel.assets?.find(a => a.name.endsWith('.apk'));
    apkUpdate = version && asset && newer(version, apkVersion()) ? { version, url: asset.browser_download_url } : null;
  } catch { /* offline */ }
}
const updateBanner = () => (apkUpdate
  ? `<button class="warn" data-update>È disponibile la versione ${esc(apkUpdate.version)} dell'app. Tocca per aggiornare.</button>` : '');

// Nuova versione pubblicata: si ricarica, ma mai durante un allenamento (il recupero si perderebbe).
async function checkWebUpdate() {
  if (APP_VERSION === 'dev' || location.hash === '#/allenamento' || sheet.open) return;
  try {
    const latest = (await (await fetch('version.txt', { cache: 'no-store' })).text()).trim();
    if (!latest || latest === APP_VERSION || sessionStorage.getItem('reloadedFor') === latest) return;
    sessionStorage.setItem('reloadedFor', latest);
    location.reload();
  } catch { /* offline */ }
}

// ---------------------------------------------------------------------------
// Tocchi e modifiche
// ---------------------------------------------------------------------------
function itemFromInfo(ref) {
  if (ref.startsWith('w:')) return current?.items[+ref.slice(2)];
  if (ref.startsWith('k:')) {
    const key = ref.slice(2);
    const h = historyOf(key)[0]?.item;
    return h ? { ...h, key } : null;
  }
  if (ref.startsWith('p:')) {
    const [, id, di, i] = ref.split(':');
    return plans.find(p => p.id === id)?.giorni[+di]?.esercizi[+i];
  }
  const [di, i] = ref.split(':').map(Number);
  return activePlan()?.giorni[di]?.esercizi[i];
}

document.addEventListener('click', async e => {
  const t = e.target;
  const info = t.closest('[data-info]');
  if (info) { const it = itemFromInfo(info.dataset.info); if (it) openExercise(it); return; }
  const lib = t.closest('[data-lib]');
  if (lib) { const ex = exerciseById(lib.dataset.lib); openExercise({ ...ex, ex: ex.id }); return; }
  const day = t.closest('[data-day]');
  if (day) { pickedDay = +day.dataset.day; todayPage(); return; }
  if (t.closest('[data-start]')) { startWorkout(+t.closest('[data-start]').dataset.start); return; }
  if (t.closest('[data-hold]')) {
    startHold(+t.closest('[data-item]').dataset.item, +t.closest('[data-set]').dataset.set);
    return;
  }
  if (t.closest('[data-done]')) {
    const i = +t.closest('[data-item]').dataset.item, si = +t.closest('[data-set]').dataset.set;
    keepAwake();
    toggleSet(i, si);
    return;
  }
  if (t.closest('[data-addset]')) {
    const it = current.items[+t.closest('[data-item]').dataset.item];
    const prev = it.sets.at(-1);
    it.sets.push({ kg: prev?.kg ?? null, reps: null, val: prev?.val ?? null, done: false });
    saveCurrent();
    workoutPage();
    return;
  }
  if (t.closest('[data-delset]')) {
    const it = current.items[+t.closest('[data-item]').dataset.item];
    if (it.sets.length > 1) it.sets.pop();
    saveCurrent();
    workoutPage();
    return;
  }
  if (t.closest('[data-finish]')) return finishWorkout();
  if (t.closest('[data-cancel]')) {
    if (!confirm('Annullare l\'allenamento? Le serie segnate non vengono salvate.')) return;
    current = null;
    await saveCurrent();
    stopRest();
    releaseWakeLock();
    location.hash = '#/';
    return;
  }
  if (t.closest('[data-import]')) return importSheet();
  if (t.closest('[data-prompt]')) return promptSheet();
  if (t.closest('[data-copy]')) return copyText(CLAUDE_PROMPT);
  if (t.closest('[data-share-prompt]')) {
    if (native?.shareText) native.shareText('Formato schede AC Training', CLAUDE_PROMPT);
    else navigator.share({ title: 'Formato schede AC Training', text: CLAUDE_PROMPT }).catch(() => {});
    return;
  }
  if (t.closest('[data-paste]')) {
    try { $('#planText').value = await navigator.clipboard.readText(); } catch { toast('Tieni premuto nel riquadro e scegli Incolla'); }
    return;
  }
  if (t.closest('[data-doimport]')) return doImport($('#planText').value);
  const act = t.closest('[data-activate]');
  if (act) {
    activeId = act.dataset.activate;
    pickedDay = null;
    await setSetting('activePlan', activeId);
    toast('Scheda in uso');
    planDetail(activeId);
    return;
  }
  const delPlan = t.closest('[data-delplan]');
  if (delPlan) {
    const p = plans.find(x => x.id === delPlan.dataset.delplan);
    if (!confirm(`Eliminare la scheda "${p.nome}"? Gli allenamenti già fatti restano nei progressi.`)) return;
    plans = plans.filter(x => x !== p);
    if (activeId === p.id) { activeId = plans[0]?.id ?? null; await setSetting('activePlan', activeId); }
    await savePlans();
    location.hash = '#/schede';
    return;
  }
  const sess = t.closest('[data-session]');
  if (sess) return sessionSheet(+sess.dataset.session);
  const editSess = t.closest('[data-editsession]');
  if (editSess) return editSessionSheet(+editSess.dataset.editsession);
  const eAdd = t.closest('[data-eaddset]');
  if (eAdd) {
    readEditFields();
    const it = editing.items[+eAdd.dataset.eaddset];
    it.sets.push({ ...it.sets.at(-1) });
    return editSessionSheet();
  }
  const eDel = t.closest('[data-edelset]');
  if (eDel) {
    readEditFields();
    const [i, si] = eDel.dataset.edelset.split(':').map(Number);
    editing.items[i].sets.splice(si, 1);
    return editSessionSheet();
  }
  if (t.closest('[data-esave]')) return saveEditedSession();
  const delSess = t.closest('[data-delsession]');
  if (delSess) {
    if (!confirm('Eliminare questo allenamento dallo storico?')) return;
    const id = +delSess.dataset.delsession;
    sessions = sessions.filter(s => s.id !== id);
    await db.del('sessions', id);
    sheet.close();
    progressPage();
    return;
  }
  if (t.closest('[data-addbody]')) return bodySheet();
  const editBody = t.closest('[data-editbody]');
  if (editBody) return bodySheet(+editBody.dataset.editbody);
  const saveB = t.closest('[data-savebody]');
  if (saveB) return saveBody(saveB.dataset.savebody);
  const delB = t.closest('[data-delbody]');
  if (delB) {
    if (!confirm('Eliminare questa misurazione?')) return;
    const id = +delB.dataset.delbody;
    bodyLog = bodyLog.filter(b => b.id !== id);
    await db.del('body', id);
    sheet.close();
    bodyPage();
    return;
  }
  const measure = t.closest('[data-measure]');
  if (measure) { measurePick = measure.dataset.measure; bodyPage(); return; }
  if (t.closest('[data-backup]')) return saveBackup();
  if (t.closest('[data-restore]')) return $('#restoreFile').click();
  if (t.closest('[data-update]')) { native.installUpdate(apkUpdate.url); toast('Download in corso: al termine si apre l\'installazione'); return; }
  if (t.closest('[data-checkupdate]')) {
    $('#updateMsg').textContent = 'Controllo…';
    await checkApkUpdate();
    $('#updateMsg').innerHTML = apkUpdate ? updateBanner() : 'Hai già l\'ultima versione.';
  }
  const tip = t.closest('[data-tip]');
  if (tip) tip.closest('.chart').querySelector('.chart-read').textContent = tip.dataset.tip;
});

document.addEventListener('input', e => {
  const input = e.target;
  if (input.dataset.k && current) {
    const i = +input.closest('[data-item]').dataset.item, si = +input.closest('[data-set]').dataset.set;
    current.items[i].sets[si][input.dataset.k] = num(input.value);
    clearTimeout(saveCurrent.timer);
    saveCurrent.timer = setTimeout(saveCurrent, 400);
  }
  if (input.id === 'profileName') {
    profile.nome = input.value.trim();
    clearTimeout(morePage.timer);
    morePage.timer = setTimeout(() => setSetting('profile', profile), 400);
  }
  if (input.id === 'libSearch') $('#libList').innerHTML = libraryList(input.value.trim());
});

document.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (e.target.id === 'planFile') { $('#planText').value = await file.text(); doImport($('#planText').value); }
  if (e.target.id === 'restoreFile') restoreBackup(file);
  e.target.value = '';
});

// Tasto Indietro di Android (dall'APK): prima chiude la finestra aperta, poi torna alla pagina precedente.
window.appBack = () => {
  if (sheet.open) { sheet.close(); return true; }
  if (location.hash && location.hash !== '#/') { history.back(); return true; }
  return false;
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function route() {
  const [page, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const tab = { '': 'today', allenamento: 'today', schede: 'plans', scheda: 'plans', progressi: 'progress', esercizio: 'progress',
    corpo: 'body', altro: 'more', libreria: 'more' }[page] ?? 'today';
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.tab === tab);
  document.body.classList.toggle('in-workout', page === 'allenamento');
  if (page === 'allenamento') workoutPage();
  else if (page === 'schede') plansPage();
  else if (page === 'scheda') planDetail(decodeURIComponent(arg));
  else if (page === 'progressi') progressPage();
  else if (page === 'esercizio') exerciseProgress(decodeURIComponent(arg));
  else if (page === 'corpo') bodyPage();
  else if (page === 'altro') morePage();
  else if (page === 'libreria') libraryPage();
  else todayPage();
}

addEventListener('hashchange', () => { route(); scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkWebUpdate(); });

// Avvio
plans = await getSetting('plans', []);
activeId = await getSetting('activePlan', plans[0]?.id ?? null);
current = await getSetting('current', null);
profile = await getSetting('profile', { nome: '' });
lastBackup = await getSetting('lastBackup', null);
sessions = (await db.all('sessions')).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
bodyLog = (await db.all('body')).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
navigator.storage?.persist?.().catch(() => {});   // chiede al telefono di non cancellare mai i dati dell'app
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
checkWebUpdate();
checkApkUpdate().then(() => { if (apkUpdate && !location.hash.replace(/^#\/?/, '')) todayPage(); });
