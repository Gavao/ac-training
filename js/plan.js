// Schede di allenamento: lettura del formato che si fa generare a Claude (vedi FORMATO.md) e controlli.
// Si accetta sia il JSON da solo sia la risposta intera di Claude con il blocco ```json dentro.
import { findExercise } from './exercises.js';

export const FORMAT = 'ac-training/1';

/** Obiettivo di una serie da "12", "8-10", "30 secondi", "10 minuti", "12 per gamba". */
export function parseTarget(text) {
  const t = String(text ?? '').toLowerCase();
  const range = t.match(/(\d+(?:[.,]\d+)?)\s*(?:-|–|—|a)\s*(\d+(?:[.,]\d+)?)/);
  const one = t.match(/(\d+(?:[.,]\d+)?)/);
  const num = s => parseFloat(s.replace(',', '.'));
  const min = range ? num(range[1]) : one ? num(one[1]) : null;
  const max = range ? num(range[2]) : min;
  // Secondi anche scritti 30s, 30", 30'' o 30″; minuti anche 10' (un apice solo).
  const unit = /\bmin|minut|\d\s*['’](?!['’])/.test(t) ? 'min' : /sec|secondi|\d\s*s\b|"|''|’’|″/.test(t) ? 'sec' : 'reps';
  const side = t.match(/per\s+(gamba|braccio|lato)/)?.[0] ?? '';
  return { min, max, unit, side };
}

/** Testo della risposta di Claude → oggetto JSON (cerca il blocco ```json o la prima graffa). */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!body.trim()) throw new Error('Non trovo la scheda nel testo: deve esserci il blocco JSON che inizia con {.');
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error('Il testo della scheda non è completo o ha un errore (' + err.message + '). Ricopia tutta la risposta di Claude.');
  }
}

const list = v => (Array.isArray(v) ? v : v ? [v] : []).map(String).map(s => s.trim()).filter(Boolean);

const first = (...values) => values.find(v => v != null && v !== '');
const minutes = v => (v == null || v === '' ? '' : ` (${v} min)`);

/** Riscaldamento o defaticamento scritto a blocchi ({ attivita: [{ nome, durata_minuti, note, esercizi }] }) → righe. */
function activityLines(v) {
  if (!v || Array.isArray(v) || typeof v !== 'object') return list(v);
  const items = v.attivita ?? v.attività ?? v.voci ?? [];
  return items.map(a => (typeof a === 'string' ? a : [
    `${a.nome ?? ''}${minutes(a.durata_minuti)}`,
    a.note,
    Array.isArray(a.esercizi) ? a.esercizi.map(x => (typeof x === 'string' ? x : `${x.nome}${x.ripetizioni != null ? ' ' + x.ripetizioni : ''}`)).join(' · ') : '',
  ].filter(Boolean).join(': ')));
}

/**
 * Claude non sempre usa gli stessi nomi: qui le varianti viste (es. "allenamenti" al posto di "giorni",
 * "riposo_secondi", "atleta", "frequenza") diventano il formato dell'app.
 */
function normalize(raw) {
  let giorni = raw.giorni ?? raw.allenamenti ?? raw.sedute ?? raw.schede;
  if (giorni && !Array.isArray(giorni) && typeof giorni === 'object') {   // { "A": {...}, "B": {...} }
    giorni = Object.entries(giorni).map(([nome, g]) => ({ nome, ...(Array.isArray(g) ? { esercizi: g } : g) }));
  }
  giorni = (giorni ?? []).map(g => ({
    nome: first(g.nome, g.giorno, g.lettera),
    titolo: first(g.titolo, g.focus, g.descrizione, ''),
    esercizi: [...(g.esercizi ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)).map(e => ({
      ...e,
      esercizio: first(e.esercizio, e.nome),
      riposo: first(e.riposo, e.riposo_secondi, e.recupero, e.recupero_secondi),
      peso: first(e.peso, e.peso_kg, e.peso_consigliato_kg),
    })),
  }));
  const a = raw.atleta ?? {};
  const f = raw.frequenza ?? {};
  const persona = first(raw.persona, [a.sesso === 'F' ? 'Donna' : a.sesso === 'M' ? 'Uomo' : a.sesso, a.eta && `${a.eta} anni`,
    a.peso_kg && `${a.peso_kg} kg`, a.altezza_cm && `${a.altezza_cm} cm`,
    f.allenamenti_a_settimana && `${f.allenamenti_a_settimana} allenamenti a settimana`].filter(Boolean).join(' · '));
  const rot = f.rotazione;
  const note = [...list(raw.note),
    f.giorni?.length ? `Giorni: ${f.giorni.join(', ')}${f.durata_minuti ? ` · circa ${f.durata_minuti} minuti` : ''}.` : '',
    rot && typeof rot === 'object' ? Object.entries(rot).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${[].concat(v).join(' – ')}`).join(' · ') : list(rot).join(' '),
    ...list(raw.modifiche).map(m => `Modifica: ${m}`)].filter(Boolean);
  return {
    nome: first(raw.nome, raw.titolo, 'Scheda'),
    persona,
    obiettivo: first(raw.obiettivo, a.obiettivo, ''),
    note,
    riscaldamento: activityLines(raw.riscaldamento),
    defaticamento: activityLines(raw.defaticamento),
    regole: list(raw.regole),
    giorni,
  };
}

/**
 * Esercizio di una scheda nel formato dell'app, collegato alla libreria (foto e spiegazione).
 * e: { esercizio, id?, dettaglio, muscoli, serie, ripetizioni, riposo, peso, superserie, note }.
 * Serve sia all'importazione sia all'editor delle schede.
 */
export function buildItem(e) {
  if (e.blocco || e.kind === 'blocco') return buildBlock(e);
  const nome = String(e.esercizio ?? e.nome ?? '').trim();
  // "Hip thrust (bilanciere o macchina)": il nome per la libreria e il dettaglio tra parentesi.
  const paren = nome.match(/^(.*?)\s*\((.*)\)\s*$/);
  const base = paren ? paren[1] : nome;
  // Prima nome + dettaglio ("Crunch" "alla macchina" → Crunch alla macchina), poi il nome da solo.
  const det = String(e.dettaglio ?? '');
  const lib = findExercise(e.id) ?? (det ? findExercise(`${base} ${det}`) : null) ?? findExercise(base) ?? findExercise(nome);
  const serie = Math.max(1, Math.round(Number(e.serie) || 3));
  const ripetizioni = String(e.ripetizioni ?? e.reps ?? '10');
  const target = parseTarget(ripetizioni);
  // Tipo di registrazione: dalla scheda (secondi/minuti), altrimenti dalla libreria.
  const tipo = target.unit === 'sec' ? 'sec' : target.unit === 'min' ? 'min' : lib?.tipo === 'sec' || lib?.tipo === 'min' ? lib.tipo : lib?.tipo ?? 'kg';
  const riposo = Number(e.riposo);   // 0 è valido (primo esercizio di una superserie)
  const peso = parseFloat(String(e.peso ?? '').replace(',', '.'));
  return {
    ex: lib?.id ?? null,
    nome: base,
    dettaglio: String(e.dettaglio ?? (paren ? paren[2] : '')),
    muscoli: String(e.muscoli || lib?.muscoli || ''),
    serie, ripetizioni, target, tipo,
    riposo: Number.isFinite(riposo) && e.riposo !== '' && e.riposo != null ? Math.max(0, Math.round(riposo)) : 60,
    peso: Number.isFinite(peso) ? peso : null,
    superserie: e.superserie ? String(e.superserie).trim() : '',
    note: String(e.note ?? ''),
    ...(tipo === 'min' ? { cardio: cardioOf(e, base, lib, `${ripetizioni} ${e.dettaglio ?? ''}`) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Cardio: oltre ai minuti si segnano velocità e pendenza (tapis roulant, corsa) o il livello
// (cyclette, ellittica, vogatore, stair climber). Gli obiettivi arrivano dai campi "velocita",
// "pendenza", "livello" della scheda o dal testo ("6 km/h, pendenza 8%", "livello 7").
// ---------------------------------------------------------------------------
export const CARDIO_FIELDS = { vel: { unit: 'km/h', label: 'Velocità' }, pend: { unit: '%', label: 'Pendenza' }, liv: { unit: 'liv.', label: 'Livello' } };

function cardioOf(e, nome, lib, text) {
  const n = v => {
    const m = String(v ?? '').match(/\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(',', '.')) : null;
  };
  const old = e.cardio ?? {};
  const t = String(text).toLowerCase();
  const vel = n(e.velocita ?? e['velocità'] ?? old.vel) ?? n(t.match(/(\d+(?:[.,]\d+)?)\s*km\s*\/?\s*h/)?.[1]);
  const pend = n(e.pendenza ?? old.pend) ?? n(t.match(/pendenza\D{0,4}(\d+(?:[.,]\d+)?)/)?.[1] ?? t.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]);
  const liv = n(e.livello ?? e.resistenza ?? old.liv) ?? n(t.match(/(?:livello|resistenza|liv\.?)\s*(\d+)/)?.[1]);
  const campi = [...(old.campi ?? lib?.cardio ?? (/tapis|corsa|camminat|treadmill|running/i.test(nome) ? ['vel', 'pend'] : ['liv']))];
  for (const [k, v] of [['vel', vel], ['pend', pend], ['liv', liv]]) if (v != null && !campi.includes(k)) campi.push(k);
  return { campi: ['vel', 'pend', 'liv'].filter(k => campi.includes(k)), vel, pend, liv };
}

// ---------------------------------------------------------------------------
// Blocchi a tempo: EMOM, AMRAP, For time, Tabata, intervalli, circuito. Nella scheda sono un elemento
// della lista "esercizi" con il campo "blocco" e i suoi esercizi dentro.
// ---------------------------------------------------------------------------
export const BLOCK_MODES = {
  emom: { label: 'EMOM', spiega: 'All\'inizio di ogni minuto fai le ripetizioni indicate; il tempo che avanza è recupero. Se non riesci a finire nel minuto, togli qualche ripetizione.' },
  amrap: { label: 'AMRAP', spiega: 'Più giri possibili del circuito nel tempo indicato, senza fermarti. Tocca "+1 giro" a ogni giro completato.' },
  fortime: { label: 'For time', spiega: 'Fai tutto il lavoro il più veloce possibile: il risultato è il tempo. Se arrivi al tempo massimo ti fermi.' },
  tabata: { label: 'Tabata', spiega: '20 secondi al massimo e 10 di pausa, per 8 giri (4 minuti). Se ci sono più esercizi si alternano a ogni giro.' },
  intervalli: { label: 'Intervalli', spiega: 'Lavoro e pausa alternati per il numero di giri indicato. Se ci sono più esercizi si alternano a ogni giro.' },
  circuito: { label: 'Circuito', spiega: 'Fai gli esercizi uno dopo l\'altro senza pausa; recupero solo a fine giro. Tocca ✓ a ogni giro finito.' },
};

function blockMode(text) {
  const t = String(text ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  if (/^e\d*mom|everyminute|ognimin/.test(t)) return 'emom';
  if (/amrap|piugiri/.test(t)) return 'amrap';
  if (/fortime|atempo|cronometr/.test(t)) return 'fortime';
  if (/tabata/.test(t)) return 'tabata';
  if (/hiit|interval/.test(t)) return 'intervalli';
  return 'circuito';
}

const numOr = (v, d) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : d; };

/** Blocco a tempo nel formato dell'app; i suoi esercizi sono collegati alla libreria come gli altri. */
export function buildBlock(e) {
  const modo = BLOCK_MODES[e.modo] ? e.modo : blockMode(e.blocco ?? e.modo);
  const eMinutes = String(e.blocco ?? '').match(/^e(\d)mom/i);   // "E2MOM": ogni 2 minuti
  const b = {
    kind: 'blocco', tipo: 'blocco', modo, ex: null,
    minuti: numOr(e.minuti, modo === 'emom' ? 10 : modo === 'amrap' ? 12 : null),
    ogni: numOr(e.ogni, eMinutes ? +eMinutes[1] * 60 : 60),
    lavoro: numOr(e.lavoro, modo === 'tabata' ? 20 : 40),
    pausa: numOr(e.pausa, modo === 'tabata' ? 10 : 20),
    giri: Math.round(numOr(e.giri, modo === 'tabata' ? 8 : modo === 'intervalli' ? 10 : modo === 'circuito' ? 3 : 1)),
    recupero: Math.round(numOr(e.recupero, modo === 'circuito' ? 90 : 0)),
    cap: numOr(e.cap, modo === 'fortime' ? 20 : null),
    alterna: !!e.alterna,
    esercizi: (e.esercizi ?? []).map(x => {
      const src = typeof x === 'string' ? parseBlockLine(x) : { id: x.ex, ...x };
      const it = buildItem(src);
      return { ex: it.ex, nome: it.nome, dettaglio: it.dettaglio, ripetizioni: String(src.ripetizioni ?? '').trim(), tipo: it.tipo, muscoli: it.muscoli };
    }),
    note: String(e.note ?? ''),
    dettaglio: '', peso: null, superserie: '',
    target: { min: null, max: null, unit: 'reps', side: '' },
  };
  b.nome = blockTitle(b);
  b.serie = modo === 'circuito' ? b.giri : 1;
  b.riposo = modo === 'circuito' ? b.recupero : 0;
  b.ripetizioni = b.esercizi.map(x => `${x.ripetizioni} ${x.nome}`).join(' · ');
  b.muscoli = '';
  return b;
}

export function blockTitle(b) {
  const sec = s => (s % 60 ? `${s}"` : `${s / 60}'`);
  switch (b.modo) {
    case 'emom': return b.ogni === 60 ? `EMOM ${b.minuti}'` : b.ogni % 60 === 0 ? `E${b.ogni / 60}MOM ${b.minuti}'` : `EMOM ${b.minuti}' ogni ${sec(b.ogni)}`;
    case 'amrap': return `AMRAP ${b.minuti}'`;
    case 'fortime': return `For time${b.giri > 1 ? ` · ${b.giri} giri` : ''}${b.cap ? ` (max ${b.cap}')` : ''}`;
    case 'tabata': return `Tabata ${b.giri} × ${sec(b.lavoro)}/${sec(b.pausa)}`;
    case 'intervalli': return `Intervalli ${b.giri} × ${sec(b.lavoro)}/${sec(b.pausa)}`;
    default: return `Circuito · ${b.giri} giri`;
  }
}

/** Riga scritta a mano nell'editor: "10 Kettlebell swing", "30\" Plank", "Burpee x 12", "Corsa - 400 m". */
export function parseBlockLine(line) {
  const s = String(line).trim();
  let m = s.match(/^([\d][\d\s\-–/,.]*\s*(?:x|×)?\s*(?:secondi|sec|s\b|"|''|min\b|minuti|m\b|metri|cal\b|calorie|per lato|per gamba|per braccio)?)\s+(.+)$/i);
  if (m) return { esercizio: m[2].trim(), ripetizioni: m[1].replace(/\s*[x×]\s*$/i, '').trim() };
  m = s.match(/^(.+?)\s*(?:[x×:]|-|–)\s*([\d].*)$/i);
  if (m) return { esercizio: m[1].trim(), ripetizioni: m[2].trim() };
  return { esercizio: s, ripetizioni: '' };
}

/** Scheda dell'app → JSON nel formato da importare (per condividerla o ricaricarla altrove). */
export function planToJson(p, personali = []) {
  return JSON.stringify({
    formato: FORMAT, nome: p.nome, persona: p.persona, obiettivo: p.obiettivo,
    note: p.note, riscaldamento: p.riscaldamento, defaticamento: p.defaticamento, regole: p.regole,
    giorni: p.giorni.map(d => ({
      nome: d.nome, titolo: d.titolo,
      esercizi: d.esercizi.map(e => (e.kind === 'blocco'
        ? { blocco: BLOCK_MODES[e.modo].label, minuti: e.minuti ?? undefined, ogni: e.modo === 'emom' ? e.ogni : undefined,
          lavoro: ['tabata', 'intervalli'].includes(e.modo) ? e.lavoro : undefined, pausa: ['tabata', 'intervalli'].includes(e.modo) ? e.pausa : undefined,
          giri: e.giri, recupero: e.modo === 'circuito' ? e.recupero : undefined, cap: e.modo === 'fortime' ? e.cap : undefined,
          alterna: e.alterna || undefined, note: e.note || undefined,
          esercizi: e.esercizi.map(x => ({ id: x.ex ?? undefined, esercizio: x.nome, ripetizioni: x.ripetizioni, dettaglio: x.dettaglio || undefined })) }
        : { id: e.ex ?? undefined, esercizio: e.nome, dettaglio: e.dettaglio, muscoli: e.muscoli, serie: e.serie,
          ripetizioni: e.ripetizioni, riposo: e.riposo, peso: e.peso, superserie: e.superserie, note: e.note,
          velocita: e.cardio?.vel ?? undefined, pendenza: e.cardio?.pend ?? undefined, livello: e.cardio?.liv ?? undefined })),
    })),
    // Esercizi creati da chi manda la scheda (senza foto): chi la importa se li ritrova.
    esercizi_personali: personali.length ? personali.map(({ foto, custom, ...x }) => x) : undefined,
  }, null, 2);
}

/** Scheda pronta per l'app, con gli esercizi collegati alla libreria (foto e spiegazione). */
export function parsePlan(text, registerPersonali = null) {
  const obj = typeof text === 'string' ? extractJson(text) : text;
  // Esercizi personali di chi ha mandato la scheda: vanno registrati prima, così gli esercizi li trovano.
  const personali = Array.isArray(obj.esercizi_personali) ? obj.esercizi_personali.filter(x => x?.nome) : [];
  registerPersonali?.(personali);
  const raw = normalize(obj);
  if (!raw.giorni.length) throw new Error('La scheda non ha giorni di allenamento ("giorni").');
  const giorni = raw.giorni.map((g, gi) => {
    if (!Array.isArray(g.esercizi) || !g.esercizi.length) throw new Error(`Il giorno ${g.nome ?? gi + 1} non ha esercizi.`);
    return {
      nome: String(g.nome ?? String.fromCharCode(65 + gi)),
      titolo: String(g.titolo ?? ''),
      esercizi: g.esercizi.map((e, ei) => {
        if (!e.blocco && !String(e.esercizio ?? e.nome ?? '').trim()) throw new Error(`Nel giorno ${g.nome ?? gi + 1} l'esercizio n° ${ei + 1} non ha il nome.`);
        return buildItem(e);
      }),
    };
  });
  return {
    id: 'p' + Date.now(),
    formato: FORMAT,
    nome: String(raw.nome ?? 'Scheda'),
    persona: String(raw.persona ?? ''),
    obiettivo: String(raw.obiettivo ?? ''),
    note: raw.note,
    riscaldamento: raw.riscaldamento,
    defaticamento: raw.defaticamento,
    regole: raw.regole,
    giorni,
    imported: new Date().toISOString().slice(0, 10),
  };
}

/** Chiave con cui si ritrova la storia di un esercizio: id della libreria o nome normalizzato. */
export const exKey = item => (item.kind === 'blocco'
  ? `b:${item.modo}:${item.esercizi.map(x => x.ex ?? x.nome.toLowerCase()).join('+')}`
  : item.ex ?? 'x:' + item.nome.toLowerCase().replace(/[^a-zà-ú0-9]+/g, ' ').trim());

/** Testo da incollare nella chat con Claude per avere le schede nel formato dell'app. */
export const CLAUDE_PROMPT = `Ogni volta che mi prepari una scheda di allenamento, oltre al PDF dammi la versione per la mia app "AC Training".

ISTRUZIONI PRECISE (l'app legge solo questo formato):
1. Scrivi la scheda in UN SOLO blocco \`\`\`json, senza commenti dentro il JSON.
2. Usa ESATTAMENTE questi nomi di campo, in minuscolo, senza rinominarli, tradurli o aggiungerne altri.
3. "giorni" è una LISTA: un elemento per ogni allenamento (A, B, C…), nell'ordine in cui vanno fatti.
4. Ogni esercizio è un oggetto della lista "esercizi", nell'ordine di esecuzione.
5. Tutti i testi in italiano.

Struttura (esempio con due esercizi):

{
  "formato": "${FORMAT}",
  "nome": "Scheda Lei A/B · ottobre 2026",
  "persona": "Donna · 3 allenamenti a settimana",
  "obiettivo": "Glutei e gambe, dorso, tricipiti, addominali",
  "note": [
    "Alterna A e B: settimane dispari A-B-A, settimane pari B-A-B (lunedì, mercoledì, venerdì).",
    "Durata circa 60-70 minuti."
  ],
  "riscaldamento": [
    "Tapis roulant o cyclette 8-10 minuti, ritmo moderato (pendenza 3-5%).",
    "Mobilità 5 minuti: 10 circonduzioni braccia per verso · 10 gatto-mucca · 15 ponti glutei."
  ],
  "defaticamento": [
    "Tapis roulant in salita 10 minuti, pendenza 6-8%.",
    "Stretching 20-30 secondi per glutei, cosce, schiena e braccia."
  ],
  "regole": [
    "Scegli un peso con cui a fine serie potresti fare ancora 2 ripetizioni.",
    "Se per 2 sedute di fila completi tutte le ripetizioni, aumenta di uno scatto."
  ],
  "giorni": [
    {
      "nome": "A",
      "titolo": "Glutei, gambe, dorso, tricipiti e addominali",
      "esercizi": [
        { "esercizio": "Hip thrust", "dettaglio": "bilanciere o macchina", "muscoli": "Glutei",
          "serie": 3, "ripetizioni": "12", "riposo": 90, "peso": null, "superserie": "", "note": "Stringi i glutei 1 secondo in alto" },
        { "esercizio": "Dead bug", "dettaglio": "a terra", "muscoli": "Addominali profondi",
          "serie": 3, "ripetizioni": "10 per lato", "riposo": 45, "peso": null, "superserie": "", "note": "" }
      ]
    },
    {
      "nome": "B",
      "titolo": "…",
      "esercizi": [ … ]
    }
  ]
}

COSA METTERE IN OGNI CAMPO DELL'ESERCIZIO:
- "esercizio": solo il nome, comune e in italiano (es. Hip thrust, Leg press, Lat machine, Pulley basso, Push down al cavo, Goblet squat, Leg curl, Abductor machine, Rematore con manubrio, Estensioni sopra la testa con manubrio, Alzate laterali, Curl con manubri, Crunch, Crunch inverso, Russian twist, Plank, Plank laterale, Dead bug, Stacco rumeno con manubri, Affondi indietro, Kickback al cavo).
- "dettaglio": le varianti di esecuzione (es. "piedi alti e larghi sulla pedana", "presa larga"); "" se non ce ne sono. Non metterle tra parentesi nel nome.
- "muscoli": testo breve.
- "serie": numero intero (es. 3).
- "ripetizioni": SEMPRE testo tra virgolette: "12", "8-10", "30 secondi", "10 minuti", "12 per gamba", "10 per lato".
- "riposo": secondi di recupero, numero intero (es. 90).
- "peso": kg di partenza consigliati come numero, oppure null.
- "superserie": stessa sigla (es. "S1") per gli esercizi da fare di fila senza riposo, altrimenti "".
- "note": consiglio breve di esecuzione, oppure "".

CARDIO (tapis roulant, corsa, cyclette, ellittica, vogatore, stair climber):
Il cardio che va segnato (es. camminata in pendenza a fine allenamento) mettilo nella lista "esercizi" come un esercizio normale, non solo in "riscaldamento" o "defaticamento". Usa "serie": 1, "ripetizioni": "20 minuti", "riposo": 0 e aggiungi:
- "velocita": km/h come numero (tapis roulant, corsa), altrimenti null;
- "pendenza": percentuale come numero (tapis roulant), altrimenti null;
- "livello": livello di resistenza come numero (cyclette, ellittica, vogatore, stair climber), altrimenti null.
Esempio: { "esercizio": "Tapis roulant", "dettaglio": "camminata in pendenza", "muscoli": "Cardio", "serie": 1, "ripetizioni": "20 minuti", "riposo": 0, "peso": null, "superserie": "", "note": "", "velocita": 5.5, "pendenza": 10, "livello": null }

BLOCCHI A TEMPO (EMOM, AMRAP, For time, Tabata, intervalli, circuito):
Si mettono nella lista "esercizi" del giorno, nel punto in cui vanno fatti, come oggetto con il campo "blocco" al posto di "esercizio".
Dentro "esercizi" del blocco ogni esercizio ha solo "esercizio", "ripetizioni" (testo) ed eventualmente "dettaglio". Esempi:
{ "blocco": "EMOM", "minuti": 12, "ogni": 60, "alterna": false, "esercizi": [ { "esercizio": "Kettlebell swing", "ripetizioni": "12" }, { "esercizio": "Piegamenti", "ripetizioni": "8" } ], "note": "" }
{ "blocco": "AMRAP", "minuti": 15, "esercizi": [ { "esercizio": "Affondi", "ripetizioni": "10 per gamba" }, { "esercizio": "Crunch", "ripetizioni": "15" } ] }
{ "blocco": "For time", "giri": 3, "cap": 20, "esercizi": [ { "esercizio": "Goblet squat", "ripetizioni": "15" }, { "esercizio": "Burpee", "ripetizioni": "10" } ] }
{ "blocco": "Tabata", "giri": 8, "lavoro": 20, "pausa": 10, "esercizi": [ { "esercizio": "Mountain climber", "ripetizioni": "" } ] }
{ "blocco": "Intervalli", "giri": 10, "lavoro": 40, "pausa": 20, "esercizi": [ { "esercizio": "Cyclette", "ripetizioni": "veloce" } ] }
{ "blocco": "Circuito", "giri": 3, "recupero": 90, "esercizi": [ { "esercizio": "Step up su panca", "ripetizioni": "10 per gamba" }, { "esercizio": "Plank", "ripetizioni": "30 secondi" } ] }
- "minuti": durata (EMOM, AMRAP). "ogni": secondi tra un giro e l'altro dell'EMOM (60 = ogni minuto, 120 = ogni 2 minuti).
- "alterna": true se nell'EMOM gli esercizi si alternano un minuto ciascuno (minuto 1 il primo, minuto 2 il secondo…); false se si fanno tutti ogni minuto.
- "giri": numero di giri. "lavoro" e "pausa": secondi (Tabata, intervalli). "recupero": secondi di pausa a fine giro (circuito). "cap": minuti massimi (For time).

ALTRO:
- "riscaldamento", "defaticamento", "regole" e "note" sono liste di frasi (testo semplice, non oggetti).
- Se c'è una scheda leggera (es. per i giorni di ciclo), aggiungila come altro elemento di "giorni" con "nome": "Leggera".
- Se modifichi una scheda già data, ridammi il JSON COMPLETO aggiornato, non solo le modifiche.`;
