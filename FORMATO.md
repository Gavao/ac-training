# Formato delle schede per AC Training

Da incollare una volta nella chat in cui Claude prepara le schede: da lì in poi, insieme al PDF, darà anche
il blocco da importare nell'app (Schede → Importa una scheda → Incolla).

---

Quando mi prepari una scheda di allenamento, oltre al PDF scrivimi anche la versione per la mia app "AC Training":
un blocco ```json con questa struttura (in italiano):

```json
{
  "formato": "ac-training/1",
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
```

Regole del formato:
- "ripetizioni" è un testo: "12", "8-10", "30 secondi", "10 minuti", "12 per gamba".
- "riposo" è in secondi (numero).
- "peso" è facoltativo: kg di partenza consigliati, altrimenti null.
- "superserie": stessa lettera (es. "S1") per esercizi da fare di fila senza riposo, altrimenti "".
- Usa nomi di esercizi comuni in italiano (es. Lat machine, Pulley basso, Leg press, Push down al cavo,
  Stacco rumeno con manubri, Affondi indietro, Kickback al cavo, Crunch inverso, Plank laterale).
- Se c'è una variante (es. scheda leggera per i giorni di ciclo), mettila come giorno in più con "nome": "Leggera".

---

## Note per l'app
- Gli esercizi vengono collegati alla libreria (`js/exercises.js`) per nome o alias; il testo tra parentesi
  nel nome diventa il dettaglio. Quelli che non trova restano senza foto ma con il video di YouTube.
- I giorni chiamati "Leggera", "Scarico", "Extra" o "Ciclo" non entrano nella rotazione: si scelgono a mano.
