# AC Training

App per la palestra: schede di allenamento importate (preparate da Claude), registro dei pesi serie per serie,
recupero con timer, progressi e record per esercizio, peso, composizione corporea e misure.

- **Dati solo sul telefono** (IndexedDB): niente account, niente server. Il backup è un file da salvare o condividere.
- **Android**: APK "guscio" (cartella `android/`) che apre l'app pubblicata su GitHub Pages e si aggiorna da solo.
- **iPhone**: aprire https://gavao.github.io/ac-training/ in Safari → Condividi → Aggiungi alla schermata Home.

## Schede
Il formato da far generare a Claude è descritto in [FORMATO.md](FORMATO.md); lo stesso testo si copia dall'app
(Schede → Come farla preparare a Claude). Le schede vere (con dati personali) vanno tenute fuori dal repository, ad esempio in `esempi/`, che è escluso.

## Esercizi
La libreria è in `js/exercises.js` (nome italiano, alias, muscoli, spiegazione, consigli). Le foto in `img/ex/`
vengono dall'archivio di pubblico dominio [free-exercise-db](https://github.com/yuhonas/free-exercise-db):
per un esercizio nuovo si aggiunge la voce con `img` = nome della cartella dell'archivio e si scaricano
`0.jpg` e `1.jpg` in `img/ex/<cartella>/`.

## Comandi
- Prova in locale: `powershell -ExecutionPolicy Bypass -File serve.ps1` → http://localhost:8090
- Pubblica: `powershell -ExecutionPolicy Bypass -File tools\publish.ps1 "Descrizione"`
- APK: `powershell -ExecutionPolicy Bypass -File android\build.ps1` (con `-Release` lo pubblica su GitHub)
