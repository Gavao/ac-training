// AC Training: schede di allenamento importate, registro dei pesi serie per serie, progressi e misure.
// Tutti i dati restano nel telefono (IndexedDB); il backup è un file che si salva o si condivide.
import { db, getSetting, setSetting } from './db.js';
import { EXERCISES, GROUPS, FOCUSES, exerciseById, alternatives, setCustomExercises } from './exercises.js';
import { parsePlan, exKey, CLAUDE_PROMPT, buildItem, buildBlock, planToJson, BLOCK_MODES, parseBlockLine } from './plan.js';
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
// Foto: quella scattata per un esercizio creato da te, altrimenti le due dell'archivio (inizio e fine).
const hasImg = lib => !!(lib?.foto || lib?.img);
const imgSrc = (lib, n = 0) => lib.foto ?? `img/ex/${lib.img}/${n}.jpg`;
const DUMBBELL = '<svg viewBox="0 0 24 24"><path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/></svg>';
const STOPWATCH = '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6M12 2v3"/></svg>';
const thumb = item => {
  if (item?.kind === 'blocco') return `<span class="thumb block">${STOPWATCH}</span>`;
  const lib = libOf(item);
  return `<span class="thumb">${hasImg(lib) ? `<img src="${imgSrc(lib)}" alt="" loading="lazy">` : DUMBBELL}</span>`;
};

/** Esercizi di un blocco a tempo in una riga: "12 Kettlebell swing · 8 Piegamenti". */
const blockSummary = b => b.esercizi.map(x => `${x.ripetizioni ? x.ripetizioni + ' ' : ''}${x.nome}`).join(' · ');

/** Risultato di un blocco a tempo: giri dell'AMRAP, tempo del For time, giri fatti negli altri. */
function blockResultText(item) {
  const r = item.result ?? {};
  if (item.modo === 'amrap') return `${plural(r.giri ?? 0, 'giro', 'giri')}${r.extra ? ` + ${r.extra} rip.` : ''}`;
  if (item.modo === 'fortime') return r.finito === false ? `non finito in ${clock(r.tempo ?? 0)}` : `tempo ${clock(r.tempo ?? 0)}`;
  if (item.modo === 'circuito') return `${plural(item.sets.length, 'giro', 'giri')} completati`;
  return r.completato === false ? `fermato al giro ${r.al ?? (r.giri ?? 0) + 1}${r.di ? ` di ${r.di}` : ''}` : 'completato';
}

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
  if (item.tipo === 'blocco') return blockResultText(item);
  if (item.tipo === 'sec') return item.sets.map(s => `${fmt(s.val)} s`).join(', ');
  if (item.tipo === 'min') return item.sets.map(s => `${fmt(s.val)} min`).join(', ');
  if (item.tipo === 'corpo' && !item.sets.some(s => s.kg)) return `${item.sets.map(s => s.reps ?? '—').join(', ')} ripetizioni`;
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
      if (it.kind === 'blocco') {
        return `<button class="ex-card block" data-info="${di}:${i}">${thumb(it)}
          <span class="ex-body"><b>${esc(it.nome)}</b><span class="ex-target">${esc(blockSummary(it))}</span>
            ${last ? `<span class="ex-last">Ultima volta: ${esc(setsText(last.item))}</span>` : ''}</span></button>`;
      }
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
      // Blocco a tempo: il circuito ha un ✓ per giro, gli altri un solo risultato a fine timer.
      if (it.kind === 'blocco') {
        return { ...structuredClone(it), key: exKey(it), result: null, timer: null,
          sets: Array.from({ length: it.modo === 'circuito' ? it.giri : 1 }, () => ({ done: false })) };
      }
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
  if (it.kind === 'blocco') return workoutBlock(it, i);
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
        : it.tipo === 'corpo'   // a corpo libero (addominali, piegamenti…): solo le ripetizioni
        ? `<input data-k="reps" inputmode="numeric" value="${s.reps ?? ''}" placeholder="${it.target.max ?? ''}"><span class="u">ripetizioni</span>`
        : `<input data-k="kg" inputmode="decimal" value="${s.kg ?? ''}" placeholder="kg"><span class="u">kg ×</span>
           <input data-k="reps" inputmode="numeric" value="${s.reps ?? ''}" placeholder="${it.target.max ?? ''}"><span class="u">rip.</span>`}
      <button class="tick" data-done aria-label="Serie fatta">✓</button>
    </div>`).join('')}</div>
    <div class="set-tools"><button class="link" data-addset>+ Serie</button>${it.sets.length > 1 ? '<button class="link" data-delset>− Serie</button>' : ''}
      <button class="link swap" data-swap>⇄ Cambia esercizio</button></div>
  </section>`;
}

/** Blocco a tempo nell'allenamento: esercizi, risultato dell'ultima volta e timer (o i giri del circuito). */
function workoutBlock(it, i) {
  const last = historyOf(it.key)[0];
  const done = it.sets.every(s => s.done);
  const exercises = `<div class="block-ex">${it.esercizi.map((x, k) => `<button class="block-ex-row" data-blockex="${i}:${k}">${thumb(x)}
    <span><b>${esc(x.ripetizioni || '')}</b> ${esc(x.nome)}${x.dettaglio ? ` <small>${esc(x.dettaglio)}</small>` : ''}</span></button>`).join('')}</div>`;
  const body = it.modo === 'circuito'
    ? `<div class="sets">${it.sets.map((s, si) => `<div class="set ${s.done ? 'done' : ''}" data-set="${si}">
        <span class="set-n">${si + 1}</span><span class="round-label">Giro ${si + 1} di ${it.sets.length}</span>
        <button class="tick" data-done aria-label="Giro fatto">✓</button></div>`).join('')}</div>
      <p class="note">Recupero ${it.recupero} s a fine giro.</p>`
    : done
      ? `<p class="block-result">✓ ${esc(blockResultText(it))}</p><button class="link" data-block-start="${i}">Rifai il blocco</button>`
      : `<button class="primary block-start" data-block-start="${i}">▶ ${it.timer ? 'Riprendi il timer' : 'Avvia il timer'}</button>`;
  return `<section class="wo-item block ${done ? 'complete' : ''}" data-item="${i}">
    <button class="wo-head" data-info="w:${i}">${thumb(it)}<span class="ex-body"><b>${esc(it.nome)}</b>
      <small>${esc(BLOCK_MODES[it.modo].spiega)}</small></span><span class="info-i">i</span></button>
    ${last ? `<p class="ex-last">Ultima volta (${shortDate(last.session.date)}): ${esc(setsText(last.item))}</p>` : ''}
    ${it.note ? `<p class="ex-note">${esc(it.note)}</p>` : ''}
    ${exercises}
    ${body}
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
      alarm();
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
    // Piccola vibrazione: si sente che il tocco su ✓ è arrivato.
    if (native?.vibrate) native.vibrate('0,40'); else navigator.vibrate?.(40);
    if (it.tipo === 'sec' || it.tipo === 'min') s.val ??= it.target.min;
    else s.reps ??= it.target.max;
    // Senza peso la serie conta 0 kg e falsa record e consigli: si avvisa (si può correggere anche dopo).
    if (it.tipo === 'kg' && s.kg == null) toast('Serie segnata senza peso: scrivi i kg, servono per i progressi.');
    const next = it.sets[si + 1];
    if (next && !next.done) {   // la serie dopo parte con lo stesso peso
      if (next.kg == null) next.kg = s.kg;
      if (next.val == null) next.val = s.val;
    }
    // Superserie: niente recupero se c'è da fare subito la stessa serie dell'esercizio dopo nel gruppo.
    // Se invece le serie si fanno una dopo l'altra (la serie prima del compagno non è fatta), il recupero c'è.
    const group = it.superserie ? current.items.filter((x, k) => k !== i && x.superserie === it.superserie) : [];
    const partner = group.find(x => current.items.indexOf(x) > i && x.sets[si] && !x.sets[si].done);
    const straight = si > 0 && group.some(x => x.sets[si - 1] && !x.sets[si - 1].done);
    if (partner && !straight) toast(`Superserie: vai subito con ${partner.nome}, il recupero parte dopo.`);
    else startRest(+it.riposo || Math.max(0, ...group.map(x => +x.riposo || 0)), nextSetLabel(i, si));
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
    items: current.items.map(it => (it.kind === 'blocco'
      ? { key: it.key, ex: null, nome: it.nome, tipo: 'blocco', kind: 'blocco', modo: it.modo, cap: it.cap, minuti: it.minuti,
        esercizi: it.esercizi, result: it.result, sets: it.sets.filter(s => s.done).map(() => ({})) }
      : {
        key: it.key, ex: it.ex, nome: it.nome, tipo: it.tipo,
        sets: it.sets.filter(s => s.done).map(s => (it.tipo === 'sec' || it.tipo === 'min'
          ? { val: num(s.val) } : { kg: num(s.kg) ?? 0, reps: num(s.reps) ?? 0 })),
      })).filter(it => it.sets.length),
  };
  if (tm) closeTimer();
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
    if (it.tipo === 'blocco') {   // AMRAP: più giri; For time finito: meno tempo
      const prev = historyOf(it.key).map(h => h.item.result ?? {});
      if (!prev.length || !it.result) continue;
      if (it.modo === 'amrap' && it.result.giri > Math.max(...prev.map(r => r.giri ?? 0))) out.push(`${it.nome}: record di giri, ${it.result.giri}`);
      const times = prev.filter(r => r.finito).map(r => r.tempo);
      if (it.modo === 'fortime' && it.result.finito && (!times.length || it.result.tempo < Math.min(...times))) out.push(`${it.nome}: nuovo miglior tempo, ${clock(it.result.tempo)}`);
      continue;
    }
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
let restEnd = 0, restTotal = 0, restTimer = null, audio = null, restLabel = '';
const restBox = $('#rest');

/**
 * Recupero. Nell'APK Android lo segue anche il telefono: se chiudi l'app compare la notifica con il
 * conto alla rovescia e, alla fine, l'avviso con suono e vibrazione (vedi MainActivity.java).
 */
function startRest(seconds, label = restLabel) {
  if (!seconds) return;
  // Il suono si può preparare solo durante un tocco: qui siamo dentro il tocco su ✓.
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { /* niente suono */ }
  restTotal = seconds;
  restEnd = Date.now() + seconds * 1000;
  restLabel = label;
  native?.restStart?.(restEnd, restLabel);
  showRest();
}

function showRest() {
  rememberRest();
  restBox.hidden = false;
  restBox.classList.remove('over');
  clearInterval(restTimer);
  clearTimeout(restTimer);
  restTimer = setInterval(updateRest, 250);
  updateRest();
}

// Il recupero in corso resta salvato: se Android chiude e riapre l'app, riprende da dove era.
function rememberRest() {
  try { localStorage.setItem('rest', JSON.stringify({ end: restEnd, total: restTotal, label: restLabel })); } catch { /* niente */ }
}
function resumeRest() {
  try {
    const r = JSON.parse(localStorage.getItem('rest') ?? 'null');
    if (!current || !r || r.end <= Date.now()) { localStorage.removeItem('rest'); return; }
    restEnd = r.end;
    restTotal = r.total;
    restLabel = r.label ?? '';
    showRest();
  } catch { /* niente */ }
}

function updateRest() {
  const left = Math.ceil((restEnd - Date.now()) / 1000);
  $('#restTime').textContent = left > 0 ? clock(left) : 'Via!';
  $('#restFill').style.width = `${Math.max(0, Math.min(1, left / restTotal)) * 100}%`;
  if (left <= 0 && !restBox.classList.contains('over')) {
    restBox.classList.add('over');
    // Se l'app era chiusa ed è finito da un pezzo, l'avviso l'ha già dato la notifica.
    if (!native?.restStart || Date.now() - restEnd < 3000) alarm();
    clearInterval(restTimer);
    restTimer = setTimeout(stopRest, 5000);
  }
}

function stopRest() {
  clearInterval(restTimer);
  clearTimeout(restTimer);
  try { localStorage.removeItem('rest'); } catch { /* niente */ }
  restBox.hidden = true;
  native?.restStop?.();
}

/** Fine del recupero (o di una tenuta): vibrazione e suono per circa 3 secondi. */
function alarm() {
  if (native?.vibrate) native.vibrate('0,600,200,600,200,900');
  else navigator.vibrate?.([600, 200, 600, 200, 900]);
  beep();
}

// Suono a tutto volume (segue il volume dei contenuti multimediali): 12 bip alternati in 3 secondi.
function beep() {
  if (!audio) return;
  audio.resume?.();
  const t0 = audio.currentTime + 0.02;
  const out = audio.createDynamicsCompressor();
  out.connect(audio.destination);
  for (let i = 0; i < 12; i++) {
    const at = t0 + i * 0.25;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'square';
    o.frequency.value = i % 2 ? 1320 : 990;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.9, at + 0.01);
    g.gain.setValueAtTime(0.9, at + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.21);
  }
}

// ---------------------------------------------------------------------------
// Timer dei blocchi a tempo. Le fasi (preparazione, minuti dell'EMOM, lavoro e pausa…) si calcolano
// dal momento di partenza: il timer resta giusto anche se il telefono va in standby o l'app si
// riapre. Partenza, pause e giri sono salvati nell'allenamento in corso.
// ---------------------------------------------------------------------------
const PREP = 10;            // secondi per prepararsi prima di partire
let tm = null;              // { i, interval, lastK, lastSec }
const timerBox = $('#timer');

function blockPhases(b) {
  const n = b.esercizi.length || 1;
  const out = [{ kind: 'prep', sec: PREP, label: 'Preparati', ex: b.modo === 'emom' && b.alterna ? b.esercizi.slice(0, 1) : b.esercizi.slice(0, b.modo === 'tabata' || b.modo === 'intervalli' ? 1 : n) }];
  if (b.modo === 'emom') {
    const rounds = Math.max(1, Math.round((b.minuti * 60) / b.ogni));
    for (let r = 0; r < rounds; r++) {
      out.push({ kind: 'work', sec: b.ogni, label: b.ogni === 60 ? `Minuto ${r + 1}` : `Giro ${r + 1}`, round: r + 1, rounds,
        ex: b.alterna ? [b.esercizi[r % n]] : b.esercizi });
    }
  } else if (b.modo === 'tabata' || b.modo === 'intervalli') {
    for (let r = 0; r < b.giri; r++) {
      out.push({ kind: 'work', sec: b.lavoro, label: 'Lavoro', round: r + 1, rounds: b.giri, ex: [b.esercizi[r % n]] });
      if (r < b.giri - 1) out.push({ kind: 'rest', sec: b.pausa, label: 'Pausa', round: r + 1, rounds: b.giri, ex: [b.esercizi[(r + 1) % n]], next: true });
    }
  } else if (b.modo === 'amrap') {
    out.push({ kind: 'work', sec: b.minuti * 60, label: 'Più giri possibili', ex: b.esercizi });
  } else {
    out.push({ kind: 'work', sec: (b.cap || 60) * 60, label: 'Il più veloce possibile', ex: b.esercizi, countUp: true });
  }
  return out;
}

const timerElapsed = t => ((t.pausedAt ?? Date.now()) - t.startAt - t.pausedTotal) / 1000;

/** Fase in corso dopo "elapsed" secondi: indice, secondi che mancano e secondi passati nella fase. */
function phaseAt(phases, elapsed) {
  let acc = 0;
  for (let k = 0; k < phases.length; k++) {
    if (elapsed < acc + phases[k].sec) return { k, left: acc + phases[k].sec - elapsed, into: elapsed - acc };
    acc += phases[k].sec;
  }
  return { k: phases.length, left: 0, into: 0 };
}

/** Notifica sul telefono Android (app chiusa): conto alla rovescia della fase in corso. */
function timerNative(title, label, endMs) {
  if (native?.timerStart) native.timerStart(endMs, title, label);
  else native?.restStart?.(endMs, `${title} · ${label}`);
}

function openTimer(i) {
  const it = current.items[i];
  if (it.sets[0].done) {   // "Rifai il blocco"
    it.sets[0].done = false;
    it.result = null;
    it.timer = null;
  }
  it.timer ??= { startAt: Date.now(), pausedAt: null, pausedTotal: 0, giri: 0 };
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { /* niente suono */ }
  stopRest();
  keepAwake();
  saveCurrent();
  clearInterval(tm?.interval);
  tm = { i, lastK: -1, lastSec: -1 };
  tm.interval = setInterval(renderTimer, 200);
  timerBox.hidden = false;
  document.body.classList.add('timer-open');
  renderTimer();
}

function renderTimer() {
  const it = current?.items[tm?.i];
  if (!it?.timer) { closeTimer(); return; }
  const t = it.timer;
  const phases = blockPhases(it);
  const total = phases.reduce((a, p) => a + p.sec, 0);
  const elapsed = timerElapsed(t);
  const p = phaseAt(phases, elapsed);
  if (p.k >= phases.length) return finishBlock(true);
  const ph = phases[p.k];
  if (tm.lastK !== p.k) {   // cambio di fase: bip lungo, e la notifica Android segue la nuova fase
    if (tm.lastK !== -1 && !t.pausedAt) beepOnce(ph.kind === 'rest' ? 660 : 1175, 0.45);
    tm.lastK = p.k;
    // Ad app chiusa la notifica conta fino alla fine di tutto il blocco (l'avviso finale arriva lì).
    if (!t.pausedAt) timerNative(it.nome, `${ph.label}${ph.round ? ` · giro ${ph.round} di ${ph.rounds}` : ''}`, Date.now() + (total - elapsed) * 1000);
  }
  const sec = Math.ceil(p.left);
  if (!t.pausedAt && sec <= 3 && sec >= 1 && sec !== tm.lastSec && !ph.countUp) beepOnce(880, 0.12);   // 3, 2, 1
  tm.lastSec = sec;
  timerBox.className = `tm-${t.pausedAt ? 'paused' : ph.kind}`;
  $('#tmTitle').textContent = it.nome;
  $('#tmPhase').textContent = t.pausedAt ? 'In pausa' : ph.label;
  $('#tmClock').textContent = ph.countUp ? clock(Math.floor(p.into)) : clock(sec);
  $('#tmRound').textContent = it.modo === 'amrap' ? `Giri fatti: ${t.giri}`
    : it.modo === 'fortime' ? (ph.kind === 'prep' ? '' : `Tempo massimo ${it.cap}'`)
    : ph.round ? `Giro ${ph.round} di ${ph.rounds}` : '';
  $('#tmBar').style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
  const exHtml = `${ph.next ? '<small>Prossimo</small>' : ''}${ph.ex.map(x => `<div><b>${esc(x.ripetizioni || '')}</b> ${esc(x.nome)}</div>`).join('')}`;
  if (tm.exHtml !== exHtml) { $('#tmEx').innerHTML = exHtml; tm.exHtml = exHtml; }
  const actions = `${it.modo === 'amrap' && ph.kind !== 'prep' ? '<button class="tm-big" data-tm="plus">+1 giro</button><button data-tm="minus">−1</button>' : ''}
    ${it.modo === 'fortime' && ph.kind !== 'prep' ? '<button class="tm-big" data-tm="done">Fatto!</button>' : ''}
    <button data-tm="pause">${t.pausedAt ? '▶ Riprendi' : '❚❚ Pausa'}</button><button data-tm="stop">Termina</button>`;
  if (tm.actions !== actions) { $('#tmActions').innerHTML = actions; tm.actions = actions; }
}

/** Fine del blocco: naturale (tempo scaduto) o con "Fatto!"/"Termina". Il risultato va nell'allenamento. */
function finishBlock(natural, manual = null) {
  const it = current.items[tm.i];
  const phases = blockPhases(it);
  const p = phaseAt(phases, timerElapsed(it.timer));
  const ph = phases[Math.min(p.k, phases.length - 1)];
  if (it.modo === 'amrap') it.result = { giri: it.timer.giri };
  else if (it.modo === 'fortime') it.result = manual === 'done' ? { tempo: Math.round(p.into), finito: true } : { tempo: Math.round(natural ? it.cap * 60 : p.into), finito: false };
  else it.result = natural ? { completato: true } : { completato: false, giri: Math.max(0, (ph.round ?? 1) - 1), al: ph.round ?? 1, di: ph.rounds ?? null };
  it.sets[0].done = true;
  it.timer = null;
  if (natural || manual === 'done') alarm();
  saveCurrent();
  closeTimer();
  toast(`${it.nome}: ${blockResultText(it)}`);
}

function closeTimer() {
  clearInterval(tm?.interval);
  tm = null;
  timerBox.hidden = true;
  document.body.classList.remove('timer-open');
  native?.restStop?.();
  rerenderWorkout();
}

function beepOnce(freq, dur) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain(), at = audio.currentTime + 0.01;
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.8, at + 0.01);
  g.gain.setValueAtTime(0.8, at + dur - 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(audio.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

timerBox.addEventListener('click', e => {
  const b = e.target.closest('[data-tm]');
  if (!b || !tm) return;
  const it = current.items[tm.i];
  const t = it.timer;
  const act = b.dataset.tm;
  if (act === 'close') {   // il timer continua: si riapre dal blocco
    clearInterval(tm.interval);
    tm = null;
    timerBox.hidden = true;
    document.body.classList.remove('timer-open');
    rerenderWorkout();
    return;
  }
  if (act === 'pause') {
    if (t.pausedAt) { t.pausedTotal += Date.now() - t.pausedAt; t.pausedAt = null; tm.lastK = -1; }
    else { t.pausedAt = Date.now(); native?.restStop?.(); }
  }
  if (act === 'plus') { t.giri++; beepOnce(1320, 0.1); }
  if (act === 'minus') t.giri = Math.max(0, t.giri - 1);
  if (act === 'done') return finishBlock(false, 'done');
  if (act === 'stop') {
    if (phaseAt(blockPhases(it), timerElapsed(t)).k === 0) {   // ancora nella preparazione: si annulla e basta
      it.timer = null;
      saveCurrent();
      return closeTimer();
    }
    if (!confirm('Terminare il blocco adesso? Il risultato si salva con quello fatto fin qui.')) return;
    return finishBlock(false, 'stop');
  }
  saveCurrent();
  renderTimer();
});

/** Cosa c'è dopo (per la notifica del recupero): la prossima serie da fare. */
function nextSetLabel(i, si) {
  const items = current?.items ?? [];
  const find = (from, sFrom) => {
    for (let a = from; a < items.length; a++) {
      const b = items[a].sets.findIndex((s, k) => !s.done && (a !== from || k >= sFrom));
      if (b >= 0) return `Prossima: ${items[a].nome} · serie ${b + 1} di ${items[a].sets.length}`;
    }
    return null;
  };
  return find(i, si + 1) ?? find(0, 0) ?? 'Ultima serie fatta: puoi terminare l\'allenamento';
}

restBox.addEventListener('click', e => {
  const b = e.target.closest('[data-rest]');
  if (!b) return;
  if (b.dataset.rest === 'skip') return stopRest();
  restEnd += +b.dataset.rest * 1000;
  restTotal = Math.max(restTotal, Math.ceil((restEnd - Date.now()) / 1000));
  if (restBox.classList.contains('over')) startRest(Math.max(5, Math.ceil((restEnd - Date.now()) / 1000)));
  else { native?.restStart?.(restEnd, restLabel); rememberRest(); }
  updateRest();
});

// ---------------------------------------------------------------------------
// Scheda dell'esercizio: foto animate, spiegazione, consigli, video
// ---------------------------------------------------------------------------
/** Scheda di un blocco a tempo: come funziona, gli esercizi (toccandoli si aprono) e i tuoi risultati. */
function openBlock(b) {
  const key = b.key ?? exKey(b);
  const hist = historyOf(key);
  sheet.innerHTML = `<div class="sheet-head"><div><h2>${esc(b.nome)}</h2><small>${esc(BLOCK_MODES[b.modo].label)}</small></div>
      <button class="icon" data-close aria-label="Chiudi">✕</button></div>
    <div class="from-plan"><b>Come funziona</b><p>${esc(BLOCK_MODES[b.modo].spiega)}</p></div>
    ${b.note ? `<p class="ex-note">${esc(b.note)}</p>` : ''}
    <h3>Esercizi</h3>
    <div class="block-ex">${b.esercizi.map((x, k) => `<button class="block-ex-row" data-blocksub="${k}">${thumb(x)}
      <span><b>${esc(x.ripetizioni || '')}</b> ${esc(x.nome)}</span><span class="chev">›</span></button>`).join('')}</div>
    ${hist.length ? `<h3>Le tue volte</h3>${hist.slice(0, 6).map(h => `<div class="row static"><span><b>${shortDate(h.session.date)}</b><small>${esc(setsText(h.item))}</small></span></div>`).join('')}` : ''}`;
  sheet.dataset.block = JSON.stringify(b.esercizi);
  if (!sheet.open) sheet.showModal();
}

function openExercise(item) {
  if (item.kind === 'blocco') return openBlock(item);
  const lib = libOf(item) ?? (item.id ? item : null);
  const nome = item.nome;
  const video = `https://www.youtube.com/results?search_query=${encodeURIComponent(nome + ' esecuzione corretta')}`;
  const key = item.key ?? (item.ex ? item.ex : item.id ? item.id : exKey(item));
  const hist = historyOf(key);
  sheet.innerHTML = `<div class="sheet-head"><div><h2>${esc(nome)}</h2><small>${esc(item.muscoli || lib?.muscoli || '')}</small></div>
      <button class="icon" data-close aria-label="Chiudi">✕</button></div>
    ${lib?.foto ? `<div class="flip single"><img src="${lib.foto}" alt=""></div>`
      : hasImg(lib) ? `<div class="flip"><img src="${imgSrc(lib, 0)}" alt="Posizione di partenza"><img src="${imgSrc(lib, 1)}" alt="Posizione finale"></div>
      <p class="caption">Le due foto si alternano: partenza e arrivo del movimento.</p>` : ''}
    ${item.dettaglio || item.note ? `<div class="from-plan"><b>Dalla scheda</b>${item.dettaglio ? `<p>${esc(item.dettaglio)}</p>` : ''}${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>` : ''}
    ${lib ? `<h3>Come si fa</h3><ol class="steps">${lib.passi.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      <h3>Consigli</h3><ul class="tips">${lib.consigli.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
      : '<p class="note">Questo esercizio non è nella libreria dell\'app: guarda il video per l\'esecuzione.</p>'}
    <a class="video" href="${video}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M10 8.5v7l6-3.5z"/></svg>Guarda un video su YouTube</a>
    ${hist.length ? `<a class="link-row" href="#/esercizio/${encodeURIComponent(key)}" data-close>I tuoi progressi: ${plural(hist.length, 'volta', 'volte')} ›</a>` : ''}
    ${lib?.custom ? `<button class="secondary wide" data-editcustom="${lib.id}">Modifica questo esercizio</button>` : ''}`;
  if (!sheet.open) sheet.showModal();
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
      <button class="secondary" data-newplan>Crea una scheda</button></div>
    <button class="link" data-prompt>Come farla preparare a Claude</button>
    ${plans.length ? plans.map(p => `<a class="plan-card ${p.id === activeId ? 'active' : ''}" href="#/scheda/${p.id}">
        <span><b>${esc(p.nome)}</b><small>${esc([p.persona, p.obiettivo].filter(Boolean).join(' · '))}</small>
        <small>${plural(p.giorni.length, 'giorno', 'giorni')}: ${p.giorni.map(d => esc(d.nome)).join(', ')} · ${planDateText(p)}</small></span>
        ${p.id === activeId ? '<span class="badge">In uso</span>' : '<span class="chev">›</span>'}</a>`).join('')
      : '<p class="note">Ancora nessuna scheda. Chiedi a Claude la scheda nel formato di AC Training (vedi "Come farla preparare a Claude"), poi importala qui.</p>'}`;
}

function planDetail(id) {
  const p = plans.find(x => x.id === id);
  if (!p) { location.hash = '#/schede'; return; }
  const missing = p.giorni.flatMap(d => d.esercizi.flatMap(e => (e.kind === 'blocco' ? e.esercizi : [e]))).filter(e => !e.ex).length;
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
    <div class="actions plan-tools">
      <a class="secondary" href="#/modifica/${p.id}">Modifica</a>
      <button class="secondary" data-dupplan="${p.id}">Duplica</button>
      <button class="secondary" data-shareplan="${p.id}">Condividi</button></div>
    <button class="link danger" data-delplan="${p.id}">Elimina questa scheda</button>`;
}

const planDateText = p => (p.updated ? `modificata il ${shortDate(p.updated)}` : p.manual ? `creata il ${shortDate(p.imported)}` : `importata il ${shortDate(p.imported)}`);

// ---------------------------------------------------------------------------
// Editor delle schede: nome, giorni ed esercizi. Ogni modifica si salva subito (niente da perdere
// se si esce dalla pagina); gli allenamenti già fatti non cambiano, i progressi seguono l'esercizio.
// ---------------------------------------------------------------------------
const editPlan = () => plans.find(p => p.id === location.hash.split('/')[2]);
const dayLabel = d => (d.nome.length <= 2 ? 'Allenamento ' + d.nome : d.nome);
const nextDayName = p => {
  for (let c = 65; c < 91; c++) if (!p.giorni.some(d => d.nome === String.fromCharCode(c))) return String.fromCharCode(c);
  return String(p.giorni.length + 1);
};

async function touchPlan(p) {
  p.updated = today();
  await savePlans();
}

function newPlan() {
  const p = { id: 'p' + Date.now(), formato: 'ac-training/1', nome: 'La mia scheda', persona: '', obiettivo: '', manual: true,
    note: [], riscaldamento: [], defaticamento: [], regole: [], giorni: [{ nome: 'A', titolo: '', esercizi: [] }], imported: today() };
  plans.push(p);
  if (!activeId) { activeId = p.id; setSetting('activePlan', activeId); }
  savePlans();
  location.hash = '#/modifica/' + p.id;
}

function planEditor() {
  const p = editPlan();
  if (!p) { location.hash = '#/schede'; return; }
  const lines = k => esc((p[k] ?? []).join('\n'));
  view.innerHTML = `<header class="top"><a class="back" href="#/scheda/${p.id}" aria-label="Indietro">‹</a><h1>Modifica scheda</h1></header>
    <p class="note">Le modifiche si salvano da sole. Gli allenamenti già fatti restano com'erano.</p>
    <label class="field stack"><span>Nome della scheda</span><input data-pf="nome" value="${esc(p.nome)}" autocomplete="off"></label>
    <label class="field stack"><span>Obiettivo</span><input data-pf="obiettivo" value="${esc(p.obiettivo)}" placeholder="es. glutei e gambe" autocomplete="off"></label>
    <details class="box"><summary>Note, regole, riscaldamento, defaticamento</summary>
      <div class="box-body">
        ${[['note', 'Come funziona'], ['regole', 'Regole'], ['riscaldamento', 'Riscaldamento'], ['defaticamento', 'Defaticamento']].map(([k, label]) =>
          `<label class="field stack"><span>${label} <small>(una voce per riga)</small></span><textarea data-pl="${k}" rows="3">${lines(k)}</textarea></label>`).join('')}
      </div></details>
    ${p.giorni.map((d, di) => `<section class="ed-day" data-day-ed="${di}">
      <div class="ed-day-head">
        <input class="ed-day-name" data-df="nome" value="${esc(d.nome)}" aria-label="Nome del giorno">
        <input data-df="titolo" value="${esc(d.titolo)}" placeholder="Muscoli del giorno (es. Glutei e gambe)" aria-label="Titolo del giorno">
      </div>
      <div class="ed-list">${d.esercizi.map((e, i) => `<div class="ed-ex">
        <button class="ed-ex-main" data-editex="${di}:${i}">${thumb(e)}<span class="ex-body"><b>${i + 1}. ${esc(e.nome)}</b>
          <span class="ex-target">${e.kind === 'blocco' ? esc(blockSummary(e)) : `${e.serie} × ${esc(e.ripetizioni)} · ${e.riposo} s${e.superserie ? ` · ${esc(e.superserie)}` : ''}`}</span>
          ${e.dettaglio ? `<small>${esc(e.dettaglio)}</small>` : ''}</span></button>
        <span class="ed-move"><button data-exup="${di}:${i}" ${i ? '' : 'disabled'} aria-label="Sposta su">▲</button>
          <button data-exdown="${di}:${i}" ${i < d.esercizi.length - 1 ? '' : 'disabled'} aria-label="Sposta giù">▼</button></span>
      </div>`).join('') || '<p class="note">Nessun esercizio: aggiungine uno.</p>'}</div>
      <div class="ed-day-tools">
        <button class="secondary" data-addex="${di}">+ Esercizio</button>
        <button class="secondary" data-addblock="${di}">+ Blocco a tempo</button>
        <button class="link" data-dayup="${di}" ${di ? '' : 'disabled'}>▲ Giorno</button>
        <button class="link" data-daydup="${di}">Duplica giorno</button>
        <button class="link danger-inline" data-daydel="${di}">Elimina giorno</button>
      </div>
    </section>`).join('')}
    <button class="secondary wide" data-addday>+ Aggiungi un giorno</button>
    <a class="primary" href="#/scheda/${p.id}">Fatto</a>`;
}

// Blocco a tempo nell'editor: tipo, tempi e gli esercizi scritti uno per riga ("12 Kettlebell swing").
let blockDraft = null;   // { di, i, b, lines }
const BLOCK_FIELDS = {
  emom: ['minuti', 'ogni', 'alterna'], amrap: ['minuti'], fortime: ['giri', 'cap'],
  tabata: ['giri', 'lavoro', 'pausa'], intervalli: ['giri', 'lavoro', 'pausa'], circuito: ['giri', 'recupero'],
};
const FIELD_LABELS = { minuti: 'Durata (minuti)', ogni: 'Ogni quanti secondi (60 = ogni minuto)', giri: 'Giri', lavoro: 'Lavoro (secondi)',
  pausa: 'Pausa (secondi)', recupero: 'Recupero a fine giro (secondi)', cap: 'Tempo massimo (minuti)' };

function blockEditor(di, i = null) {
  const p = editPlan();
  const src = i == null ? buildBlock({ modo: 'emom', esercizi: [] }) : p.giorni[di].esercizi[i];
  blockDraft = { di, i, b: structuredClone(src), lines: src.esercizi.map(x => `${x.ripetizioni ? x.ripetizioni + ' ' : ''}${x.nome}`).join('\n') };
  renderBlockEditor();
}

function renderBlockEditor() {
  const { b, i } = blockDraft;
  sheet.innerHTML = `<div class="sheet-head"><div><h2>${i == null ? 'Nuovo blocco a tempo' : 'Modifica blocco'}</h2><small>${esc(BLOCK_MODES[b.modo].label)}</small></div>
      <button class="icon" data-close aria-label="Chiudi">✕</button></div>
    <div class="chips wrap">${Object.entries(BLOCK_MODES).map(([k, m]) => `<button class="chip ${b.modo === k ? 'on' : ''}" data-blockmode="${k}">${m.label}</button>`).join('')}</div>
    <p class="note">${esc(BLOCK_MODES[b.modo].spiega)}</p>
    <div class="ed-form" data-blockform>
      ${BLOCK_FIELDS[b.modo].map(f => (f === 'alterna'
        ? `<label class="check"><input type="checkbox" data-bf="alterna" ${b.alterna ? 'checked' : ''}> Alterna gli esercizi: un minuto ciascuno</label>`
        : `<label class="field stack"><span>${FIELD_LABELS[f]}</span><input data-bf="${f}" inputmode="numeric" value="${b[f] ?? ''}"></label>`)).join('')}
      <label class="field stack"><span>Esercizi <small>(uno per riga, con le ripetizioni davanti: "12 Kettlebell swing", "30 secondi Plank")</small></span>
        <textarea data-bf="lines" rows="5" placeholder="12 Kettlebell swing&#10;8 Piegamenti&#10;15 Crunch">${esc(blockDraft.lines)}</textarea></label>
      <label class="field stack"><span>Note</span><textarea data-bf="note" rows="2">${esc(b.note)}</textarea></label>
    </div>
    <button class="primary" data-saveblock>Salva il blocco</button>
    ${i != null ? '<button class="link danger" data-delblock>Togli il blocco</button>' : ''}`;
  if (!sheet.open) sheet.showModal();
}

/** Legge i campi del blocco nella bozza (prima di cambiare tipo o di salvare). */
function readBlockForm() {
  const { b } = blockDraft;
  for (const el of sheet.querySelectorAll('[data-bf]')) {
    const f = el.dataset.bf;
    if (f === 'alterna') b.alterna = el.checked;
    else if (f === 'lines') blockDraft.lines = el.value;
    else if (f === 'note') b.note = el.value.trim();
    else b[f] = num(el.value);
  }
}

async function saveBlock() {
  readBlockForm();
  const { di, i, b } = blockDraft;
  const lines = blockDraft.lines.split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return toast('Scrivi almeno un esercizio, uno per riga.');
  const block = buildBlock({ ...b, esercizi: lines });
  const p = editPlan();
  if (i == null) p.giorni[di].esercizi.push(block);
  else p.giorni[di].esercizi[i] = block;
  await touchPlan(p);
  sheet.close();
  planEditor();
  const unknown = block.esercizi.filter(x => !x.ex).map(x => x.nome);
  toast(unknown.length ? `Salvato. Non in libreria (niente foto): ${unknown.join(', ')}` : 'Blocco salvato');
}

// Scelta dell'esercizio: dalla libreria (con foto e spiegazione) oppure un nome libero.
let pickTarget = null;   // { di, i? }: giorno e, se si sta cambiando un esercizio, la sua posizione
function pickExercise(di, i = null) {
  pickTarget = { di, i };
  sheet.innerHTML = `<div class="sheet-head"><h2>${i == null ? 'Aggiungi esercizio' : 'Cambia esercizio'}</h2><button class="icon" data-close>✕</button></div>
    <input type="search" id="pickSearch" placeholder="Cerca (es. glutei, panca, lat…)" autocomplete="off">
    <div id="pickList">${pickList('')}</div>`;
  if (!sheet.open) sheet.showModal();   // dal modulo dell'esercizio la finestra è già aperta
}

// ---------------------------------------------------------------------------
// Cambio di un esercizio durante l'allenamento (es. macchina occupata): solo alternative che lavorano
// lo stesso muscolo principale, ognuna con il consiglio su quando sceglierla e il peso dell'ultima volta.
// Vale per questo allenamento; con la spunta anche per la scheda.
// ---------------------------------------------------------------------------
let swapIndex = null;

function swapSheet(i) {
  swapIndex = i;
  const it = current.items[i];
  const { focus, list } = alternatives(it.ex, it.muscoli);
  const row = e => {
    const last = historyOf(e.id)[0];
    return `<button class="row pick swap-row" data-swappick="${e.id}">${thumb({ ex: e.id })}
      <span><b>${esc(e.nome)}</b><small>${esc(e.consiglio)}</small>
        ${last ? `<small class="swap-last">Ultima volta: ${esc(setsText(last.item))}</small>` : ''}</span></button>`;
  };
  // Prima quelli che hai già fatto (sai già che peso usare), poi gli altri.
  const sorted = [...list].sort((a, b) => (historyOf(b.id).length > 0) - (historyOf(a.id).length > 0));
  sheet.innerHTML = `<div class="sheet-head"><div><h2>Cambia esercizio</h2><small>al posto di ${esc(it.nome)}${focus ? ` · ${esc(focus)}` : ''}</small></div>
      <button class="icon" data-close aria-label="Chiudi">✕</button></div>
    <div class="swap-tips"><b>Come scegliere</b>
      <ul><li>Stesse serie, ripetizioni e recupero della scheda: cambia solo l'attrezzo.</li>
        <li>La prima volta parti più leggero: un esercizio nuovo si sente di più.</li>
        <li>Macchina occupata? Le versioni con manubri o ai cavi sono quasi sempre libere.</li></ul></div>
    <label class="check"><input type="checkbox" id="swapPlan"> Cambialo anche nella scheda, per le prossime volte</label>
    ${sorted.length ? `<h3>Altri esercizi per ${esc(focus)}</h3>${sorted.map(row).join('')}`
      : `<p class="note">Non so che muscolo lavora "${esc(it.nome)}": cerca un esercizio da usare al suo posto.</p>
        <input type="search" id="swapSearch" placeholder="Cerca un esercizio" autocomplete="off"><div id="swapList"></div>`}`;
  sheet.showModal();
}

// Solo per gli esercizi di cui non si conosce il muscolo (fuori libreria e senza "muscoli" nella scheda).
function swapList(q) {
  if (!q) return '';
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const found = EXERCISES.filter(e => [e.nome, e.muscoli, e.gruppo, ...e.alias].some(t => norm(t).includes(norm(q))));
  return `<button class="row pick" data-swapfree><span><b>Usa "${esc(q)}"</b><small>esercizio non in libreria</small></span></button>
    ${found.map(e => `<button class="row pick" data-swappick="${e.id}">${thumb({ ex: e.id })}<span><b>${esc(e.nome)}</b><small>${esc(e.muscoli)}</small></span></button>`).join('')}`;
}

async function swapExercise(lib, freeName = null) {
  const i = swapIndex;
  const old = current.items[i];
  const done = old.sets.filter(s => s.done).length;
  if (done && !confirm(`Hai già segnato ${plural(done, 'serie', 'serie')} di ${old.nome}: restano su quell'esercizio e il nuovo parte dalla serie dopo. Continuo?`)) return;
  const fresh = buildItem({ id: lib?.id, esercizio: lib?.nome ?? freeName, serie: old.serie, ripetizioni: old.ripetizioni,
    riposo: old.riposo, superserie: old.superserie, note: '' });
  const key = exKey(fresh);
  const last = historyOf(key)[0]?.item;
  const left = Math.max(1, old.sets.length - done);
  const sets = Array.from({ length: left }, (_, k) => {
    const prev = last?.sets[Math.min(k, last.sets.length - 1)];
    return { kg: prev?.kg ?? null, reps: null, val: prev?.val ?? null, done: false };
  });
  const newItem = { ...fresh, key, sets };
  if (done) {
    old.sets = old.sets.filter(s => s.done);   // le serie fatte restano al vecchio esercizio
    current.items.splice(i + 1, 0, newItem);
  } else {
    current.items[i] = newItem;
  }
  if ($('#swapPlan')?.checked) {
    const plan = plans.find(p => p.id === current.planId);
    const day = plan?.giorni[current.dayIndex];
    const pos = day?.esercizi.findIndex(e => exKey(e) === old.key);
    if (day && pos >= 0) {
      day.esercizi[pos] = { ...fresh, serie: day.esercizi[pos].serie };
      plan.updated = today();
      await savePlans();
    }
  }
  await saveCurrent();
  sheet.close();
  toast(`Ora fai: ${newItem.nome}`);
  rerenderWorkout();
}

function pickList(q) {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const match = e => !q || [e.nome, e.muscoli, e.gruppo, ...e.alias].some(t => norm(t).includes(norm(q)));
  const groups = GROUPS.map(g => {
    const list = EXERCISES.filter(e => e.gruppo === g && match(e));
    return list.length ? `<h3>${g}</h3>${list.map(e => `<button class="row pick" data-pick="${e.id}">${thumb({ ex: e.id })}
      <span><b>${esc(e.nome)}</b><small>${esc(e.muscoli)}</small></span></button>`).join('')}` : '';
  }).join('');
  return `${q ? `<button class="row pick" data-pickcreate><span><b>Crea l'esercizio "${esc(q)}"</b><small>con muscolo, spiegazione e una foto tua: lo ritrovi sempre</small></span></button>
    <button class="row pick" data-pickfree><span><b>Usa solo il nome "${esc(q)}"</b><small>senza foto, con il video</small></span></button>` : ''}
    ${groups || '<p class="note">Nessun esercizio in libreria con questo nome.</p>'}`;
}

/** Valori iniziali sensati in base al tipo di esercizio. */
function defaultsFor(lib) {
  if (lib?.tipo === 'min') return { serie: 1, ripetizioni: '10 minuti', riposo: 0 };
  if (lib?.tipo === 'sec') return { serie: 3, ripetizioni: '30 secondi', riposo: 45 };
  if (lib?.gruppo === 'Addome') return { serie: 3, ripetizioni: '15', riposo: 45 };
  return { serie: 3, ripetizioni: '12', riposo: 60 };
}

async function pickDone(lib, freeName = null) {
  const p = editPlan();
  const { di, i } = pickTarget;
  const day = p.giorni[di];
  if (i == null) {
    day.esercizi.push(buildItem({ id: lib?.id, esercizio: lib?.nome ?? freeName, ...defaultsFor(lib) }));
    await touchPlan(p);
    planEditor();
    exerciseEditor(di, day.esercizi.length - 1);
  } else {
    // Cambio esercizio: restano serie, ripetizioni e riposo; cambiano nome, foto e muscoli.
    const old = day.esercizi[i];
    day.esercizi[i] = buildItem({ id: lib?.id, esercizio: lib?.nome ?? freeName, serie: old.serie, ripetizioni: old.ripetizioni,
      riposo: old.riposo, superserie: old.superserie, note: old.note });
    await touchPlan(p);
    planEditor();
    exerciseEditor(di, i);
  }
}

function exerciseEditor(di, i) {
  const p = editPlan();
  const e = p.giorni[di].esercizi[i];
  const chips = (key, values, current) => `<div class="quick">${values.map(v => `<button class="chip ${String(v) === String(current) ? 'on' : ''}" data-quick="${key}" data-value="${esc(v)}">${esc(key === 'riposo' ? v + ' s' : v)}</button>`).join('')}</div>`;
  sheet.innerHTML = `<div class="sheet-head"><div><h2>${esc(e.nome)}</h2><small>${esc(dayLabel(p.giorni[di]))} · esercizio ${i + 1}</small></div>
      <button class="icon" data-close aria-label="Chiudi">✕</button></div>
    <div class="ed-form" data-exform="${di}:${i}">
      <button class="row" data-changeex><span>${thumb(e)}</span><span><b>${esc(e.nome)}</b><small>Tocca per cambiare esercizio</small></span><span class="chev">›</span></button>
      <label class="field stack"><span>Dettaglio <small>(variante, es. "presa larga")</small></span><input data-ef="dettaglio" value="${esc(e.dettaglio)}" autocomplete="off"></label>
      <label class="field stack"><span>Muscoli</span><input data-ef="muscoli" value="${esc(e.muscoli)}" autocomplete="off"></label>
      <div class="field stack"><span>Serie</span>
        <div class="stepper"><button data-step="-1" aria-label="Una serie in meno">−</button><b id="serieVal">${e.serie}</b><button data-step="1" aria-label="Una serie in più">+</button></div></div>
      <label class="field stack"><span>Ripetizioni <small>(es. 12, 8-10, 30 secondi, 12 per gamba)</small></span><input data-ef="ripetizioni" value="${esc(e.ripetizioni)}" autocomplete="off"></label>
      ${chips('ripetizioni', ['8-10', '10', '12', '15', '30 secondi', '10 minuti'], e.ripetizioni)}
      <label class="field stack"><span>Riposo (secondi)</span><input data-ef="riposo" inputmode="numeric" value="${e.riposo}"></label>
      ${chips('riposo', [0, 30, 45, 60, 90, 120], e.riposo)}
      <label class="field stack"><span>Peso consigliato (kg) <small>(facoltativo)</small></span><input data-ef="peso" inputmode="decimal" value="${e.peso ?? ''}"></label>
      <label class="field stack"><span>Superserie <small>(stessa sigla, es. S1, per esercizi di fila senza riposo)</small></span><input data-ef="superserie" value="${esc(e.superserie)}" autocomplete="off"></label>
      <label class="field stack"><span>Note</span><textarea data-ef="note" rows="2">${esc(e.note)}</textarea></label>
    </div>
    <button class="primary" data-saveex>Salva</button>
    <div class="actions"><button class="secondary" data-dupex>Duplica</button><button class="secondary danger-text" data-delex>Elimina esercizio</button></div>`;
  if (!sheet.open) sheet.showModal();
}

/** Legge il modulo dell'esercizio e lo salva nella scheda. */
async function saveExerciseForm() {
  const form = sheet.querySelector('[data-exform]');
  const [di, i] = form.dataset.exform.split(':').map(Number);
  const p = editPlan();
  const old = p.giorni[di].esercizi[i];
  const f = k => form.querySelector(`[data-ef="${k}"]`).value;
  p.giorni[di].esercizi[i] = buildItem({ id: old.ex, esercizio: old.nome, dettaglio: f('dettaglio'), muscoli: f('muscoli'),
    serie: +$('#serieVal').textContent, ripetizioni: f('ripetizioni').trim() || '10', riposo: f('riposo'), peso: f('peso'),
    superserie: f('superserie'), note: f('note') });
  await touchPlan(p);
}

/** Tocchi dell'editor delle schede; true se il tocco era suo. */
async function planEditorClick(t) {
  const pos = (sel, key) => t.closest(sel)?.dataset[key]?.split(':').map(Number);
  const dup = t.closest('[data-dupplan]');
  if (dup) {
    const src = plans.find(p => p.id === dup.dataset.dupplan);
    const copy = { ...structuredClone(src), id: 'p' + Date.now(), nome: `${src.nome} (copia)`, manual: true, updated: null, imported: today() };
    plans.push(copy);
    await savePlans();
    toast('Scheda duplicata: ora puoi modificarla');
    location.hash = '#/modifica/' + copy.id;
    return true;
  }
  const share = t.closest('[data-shareplan]');
  if (share) { sharePlan(plans.find(p => p.id === share.dataset.shareplan)); return true; }
  const p = editPlan();
  if (!p || !location.hash.startsWith('#/modifica/')) return false;

  let at;
  if ((at = pos('[data-editex]', 'editex'))) {
    if (p.giorni[at[0]].esercizi[at[1]].kind === 'blocco') blockEditor(...at);
    else exerciseEditor(...at);
    return true;
  }
  if ((at = pos('[data-addex]', 'addex'))) { pickExercise(at[0]); return true; }
  if ((at = pos('[data-addblock]', 'addblock'))) { blockEditor(at[0]); return true; }
  const mode = t.closest('[data-blockmode]');
  if (mode && blockDraft) {
    readBlockForm();
    // Tempi predefiniti del nuovo tipo (es. Tabata 8 × 20"/10"), esercizi e note restano.
    const fresh = buildBlock({ modo: mode.dataset.blockmode, esercizi: [] });
    blockDraft.b = { ...fresh, note: blockDraft.b.note };
    renderBlockEditor();
    return true;
  }
  if (t.closest('[data-saveblock]')) { await saveBlock(); return true; }
  if (t.closest('[data-delblock]') && blockDraft) {
    if (!confirm('Togliere questo blocco dalla scheda?')) return true;
    p.giorni[blockDraft.di].esercizi.splice(blockDraft.i, 1);
    await touchPlan(p);
    sheet.close();
    planEditor();
    return true;
  }
  for (const [sel, key, delta] of [['[data-exup]', 'exup', -1], ['[data-exdown]', 'exdown', 1]]) {
    if ((at = pos(sel, key))) {
      const list = p.giorni[at[0]].esercizi;
      const [moved] = list.splice(at[1], 1);
      list.splice(at[1] + delta, 0, moved);
      await touchPlan(p);
      planEditor();
      return true;
    }
  }
  if (t.closest('[data-addday]')) {
    p.giorni.push({ nome: nextDayName(p), titolo: '', esercizi: [] });
    await touchPlan(p);
    planEditor();
    scrollTo(0, document.body.scrollHeight);
    return true;
  }
  if ((at = pos('[data-dayup]', 'dayup'))) {
    const [moved] = p.giorni.splice(at[0], 1);
    p.giorni.splice(at[0] - 1, 0, moved);
    await touchPlan(p);
    planEditor();
    return true;
  }
  if ((at = pos('[data-daydup]', 'daydup'))) {
    p.giorni.splice(at[0] + 1, 0, { ...structuredClone(p.giorni[at[0]]), nome: nextDayName(p) });
    await touchPlan(p);
    planEditor();
    return true;
  }
  if ((at = pos('[data-daydel]', 'daydel'))) {
    if (p.giorni.length === 1) { toast('Una scheda deve avere almeno un giorno.'); return true; }
    if (!confirm(`Eliminare ${dayLabel(p.giorni[at[0]])} con i suoi esercizi?`)) return true;
    p.giorni.splice(at[0], 1);
    await touchPlan(p);
    planEditor();
    return true;
  }
  const pick = t.closest('[data-pick]');
  if (pick) { await pickDone(exerciseById(pick.dataset.pick)); return true; }
  if (t.closest('[data-pickfree]')) { await pickDone(null, $('#pickSearch').value.trim()); return true; }
  if (t.closest('[data-pickcreate]')) { customForm(null, $('#pickSearch').value.trim(), lib => pickDone(lib)); return true; }

  // Modulo dell'esercizio
  const form = sheet.querySelector('[data-exform]');
  if (!form || !sheet.contains(t)) return false;
  const [di, i] = form.dataset.exform.split(':').map(Number);
  const step = t.closest('[data-step]');
  if (step) { const el = $('#serieVal'); el.textContent = Math.max(1, Math.min(10, +el.textContent + +step.dataset.step)); return true; }
  const quick = t.closest('[data-quick]');
  if (quick) {
    form.querySelector(`[data-ef="${quick.dataset.quick}"]`).value = quick.dataset.value;
    for (const c of sheet.querySelectorAll(`[data-quick="${quick.dataset.quick}"]`)) c.classList.toggle('on', c === quick);
    return true;
  }
  if (t.closest('[data-changeex]')) { await saveExerciseForm(); pickExercise(di, i); return true; }
  if (t.closest('[data-saveex]')) { await saveExerciseForm(); sheet.close(); planEditor(); toast('Esercizio salvato'); return true; }
  if (t.closest('[data-dupex]')) {
    await saveExerciseForm();
    const list = p.giorni[di].esercizi;
    list.splice(i + 1, 0, structuredClone(list[i]));
    await touchPlan(p);
    planEditor();
    exerciseEditor(di, i + 1);
    toast('Esercizio duplicato');
    return true;
  }
  if (t.closest('[data-delex]')) {
    if (!confirm(`Togliere "${p.giorni[di].esercizi[i].nome}" da questo giorno?`)) return true;
    p.giorni[di].esercizi.splice(i, 1);
    await touchPlan(p);
    sheet.close();
    planEditor();
    return true;
  }
  return false;
}

/** Esercizi creati da te usati in una scheda (anche dentro i blocchi): viaggiano con la scheda condivisa. */
const customUsedIn = p => {
  const ids = new Set(p.giorni.flatMap(d => d.esercizi.flatMap(e => (e.kind === 'blocco' ? e.esercizi.map(x => x.ex) : [e.ex]))));
  return customExercises.filter(c => ids.has(c.id));
};

async function sharePlan(p) {
  const text = planToJson(p, customUsedIn(p));
  if (native?.shareText) return native.shareText(`Scheda ${p.nome}`, text);
  if (navigator.share) { try { await navigator.share({ title: `Scheda ${p.nome}`, text }); return; } catch (err) { if (err.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Scheda copiata: incollala dove vuoi mandarla'); } catch { toast('Condivisione non disponibile'); }
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
    let addedCustom = 0;
    const plan = parsePlan(text, list => {   // esercizi creati da chi ha mandato la scheda
      for (const c of list) {
        if (customExercises.some(x => x.nome.toLowerCase() === c.nome.toLowerCase())) continue;
        customExercises.push({ ...c, id: customExercises.some(x => x.id === c.id) || !c.id ? 'u-' + Date.now() + addedCustom : c.id });
        addedCustom++;
      }
      if (addedCustom) { setCustomExercises(customExercises); setSetting('customExercises', customExercises); }
    });
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
    const missing = plan.giorni.flatMap(d => d.esercizi.flatMap(e => (e.kind === 'blocco' ? e.esercizi : [e]))).filter(e => !e.ex).length;
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
    const e = byKey.get(it.key) ?? { key: it.key, nome: it.nome, tipo: it.tipo, ex: it.ex, kind: it.kind, modo: it.modo, last: s.date, count: 0, best: null, bestE: 0 };
    e.count++;
    e.last = s.date;
    e.nome = it.nome;
    if (it.tipo === 'blocco') {   // risultato migliore del blocco a tempo
      const r = it.result ?? {};
      if (it.modo === 'amrap' && (!e.best || (r.giri ?? 0) > (e.best.giri ?? 0))) e.best = r;
      else if (it.modo === 'fortime' && r.finito && (!e.best || r.tempo < e.best.tempo)) e.best = r;
      byKey.set(it.key, e);
      continue;
    }
    for (const set of it.sets) {
      if (it.tipo === 'kg' || it.tipo === 'corpo') {
        if (!e.best || (set.kg ?? 0) > (e.best.kg ?? 0)) e.best = set;
        e.bestE = Math.max(e.bestE, e1rm(set.kg, set.reps));
      } else if (!e.best || (set.val ?? 0) > (e.best.val ?? 0)) e.best = set;
    }
    byKey.set(it.key, e);
  }
  const exercises = [...byKey.values()].sort((a, b) => b.last.localeCompare(a.last));
  const bestText = e => (e.tipo === 'blocco' ? (e.modo === 'amrap' && e.best ? `record ${plural(e.best.giri, 'giro', 'giri')}`
    : e.modo === 'fortime' && e.best ? `miglior tempo ${clock(e.best.tempo)}` : 'blocco a tempo')
    : !e.best ? '' : e.tipo === 'sec' ? `record ${fmt(e.best.val)} s` : e.tipo === 'min' ? `record ${fmt(e.best.val)} min`
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
  const isBlock = last.tipo === 'blocco';
  const chart = isBlock
    ? (last.modo === 'amrap'
      ? lines({ labels, series: [{ name: 'Giri', color: C_MAIN, values: hist.map(h => h.item.result?.giri ?? null) }], fmt: v => plural(v, 'giro', 'giri') })
      : last.modo === 'fortime'
        ? lines({ labels, series: [{ name: 'Minuti', color: C_MAIN, values: hist.map(h => (h.item.result?.finito ? Math.round(h.item.result.tempo / 6) / 10 : null)) }], fmt: v => `${fmt(v)} min` })
        : '<p class="note">Qui conta averlo fatto: guarda sotto tutte le volte.</p>')
    : weighted
    ? lines({ labels, series: [
      { name: 'Peso massimo', color: C_MAIN, values: hist.map(h => Math.max(...h.item.sets.map(s => s.kg ?? 0)) || null) },
      { name: 'Massimale stimato', color: C_ALT, values: hist.map(h => Math.round(Math.max(...h.item.sets.map(s => e1rm(s.kg, s.reps))) * 10) / 10 || null) },
    ], fmt: v => `${fmt(v)} kg` })
    : lines({ labels, series: [{ name: last.tipo === 'sec' ? 'Secondi' : 'Minuti', color: C_MAIN, values: hist.map(h => Math.max(...h.item.sets.map(s => s.val ?? 0))) }],
      fmt: v => `${fmt(v)} ${last.tipo === 'sec' ? 's' : 'min'}` });
  view.innerHTML = `<header class="top"><a class="back" href="#/progressi" aria-label="Indietro">‹</a><h1>${esc(last.nome)}</h1></header>
    ${hasImg(lib) ? `<div class="flip small"><img src="${imgSrc(lib, 0)}" alt=""><img src="${imgSrc(lib, 1)}" alt=""></div>` : ''}
    <button class="secondary wide" data-info="k:${esc(key)}">${isBlock ? 'Come funziona' : 'Come si fa'}</button>
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
    ${s.items.map((it, i) => (it.tipo === 'blocco' ? `<div class="edit-item"><b>${esc(it.nome)}</b>
      ${it.modo === 'amrap' ? `<div class="set"><input data-eblock="${i}:giri" inputmode="numeric" value="${it.result?.giri ?? ''}"><span class="u">giri</span></div>`
        : it.modo === 'fortime' ? `<div class="set"><input data-eblock="${i}:tempo" value="${it.result?.tempo != null ? clock(it.result.tempo) : ''}" placeholder="min:sec"><span class="u">tempo</span></div>`
        : `<p class="note">${esc(blockResultText(it))}</p>`}</div>` : `<div class="edit-item"><b>${esc(it.nome)}</b>
      ${it.sets.map((set, si) => `<div class="set" data-eset="${i}:${si}"><span class="set-n">${si + 1}</span>
        ${it.tipo === 'sec' || it.tipo === 'min'
          ? `<input data-ek="val" inputmode="decimal" value="${set.val ?? ''}"><span class="u">${it.tipo === 'sec' ? 'secondi' : 'minuti'}</span>`
          : it.tipo === 'corpo'
          ? `<input data-ek="reps" inputmode="numeric" value="${set.reps || ''}"><span class="u">ripetizioni</span>`
          : `<input data-ek="kg" inputmode="decimal" value="${set.kg || ''}" placeholder="kg"><span class="u">kg ×</span>
             <input data-ek="reps" inputmode="numeric" value="${set.reps || ''}"><span class="u">rip.</span>`}
        <button class="icon small" data-edelset="${i}:${si}" aria-label="Togli la serie">✕</button></div>`).join('')}
      <button class="link" data-eaddset="${i}">+ Serie</button></div>`)).join('')}
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
  for (const input of sheet.querySelectorAll('[data-eblock]')) {   // risultato dei blocchi: giri o tempo "12:34"
    const [i, field] = input.dataset.eblock.split(':');
    const it = editing.items[+i];
    it.result ??= {};
    if (field === 'giri') it.result.giri = Math.max(0, Math.round(num(input.value) ?? 0));
    else {
      const [m, sec] = input.value.split(/[:.,']/).map(x => parseInt(x, 10) || 0);
      it.result.tempo = input.value.match(/[:.,']/) ? m * 60 + sec : m * 60;
      it.result.finito = true;
    }
  }
}

async function saveEditedSession() {
  readEditFields();
  const s = editing;
  // Serie vuote e esercizi senza serie non contano.
  for (const it of s.items) {
    if (it.tipo === 'blocco') continue;
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
    <button class="primary" data-newcustom>+ Crea un esercizio</button>
    <input type="search" id="libSearch" placeholder="Cerca un esercizio" autocomplete="off">
    <div id="libList">${libraryList('')}</div>`;
}

function libraryList(q) {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const match = e => !q || [e.nome, e.muscoli, ...e.alias].some(t => norm(t).includes(norm(q)));
  const card = e => `<button class="ex-card" data-lib="${e.id}">${thumb({ ex: e.id })}
    <span class="ex-body"><b>${esc(e.nome)}</b><small>${esc(e.muscoli)}</small>${e.custom ? '<span class="ex-tip">Creato da te</span>' : ''}</span></button>`;
  const mine = EXERCISES.filter(e => e.custom && match(e));
  return `${mine.length ? `<h2>I tuoi esercizi</h2><div class="ex-list">${mine.map(card).join('')}</div>` : ''}
    ${GROUPS.map(g => {
      const list = EXERCISES.filter(e => e.gruppo === g && !e.custom && match(e));
      return list.length ? `<h2>${g}</h2><div class="ex-list">${list.map(card).join('')}</div>` : '';
    }).join('') || (mine.length ? '' : '<p class="note">Nessun esercizio trovato.</p>')}`;
}

// ---------------------------------------------------------------------------
// Esercizi creati da te: restano su questo telefono (nel backup) e viaggiano con le schede condivise.
// ---------------------------------------------------------------------------
let customExercises = [];
let customDraft = null;   // { id, nome, gruppo, focus, muscoli, tipo, passi, consigli, alias, foto, after? }
const TIPI = [['kg', 'Con pesi'], ['corpo', 'Corpo libero'], ['sec', 'A tempo (secondi)'], ['min', 'Cardio (minuti)']];

async function saveCustomList() {
  setCustomExercises(customExercises);
  await setSetting('customExercises', customExercises);
}

function customForm(id = null, prefill = '', after = null) {
  const src = customExercises.find(c => c.id === id);
  customDraft = src ? structuredClone(src) : { id: null, nome: prefill, gruppo: 'Glutei', focus: 'glutei', muscoli: '', tipo: 'kg', passi: [], consigli: [], alias: [], foto: null };
  customDraft.after = after;
  renderCustomForm();
}

function renderCustomForm() {
  const c = customDraft;
  sheet.innerHTML = `<div class="sheet-head"><div><h2>${c.id ? 'Modifica esercizio' : 'Nuovo esercizio'}</h2><small>Resta su questo telefono e viaggia con le schede che condividi</small></div>
      <button class="icon" data-close aria-label="Chiudi">✕</button></div>
    <div class="ed-form" data-customform>
      <label class="field stack"><span>Nome</span><input data-cf="nome" value="${esc(c.nome)}" placeholder="es. Pike push up" autocomplete="off"></label>
      <div class="custom-photo">${c.foto ? `<img src="${c.foto}" alt="">` : `<span class="thumb">${DUMBBELL}</span>`}
        <div><label class="secondary">${c.foto ? 'Cambia foto' : 'Aggiungi una foto'}<input type="file" id="customPhoto" accept="image/*" hidden></label>
          ${c.foto ? '<button class="link" data-customnophoto>Togli la foto</button>' : '<small class="note">Facoltativa: puoi scattarla in palestra.</small>'}</div></div>
      <div class="field stack"><span>Muscolo principale <small>(serve per proporlo quando cambi un esercizio)</small></span>
        <select data-cf="focus">${FOCUSES.map(f => `<option ${c.focus === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      <div class="field stack"><span>Gruppo nella libreria</span>
        <select data-cf="gruppo">${GROUPS.map(g => `<option ${c.gruppo === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <label class="field stack"><span>Muscoli <small>(es. "Spalle, tricipiti")</small></span><input data-cf="muscoli" value="${esc(c.muscoli)}" autocomplete="off"></label>
      <div class="field stack"><span>Come si registra</span><div class="chips wrap">
        ${TIPI.map(([v, l]) => `<button class="chip ${c.tipo === v ? 'on' : ''}" data-customtipo="${v}">${l}</button>`).join('')}</div></div>
      <label class="field stack"><span>Come si fa <small>(un passaggio per riga)</small></span><textarea data-cf="passi" rows="4">${esc(c.passi.join('\n'))}</textarea></label>
      <label class="field stack"><span>Consigli <small>(uno per riga)</small></span><textarea data-cf="consigli" rows="3">${esc(c.consigli.join('\n'))}</textarea></label>
      <label class="field stack"><span>Altri nomi <small>(separati da virgola: aiutano a riconoscerlo nelle schede)</small></span><input data-cf="alias" value="${esc(c.alias.join(', '))}" autocomplete="off"></label>
    </div>
    <button class="primary" data-savecustom>Salva l'esercizio</button>
    ${c.id ? '<button class="link danger" data-delcustom>Elimina questo esercizio</button>' : ''}`;
  if (!sheet.open) sheet.showModal();
}

function readCustomForm() {
  const c = customDraft;
  for (const el of sheet.querySelectorAll('[data-cf]')) {
    const f = el.dataset.cf;
    if (f === 'passi' || f === 'consigli') c[f] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (f === 'alias') c.alias = el.value.split(',').map(s => s.trim()).filter(Boolean);
    else c[f] = el.value.trim();
  }
}

async function saveCustom() {
  readCustomForm();
  const c = customDraft;
  if (!c.nome) return toast('Scrivi il nome dell\'esercizio.');
  const clash = EXERCISES.find(e => e.nome.toLowerCase() === c.nome.toLowerCase() && e.id !== c.id);
  if (clash && !confirm(`Esiste già "${clash.nome}"${clash.custom ? ' tra i tuoi esercizi' : ' nella libreria'}. Lo creo lo stesso?`)) return;
  const { after, ...data } = c;
  if (!data.id) { data.id = 'u-' + Date.now(); customExercises.push(data); }
  else customExercises = customExercises.map(x => (x.id === data.id ? data : x));
  await saveCustomList();
  customDraft = null;
  toast('Esercizio salvato');
  if (after) return after(exerciseById(data.id));
  sheet.close();
  route();
}

/** Foto ridotta (lato massimo 600 px, JPEG) per non occupare troppo spazio. */
async function shrinkPhoto(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function backupJson() {
  return JSON.stringify({ app: 'ac-training', version: 1, date: today(), profile, plans, activeId,
    sessions, body: bodyLog, customExercises });
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
    customExercises = data.customExercises ?? [];
    await saveCustomList();
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
  if (APP_VERSION === 'dev' || current || location.hash === '#/allenamento' || sheet.open) return;   // mai durante un allenamento
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
  // Esercizi creati da te
  if (t.closest('[data-newcustom]')) return customForm();
  const editCustom = t.closest('[data-editcustom]');
  if (editCustom) return customForm(editCustom.dataset.editcustom);
  const ctipo = t.closest('[data-customtipo]');
  if (ctipo && customDraft) { readCustomForm(); customDraft.tipo = ctipo.dataset.customtipo; return renderCustomForm(); }
  if (t.closest('[data-customnophoto]') && customDraft) { readCustomForm(); customDraft.foto = null; return renderCustomForm(); }
  if (t.closest('[data-savecustom]')) return saveCustom();
  if (t.closest('[data-delcustom]') && customDraft) {
    if (!confirm(`Eliminare "${customDraft.nome}"? Nelle schede resta il nome, senza foto e spiegazione.`)) return;
    customExercises = customExercises.filter(x => x.id !== customDraft.id);
    await saveCustomList();
    customDraft = null;
    sheet.close();
    route();
    return;
  }
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
  if (t.closest('[data-swap]')) return swapSheet(+t.closest('[data-item]').dataset.item);
  const swapPick = t.closest('[data-swappick]');
  if (swapPick) return swapExercise(exerciseById(swapPick.dataset.swappick));
  if (t.closest('[data-swapfree]')) return swapExercise(null, $('#swapSearch').value.trim());
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
  const blockStart = t.closest('[data-block-start]');
  if (blockStart) return openTimer(+blockStart.dataset.blockStart);
  const blockEx = t.closest('[data-blockex]');
  if (blockEx) { const [i, k] = blockEx.dataset.blockex.split(':').map(Number); openExercise(current.items[i].esercizi[k]); return; }
  const blockSub = t.closest('[data-blocksub]');
  if (blockSub) { openExercise(JSON.parse(sheet.dataset.block)[+blockSub.dataset.blocksub]); return; }
  if (t.closest('[data-finish]')) return finishWorkout();
  if (t.closest('[data-cancel]')) {
    if (!confirm('Annullare l\'allenamento? Le serie segnate non vengono salvate.')) return;
    if (tm) closeTimer();
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
  if (t.closest('[data-newplan]')) return newPlan();
  if (await planEditorClick(t)) return;
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

// Tasto OK/Invio della tastiera nei campi di una serie: dai kg passa alle ripetizioni, dall'ultimo
// campo segna la serie come fatta (e parte il recupero), come toccare ✓.
document.addEventListener('keydown', e => {
  const input = e.target;
  if (e.key !== 'Enter' || !input.dataset?.k || !current) return;
  e.preventDefault();
  const row = input.closest('[data-set]');
  const inputs = [...row.querySelectorAll('input[data-k]')];
  const next = inputs[inputs.indexOf(input) + 1];
  if (next) { next.focus(); return; }
  const i = +input.closest('[data-item]').dataset.item, si = +row.dataset.set;
  current.items[i].sets[si][input.dataset.k] = num(input.value);
  input.blur();
  if (!current.items[i].sets[si].done) { keepAwake(); toggleSet(i, si); }
});

// Tocco su ✓ con la tastiera aperta: senza questo il primo tocco chiude la tastiera, la pagina si
// sposta e il tocco può finire fuori dal pulsante (serie non segnata, niente recupero).
document.addEventListener('pointerdown', e => {
  if (e.target.closest('[data-done]') && document.activeElement?.dataset?.k) e.preventDefault();
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
  if (input.id === 'pickSearch') $('#pickList').innerHTML = pickList(input.value.trim());
  if (input.id === 'swapSearch') $('#swapList').innerHTML = swapList(input.value.trim());
});

document.addEventListener('change', async e => {
  // Editor delle schede: nome, obiettivo, testi e giorni si salvano quando si lascia il campo.
  const el = e.target;
  if (el.dataset.pf || el.dataset.pl || el.dataset.df) {
    const p = editPlan();
    if (!p) return;
    if (el.dataset.pf) p[el.dataset.pf] = el.value.trim() || (el.dataset.pf === 'nome' ? 'La mia scheda' : '');
    if (el.dataset.pl) p[el.dataset.pl] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (el.dataset.df) {
      const day = p.giorni[+el.closest('[data-day-ed]').dataset.dayEd];
      day[el.dataset.df] = el.value.trim() || (el.dataset.df === 'nome' ? nextDayName(p) : '');
    }
    await touchPlan(p);
    return;
  }
  const file = el.files?.[0];
  if (!file) return;
  if (el.id === 'customPhoto' && customDraft) {
    readCustomForm();
    try { customDraft.foto = await shrinkPhoto(file); } catch { toast('Non riesco a leggere questa foto'); }
    renderCustomForm();
    return;
  }
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
  const tab = { '': 'today', allenamento: 'today', schede: 'plans', scheda: 'plans', modifica: 'plans', progressi: 'progress', esercizio: 'progress',
    corpo: 'body', altro: 'more', libreria: 'more' }[page] ?? 'today';
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.tab === tab);
  document.body.classList.toggle('in-workout', page === 'allenamento');
  if (page === 'allenamento') workoutPage();
  else if (page === 'schede') plansPage();
  else if (page === 'scheda') planDetail(decodeURIComponent(arg));
  else if (page === 'modifica') planEditor();
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
customExercises = await getSetting('customExercises', []);
setCustomExercises(customExercises);   // prima delle schede, così le ritrovano
plans = await getSetting('plans', []);
// Le schede si ricollegano alla libreria a ogni avvio: così le correzioni (nuovi esercizi, secondi
// scritti come 30'') valgono anche per le schede già importate.
plans = plans.map(p => ({ ...p, giorni: p.giorni.map(d => ({ ...d, esercizi: d.esercizi.map(e => buildItem({ ...e, id: e.ex, esercizio: e.nome })) })) }));
activeId = await getSetting('activePlan', plans[0]?.id ?? null);
current = await getSetting('current', null);
profile = await getSetting('profile', { nome: '' });
lastBackup = await getSetting('lastBackup', null);
sessions = (await db.all('sessions')).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
bodyLog = (await db.all('body')).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
navigator.storage?.persist?.().catch(() => {});   // chiede al telefono di non cancellare mai i dati dell'app
route();
resumeRest();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
checkWebUpdate();
checkApkUpdate().then(() => { if (apkUpdate && !location.hash.replace(/^#\/?/, '')) todayPage(); });
