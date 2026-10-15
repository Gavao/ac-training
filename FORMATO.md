# Formato delle schede per AC Training

Da incollare una volta nella chat in cui Claude prepara le schede: da lì in poi, insieme al PDF, darà anche
il blocco da importare nell'app (Schede → Importa una scheda → Incolla). Lo stesso testo è nell'app
(Schede → Come farla preparare a Claude → Copia) e in `js/plan.js` (CLAUDE_PROMPT).

---

````text
Ogni volta che mi prepari una scheda di allenamento, oltre al PDF dammi la versione per la mia app "AC Training".

ISTRUZIONI PRECISE (l'app legge solo questo formato):
1. Scrivi la scheda in UN SOLO blocco ```json, senza commenti dentro il JSON.
2. Usa ESATTAMENTE questi nomi di campo, in minuscolo, senza rinominarli, tradurli o aggiungerne altri.
3. "giorni" è una LISTA: un elemento per ogni allenamento (A, B, C…), nell'ordine in cui vanno fatti.
4. Ogni esercizio è un oggetto della lista "esercizi", nell'ordine di esecuzione.
5. Tutti i testi in italiano.

Struttura (esempio con due esercizi):

{
  "formato": "ac-training/1",
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
- Se modifichi una scheda già data, ridammi il JSON COMPLETO aggiornato, non solo le modifiche.
````

---

## Note per l'app
- Gli esercizi vengono collegati alla libreria (`js/exercises.js`) per nome o alias; quelli che non trova restano
  senza foto ma con il video di YouTube.
- L'app accetta anche alcune varianti che Claude a volte usa ("allenamenti" come oggetto A/B, "riposo_secondi",
  "atleta", "frequenza", riscaldamento a blocchi): vengono convertite nel formato sopra.
- I giorni chiamati "Leggera", "Scarico", "Extra" o "Ciclo" non entrano nella rotazione: si scelgono a mano.
