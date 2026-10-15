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
  const unit = /\bmin|minut/.test(t) ? 'min' : /sec|secondi|\d\s*s\b|"/.test(t) ? 'sec' : 'reps';
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

/** Scheda pronta per l'app, con gli esercizi collegati alla libreria (foto e spiegazione). */
export function parsePlan(text) {
  const raw = normalize(typeof text === 'string' ? extractJson(text) : text);
  if (!raw.giorni.length) throw new Error('La scheda non ha giorni di allenamento ("giorni").');
  const giorni = raw.giorni.map((g, gi) => {
    if (!Array.isArray(g.esercizi) || !g.esercizi.length) throw new Error(`Il giorno ${g.nome ?? gi + 1} non ha esercizi.`);
    return {
      nome: String(g.nome ?? String.fromCharCode(65 + gi)),
      titolo: String(g.titolo ?? ''),
      esercizi: g.esercizi.map((e, ei) => {
        const nome = String(e.esercizio ?? e.nome ?? '').trim();
        if (!nome) throw new Error(`Nel giorno ${g.nome ?? gi + 1} l'esercizio n° ${ei + 1} non ha il nome.`);
        // "Hip thrust (bilanciere o macchina)": il nome per la libreria e il dettaglio tra parentesi.
        const paren = nome.match(/^(.*?)\s*\((.*)\)\s*$/);
        const base = paren ? paren[1] : nome;
        const lib = findExercise(e.id) ?? findExercise(base) ?? findExercise(nome);
        const serie = Math.max(1, Math.round(Number(e.serie) || 3));
        const ripetizioni = String(e.ripetizioni ?? e.reps ?? '10');
        const target = parseTarget(ripetizioni);
        // Tipo di registrazione: dalla scheda (secondi/minuti), altrimenti dalla libreria.
        const tipo = target.unit === 'sec' ? 'sec' : target.unit === 'min' ? 'min' : lib?.tipo === 'sec' || lib?.tipo === 'min' ? lib.tipo : lib?.tipo ?? 'kg';
        return {
          ex: lib?.id ?? null,
          nome: base,
          dettaglio: String(e.dettaglio ?? (paren ? paren[2] : '')),
          muscoli: String(e.muscoli ?? lib?.muscoli ?? ''),
          serie, ripetizioni, target, tipo,
          riposo: Math.max(0, Math.round(Number(e.riposo) || 60)),
          peso: e.peso != null && !isNaN(parseFloat(e.peso)) ? parseFloat(String(e.peso).replace(',', '.')) : null,
          superserie: e.superserie ? String(e.superserie) : '',
          note: String(e.note ?? ''),
        };
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
export const exKey = item => item.ex ?? 'x:' + item.nome.toLowerCase().replace(/[^a-zà-ú0-9]+/g, ' ').trim();

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

ALTRO:
- "riscaldamento", "defaticamento", "regole" e "note" sono liste di frasi (testo semplice, non oggetti).
- Se c'è una scheda leggera (es. per i giorni di ciclo), aggiungila come altro elemento di "giorni" con "nome": "Leggera".
- Se modifichi una scheda già data, ridammi il JSON COMPLETO aggiornato, non solo le modifiche.`;
