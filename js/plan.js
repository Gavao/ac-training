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

/** Scheda pronta per l'app, con gli esercizi collegati alla libreria (foto e spiegazione). */
export function parsePlan(text) {
  const raw = typeof text === 'string' ? extractJson(text) : text;
  if (!Array.isArray(raw.giorni) || !raw.giorni.length) throw new Error('La scheda non ha giorni di allenamento ("giorni").');
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
    note: list(raw.note),
    riscaldamento: list(raw.riscaldamento),
    defaticamento: list(raw.defaticamento),
    regole: list(raw.regole),
    giorni,
    imported: new Date().toISOString().slice(0, 10),
  };
}

/** Chiave con cui si ritrova la storia di un esercizio: id della libreria o nome normalizzato. */
export const exKey = item => item.ex ?? 'x:' + item.nome.toLowerCase().replace(/[^a-zà-ú0-9]+/g, ' ').trim();

/** Testo da incollare nella chat con Claude per avere le schede nel formato dell'app. */
export const CLAUDE_PROMPT = `Quando mi prepari una scheda di allenamento, oltre al PDF scrivimi anche la versione per la mia app "AC Training": un blocco \`\`\`json con questa struttura (in italiano):

{
  "formato": "${FORMAT}",
  "nome": "nome breve della scheda",
  "persona": "es. chi la usa e quante volte a settimana",
  "obiettivo": "es. glutei e gambe",
  "note": ["come funziona, es. alterna A e B: settimana 1 A-B-A, settimana 2 B-A-B"],
  "riscaldamento": ["una voce per riga"],
  "defaticamento": ["una voce per riga"],
  "regole": ["una regola per riga"],
  "giorni": [
    {
      "nome": "A",
      "titolo": "muscoli allenati quel giorno",
      "esercizi": [
        { "esercizio": "Hip thrust", "dettaglio": "bilanciere o macchina", "muscoli": "Glutei",
          "serie": 3, "ripetizioni": "12", "riposo": 90, "peso": null, "superserie": "", "note": "" }
      ]
    }
  ]
}

Regole del formato:
- "ripetizioni" è un testo: "12", "8-10", "30 secondi", "10 minuti", "12 per gamba".
- "riposo" è in secondi (numero).
- "peso" è facoltativo: kg di partenza consigliati, altrimenti null.
- "superserie": stessa lettera (es. "S1") per esercizi da fare di fila senza riposo, altrimenti "".
- Usa nomi di esercizi comuni in italiano (es. Lat machine, Pulley basso, Leg press, Push down al cavo, Stacco rumeno con manubri, Affondi indietro, Kickback al cavo, Crunch inverso, Plank laterale).
- Se c'è una variante (es. scheda leggera per i giorni di ciclo), mettila come giorno in più con "nome": "Leggera".`;
