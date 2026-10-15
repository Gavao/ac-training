// Libreria degli esercizi: nome italiano, muscoli, spiegazione e consigli.
// img: cartella delle due foto (inizio e fine movimento) in img/ex/, dall'archivio di pubblico dominio
// free-exercise-db (github.com/yuhonas/free-exercise-db); le copia tools/update-images.ps1.
// tipo: come si registra una serie — 'kg' (peso × ripetizioni), 'corpo' (ripetizioni, peso facoltativo),
// 'sec' (tenuta in secondi), 'min' (cardio in minuti).
// alias: altri nomi con cui l'esercizio può comparire in una scheda (anche in inglese).

export const GROUPS = ['Petto', 'Schiena', 'Spalle', 'Braccia', 'Gambe', 'Glutei', 'Addome', 'Cardio'];

export const EXERCISES = [
  // ---------------------------------------------------------------- Petto
  {
    id: 'panca-piana', nome: 'Panca piana con bilanciere', gruppo: 'Petto', img: 'Barbell_Bench_Press_-_Medium_Grip', tipo: 'kg',
    alias: ['panca piana', 'bench press', 'distensioni su panca piana'],
    muscoli: 'Pettorali, tricipiti, deltoidi anteriori',
    passi: [
      'Sdraiati sulla panca con gli occhi sotto il bilanciere, piedi ben appoggiati a terra.',
      'Impugna il bilanciere poco più largo delle spalle, scapole strette e spinte verso il basso.',
      'Stacca il bilanciere e scendi controllando fino a sfiorare il petto, all\'altezza dei capezzoli.',
      'Spingi verso l\'alto fino a distendere le braccia, senza bloccare di scatto i gomiti.',
    ],
    consigli: [
      'I gomiti a circa 45° dal busto, non aperti a 90°: proteggi le spalle.',
      'Glutei sempre appoggiati sulla panca.',
      'Con carichi pesanti fatti assistere da qualcuno.',
    ],
  },
  {
    id: 'panca-piana-manubri', nome: 'Panca piana con manubri', gruppo: 'Petto', img: 'Dumbbell_Bench_Press', tipo: 'kg',
    alias: ['dumbbell bench press', 'distensioni con manubri'],
    muscoli: 'Pettorali, tricipiti, deltoidi anteriori',
    passi: [
      'Siediti sulla panca con i manubri sulle cosce, poi sdraiati portandoli all\'altezza del petto.',
      'Palmi in avanti, manubri ai lati del petto, gomiti leggermente sotto la panca.',
      'Spingi verso l\'alto avvicinando i manubri sopra il petto.',
      'Scendi lentamente fino a sentire l\'allungamento del petto.',
    ],
    consigli: [
      'Scendi in 2-3 secondi: il controllo conta più del peso.',
      'Il peso nella scheda è quello di un singolo manubrio.',
    ],
  },
  {
    id: 'panca-inclinata-manubri', nome: 'Panca inclinata con manubri', gruppo: 'Petto', img: 'Incline_Dumbbell_Press', tipo: 'kg',
    alias: ['panca inclinata', 'incline dumbbell press', 'distensioni inclinata manubri'],
    muscoli: 'Pettorale alto, deltoidi anteriori, tricipiti',
    passi: [
      'Regola lo schienale a 30-45°.',
      'Parti con i manubri all\'altezza delle spalle, palmi in avanti.',
      'Spingi verso l\'alto e leggermente verso il centro.',
      'Torna giù lentamente fino ai lati del petto.',
    ],
    consigli: [
      'Un\'inclinazione troppo alta sposta il lavoro sulle spalle: 30° è spesso l\'ideale.',
      'Schiena e testa sempre appoggiate.',
    ],
  },
  {
    id: 'panca-inclinata', nome: 'Panca inclinata con bilanciere', gruppo: 'Petto', img: 'Barbell_Incline_Bench_Press_-_Medium_Grip', tipo: 'kg',
    alias: ['incline bench press', 'panca inclinata bilanciere'],
    muscoli: 'Pettorale alto, deltoidi anteriori, tricipiti',
    passi: [
      'Schienale a 30-45°, impugnatura poco più larga delle spalle.',
      'Stacca il bilanciere e portalo sopra le spalle a braccia tese.',
      'Scendi fino alla parte alta del petto.',
      'Spingi in alto in modo controllato.',
    ],
    consigli: ['Scapole strette e petto in fuori per tutta la serie.', 'Non far rimbalzare il bilanciere sul petto.'],
  },
  {
    id: 'chest-press', nome: 'Chest press (macchina)', gruppo: 'Petto', img: 'Leverage_Chest_Press', tipo: 'kg',
    alias: ['chest press', 'distensioni alla macchina', 'pressa per il petto'],
    muscoli: 'Pettorali, tricipiti, deltoidi anteriori',
    passi: [
      'Regola il sedile in modo che le maniglie siano all\'altezza del petto.',
      'Schiena appoggiata, impugna le maniglie.',
      'Spingi in avanti fino a distendere le braccia, senza bloccare i gomiti.',
      'Torna indietro lentamente fino a sentire l\'allungamento del petto.',
    ],
    consigli: ['Ottima per imparare la spinta in sicurezza.', 'Non staccare la schiena dallo schienale.'],
  },
  {
    id: 'croci-cavi', nome: 'Croci ai cavi', gruppo: 'Petto', img: 'Cable_Crossover', tipo: 'kg',
    alias: ['croci ai cavi', 'cable crossover', 'croci cavi alti'],
    muscoli: 'Pettorali',
    passi: [
      'Carrucole in alto, una maniglia per mano, un passo avanti con busto leggermente inclinato.',
      'Braccia aperte con i gomiti appena piegati.',
      'Porta le mani davanti a te in basso, come per abbracciare un albero.',
      'Torna su lentamente sentendo l\'allungamento del petto.',
    ],
    consigli: ['I gomiti restano sempre con la stessa piega: non è una spinta.', 'Stringi il petto 1 secondo quando le mani si incontrano.'],
  },
  {
    id: 'croci-manubri', nome: 'Croci con manubri su panca inclinata', gruppo: 'Petto', img: 'Incline_Dumbbell_Flyes', tipo: 'kg',
    alias: ['croci con manubri', 'croci inclinata', 'dumbbell flyes'],
    muscoli: 'Pettorali',
    passi: [
      'Sdraiati sulla panca inclinata, manubri sopra il petto con palmi uno verso l\'altro.',
      'Apri le braccia in un arco ampio con i gomiti leggermente piegati.',
      'Scendi finché senti l\'allungamento, senza scendere oltre la linea delle spalle.',
      'Richiudi le braccia sopra il petto con lo stesso arco.',
    ],
    consigli: ['Usa pesi leggeri: qui conta l\'allungamento, non il carico.'],
  },
  {
    id: 'pectoral-machine', nome: 'Pectoral machine', gruppo: 'Petto', img: 'Butterfly', tipo: 'kg',
    alias: ['pec deck', 'butterfly', 'pectoral'],
    muscoli: 'Pettorali',
    passi: [
      'Regola il sedile con le maniglie all\'altezza del petto.',
      'Schiena appoggiata, braccia aperte sulle maniglie.',
      'Chiudi le braccia davanti al petto stringendo i pettorali.',
      'Riapri lentamente fino all\'allungamento.',
    ],
    consigli: ['Spalle basse e lontane dalle orecchie.'],
  },
  {
    id: 'piegamenti', nome: 'Piegamenti sulle braccia', gruppo: 'Petto', img: 'Pushups', tipo: 'corpo',
    alias: ['piegamenti', 'push up', 'flessioni'],
    muscoli: 'Pettorali, tricipiti, addome',
    passi: [
      'Mani a terra poco più larghe delle spalle, corpo dritto dalla testa ai talloni.',
      'Scendi piegando i gomiti fino a sfiorare il pavimento con il petto.',
      'Spingi fino a distendere le braccia.',
    ],
    consigli: ['Se sono troppo difficili, appoggia le ginocchia o le mani su una panca.', 'Addome e glutei contratti: il bacino non deve cedere.'],
  },
  {
    id: 'dip', nome: 'Dip alle parallele', gruppo: 'Petto', img: 'Dips_-_Chest_Version', tipo: 'corpo',
    alias: ['dip', 'parallele', 'dips'],
    muscoli: 'Pettorale basso, tricipiti, deltoidi anteriori',
    passi: [
      'Sospenditi sulle parallele a braccia tese.',
      'Inclina leggermente il busto in avanti e scendi piegando i gomiti.',
      'Scendi finché le spalle sono all\'altezza dei gomiti.',
      'Risali spingendo con le braccia.',
    ],
    consigli: ['Se non riesci, usa la macchina assistita o un elastico.', 'Non scendere troppo se senti fastidio alle spalle.'],
  },

  // ---------------------------------------------------------------- Schiena
  {
    id: 'lat-machine', nome: 'Lat machine avanti', gruppo: 'Schiena', img: 'Wide-Grip_Lat_Pulldown', tipo: 'kg',
    alias: ['lat machine', 'lat pulldown', 'lat machine presa larga'],
    muscoli: 'Gran dorsale, bicipiti, romboidi',
    passi: [
      'Siediti con le cosce bloccate sotto i cuscinetti.',
      'Impugna la barra più larga delle spalle, palmi in avanti.',
      'Petto in fuori, tira la barra verso la parte alta del petto portando i gomiti in basso.',
      'Risali lentamente fino a braccia quasi tese.',
    ],
    consigli: ['Pensa a tirare con i gomiti, non con le mani.', 'Non dondolare con il busto per aiutarti.'],
  },
  {
    id: 'lat-machine-inversa', nome: 'Lat machine presa inversa', gruppo: 'Schiena', img: 'Underhand_Cable_Pulldowns', tipo: 'kg',
    alias: ['lat machine presa supina', 'lat machine inversa', 'underhand pulldown'],
    muscoli: 'Gran dorsale, bicipiti',
    passi: [
      'Impugna la barra alla larghezza delle spalle con i palmi verso di te.',
      'Petto in fuori e busto appena inclinato indietro.',
      'Tira la barra fino al petto stringendo le scapole.',
      'Risali controllando.',
    ],
    consigli: ['Lavora molto anche sui bicipiti: mettila prima del lavoro di braccia.'],
  },
  {
    id: 'trazioni', nome: 'Trazioni alla sbarra', gruppo: 'Schiena', img: 'Pullups', tipo: 'corpo',
    alias: ['trazioni', 'pull up', 'pullups', 'trazioni alla sbarra'],
    muscoli: 'Gran dorsale, bicipiti, avambracci',
    passi: [
      'Appenditi alla sbarra con le mani più larghe delle spalle, palmi in avanti.',
      'Tira portando il petto verso la sbarra, gomiti verso i fianchi.',
      'Supera la sbarra con il mento.',
      'Scendi lentamente fino a braccia distese.',
    ],
    consigli: ['Se non ne fai ancora, usa la macchina assistita o un elastico.', 'Niente slanci con le gambe.'],
  },
  {
    id: 'pulley', nome: 'Pulley basso', gruppo: 'Schiena', img: 'Seated_Cable_Rows', tipo: 'kg',
    alias: ['pulley', 'rematore al cavo', 'seated cable row', 'pulley basso'],
    muscoli: 'Dorsali, romboidi, trapezio, bicipiti',
    passi: [
      'Siediti con i piedi sulla pedana e le ginocchia leggermente piegate.',
      'Busto dritto, impugna il triangolo a braccia tese.',
      'Tira la maniglia verso l\'ombelico stringendo le scapole.',
      'Torna avanti lentamente allungando le braccia, senza curvare la schiena.',
    ],
    consigli: ['Il busto resta quasi fermo: non fare avanti e indietro.', 'Tieni le spalle basse.'],
  },
  {
    id: 'rematore-bilanciere', nome: 'Rematore con bilanciere', gruppo: 'Schiena', img: 'Bent_Over_Barbell_Row', tipo: 'kg',
    alias: ['rematore', 'rematore bilanciere', 'barbell row', 'bent over row'],
    muscoli: 'Dorsali, romboidi, trapezio, lombari',
    passi: [
      'In piedi con il bilanciere, ginocchia leggermente piegate.',
      'Inclina il busto in avanti a circa 45° mantenendo la schiena dritta.',
      'Tira il bilanciere verso l\'ombelico portando i gomiti indietro.',
      'Abbassa lentamente a braccia tese.',
    ],
    consigli: ['La schiena non deve mai incurvarsi: se succede, abbassa il peso.', 'Sguardo verso il pavimento a qualche metro.'],
  },
  {
    id: 'rematore-manubrio', nome: 'Rematore con manubrio', gruppo: 'Schiena', img: 'One-Arm_Dumbbell_Row', tipo: 'kg',
    alias: ['rematore manubrio', 'rematore a un braccio', 'one arm row', 'dumbbell row'],
    muscoli: 'Dorsali, romboidi, bicipiti',
    passi: [
      'Appoggia ginocchio e mano dello stesso lato sulla panca, schiena parallela al pavimento.',
      'Con l\'altra mano tieni il manubrio a braccio teso.',
      'Tira il manubrio verso il fianco portando il gomito in alto.',
      'Scendi lentamente.',
    ],
    consigli: ['Il peso registrato è quello del manubrio; le ripetizioni sono per braccio.', 'Non ruotare il busto per tirare.'],
  },
  {
    id: 'pulldown-braccia-tese', nome: 'Pulldown a braccia tese', gruppo: 'Schiena', img: 'Straight-Arm_Pulldown', tipo: 'kg',
    alias: ['pullover al cavo', 'straight arm pulldown', 'pulldown braccia tese'],
    muscoli: 'Gran dorsale',
    passi: [
      'In piedi davanti al cavo alto, impugna la barra a braccia tese.',
      'Busto leggermente inclinato in avanti.',
      'Porta la barra verso le cosce tenendo le braccia dritte.',
      'Risali lentamente.',
    ],
    consigli: ['Muovi solo le spalle: i gomiti non si piegano.'],
  },
  {
    id: 'face-pull', nome: 'Face pull', gruppo: 'Spalle', img: 'Face_Pull', tipo: 'kg',
    alias: ['face pull', 'tirate al viso'],
    muscoli: 'Deltoidi posteriori, cuffia dei rotatori, trapezio',
    passi: [
      'Cavo all\'altezza del viso con la corda.',
      'Impugna la corda con i pollici verso di te e fai un passo indietro.',
      'Tira la corda verso il viso aprendo le mani ai lati delle orecchie.',
      'Torna avanti lentamente.',
    ],
    consigli: ['Peso leggero e movimento lento: fa benissimo alla postura delle spalle.'],
  },
  {
    id: 'stacco', nome: 'Stacco da terra', gruppo: 'Schiena', img: 'Barbell_Deadlift', tipo: 'kg',
    alias: ['stacco', 'stacco da terra', 'deadlift'],
    muscoli: 'Lombari, glutei, femorali, dorsali, trapezio',
    passi: [
      'Piedi alla larghezza dei fianchi, bilanciere sopra la metà del piede.',
      'Piega anche e ginocchia e impugna il bilanciere appena fuori dalle gambe.',
      'Schiena dritta e petto in fuori: spingi con le gambe e porta il bilanciere su lungo le cosce.',
      'In piedi, stringi i glutei; poi riporta giù il bilanciere con lo stesso percorso.',
    ],
    consigli: ['La schiena non deve mai curvarsi.', 'Il bilanciere resta a contatto con le gambe.', 'Impara la tecnica con poco peso.'],
  },
  {
    id: 'iperestensioni', nome: 'Iperestensioni', gruppo: 'Schiena', img: 'Hyperextensions_Back_Extensions', tipo: 'corpo',
    alias: ['iperestensioni', 'hyperextension', 'back extension', 'estensioni lombari'],
    muscoli: 'Lombari, glutei, femorali',
    passi: [
      'Posizionati sulla panca con il bacino appena oltre il cuscinetto.',
      'Braccia incrociate sul petto, scendi piegandoti in avanti.',
      'Risali fino ad avere il corpo in linea, senza andare oltre.',
    ],
    consigli: ['Per aumentare la difficoltà tieni un disco al petto.'],
  },

  // ---------------------------------------------------------------- Spalle
  {
    id: 'shoulder-press-manubri', nome: 'Lento avanti con manubri', gruppo: 'Spalle', img: 'Dumbbell_Shoulder_Press', tipo: 'kg',
    alias: ['shoulder press', 'lento manubri', 'military press manubri', 'spinte sopra la testa'],
    muscoli: 'Deltoidi, tricipiti',
    passi: [
      'Seduto con lo schienale dritto, manubri all\'altezza delle spalle, palmi in avanti.',
      'Spingi i manubri sopra la testa fino a braccia quasi tese.',
      'Scendi lentamente fino all\'altezza delle orecchie.',
    ],
    consigli: ['Non inarcare la schiena: addome contratto.', 'Il peso registrato è quello di un manubrio.'],
  },
  {
    id: 'military-press', nome: 'Lento avanti con bilanciere', gruppo: 'Spalle', img: 'Standing_Military_Press', tipo: 'kg',
    alias: ['military press', 'lento avanti', 'overhead press'],
    muscoli: 'Deltoidi, tricipiti, trapezio',
    passi: [
      'In piedi, bilanciere davanti alle spalle con impugnatura poco più larga.',
      'Contrai glutei e addome.',
      'Spingi il bilanciere sopra la testa spostando appena il viso indietro.',
      'Riporta giù il bilanciere davanti alle spalle.',
    ],
    consigli: ['Non inarcare la schiena per spingere.', 'Si può fare anche seduto.'],
  },
  {
    id: 'shoulder-press-macchina', nome: 'Shoulder press (macchina)', gruppo: 'Spalle', img: 'Machine_Shoulder_Military_Press', tipo: 'kg',
    alias: ['shoulder press macchina', 'lento alla macchina'],
    muscoli: 'Deltoidi, tricipiti',
    passi: [
      'Regola il sedile con le maniglie all\'altezza delle spalle.',
      'Schiena appoggiata, spingi verso l\'alto.',
      'Scendi lentamente fino all\'altezza delle spalle.',
    ],
    consigli: ['Ottima per iniziare: il movimento è guidato.'],
  },
  {
    id: 'alzate-laterali', nome: 'Alzate laterali', gruppo: 'Spalle', img: 'Side_Lateral_Raise', tipo: 'kg',
    alias: ['alzate laterali', 'lateral raise', 'alzate laterali manubri'],
    muscoli: 'Deltoidi laterali',
    passi: [
      'In piedi con un manubrio per mano lungo i fianchi.',
      'Gomiti leggermente piegati, solleva le braccia di lato.',
      'Fermati all\'altezza delle spalle.',
      'Scendi lentamente.',
    ],
    consigli: ['Pesi leggeri: con troppo peso lavora il trapezio e non la spalla.', 'Immagina di versare acqua da una brocca.'],
  },
  {
    id: 'alzate-posteriori', nome: 'Alzate posteriori a busto flesso', gruppo: 'Spalle', img: 'Reverse_Flyes', tipo: 'kg',
    alias: ['alzate posteriori', 'reverse fly', 'aperture posteriori', 'rear delt'],
    muscoli: 'Deltoidi posteriori, romboidi',
    passi: [
      'Busto inclinato in avanti quasi parallelo al pavimento, manubri sotto il petto.',
      'Apri le braccia di lato con i gomiti leggermente piegati.',
      'Stringi le scapole in alto.',
      'Scendi lentamente.',
    ],
    consigli: ['Pesi leggeri e movimento lento.'],
  },

  // ---------------------------------------------------------------- Braccia
  {
    id: 'curl-manubri', nome: 'Curl con manubri', gruppo: 'Braccia', img: 'Dumbbell_Bicep_Curl', tipo: 'kg',
    alias: ['curl manubri', 'curl bicipiti', 'bicep curl', 'curl alternato'],
    muscoli: 'Bicipiti',
    passi: [
      'In piedi, manubri lungo i fianchi con i palmi in avanti.',
      'Gomiti fermi accanto al busto, piega le braccia portando i manubri alle spalle.',
      'Stringi il bicipite in alto.',
      'Scendi lentamente fino a braccia distese.',
    ],
    consigli: ['Non dondolare con la schiena.', 'La discesa lenta fa crescere il muscolo quanto la salita.'],
  },
  {
    id: 'curl-bilanciere', nome: 'Curl con bilanciere', gruppo: 'Braccia', img: 'Barbell_Curl', tipo: 'kg',
    alias: ['curl bilanciere', 'barbell curl'],
    muscoli: 'Bicipiti, avambracci',
    passi: [
      'In piedi, bilanciere impugnato dal basso alla larghezza delle spalle.',
      'Gomiti fermi, porta il bilanciere verso il petto.',
      'Scendi lentamente.',
    ],
    consigli: ['Se senti fastidio ai polsi usa il bilanciere sagomato (EZ).'],
  },
  {
    id: 'curl-martello', nome: 'Curl a martello', gruppo: 'Braccia', img: 'Hammer_Curls', tipo: 'kg',
    alias: ['hammer curl', 'curl martello'],
    muscoli: 'Bicipiti, brachiale, avambracci',
    passi: [
      'Manubri lungo i fianchi con i palmi uno verso l\'altro.',
      'Piega i gomiti mantenendo i palmi in quella posizione.',
      'Scendi lentamente.',
    ],
    consigli: ['Gomiti fermi accanto al busto.'],
  },
  {
    id: 'push-down', nome: 'Push down ai cavi', gruppo: 'Braccia', img: 'Triceps_Pushdown_-_Rope_Attachment', tipo: 'kg',
    alias: ['push down', 'pushdown', 'tricipiti ai cavi', 'estensioni tricipiti al cavo', 'triceps pushdown'],
    muscoli: 'Tricipiti',
    passi: [
      'Davanti al cavo alto con la corda o la barra, gomiti attaccati ai fianchi.',
      'Spingi verso il basso fino a braccia distese, aprendo la corda in fondo.',
      'Risali lentamente fino a 90° senza muovere i gomiti.',
    ],
    consigli: ['Si muovono solo gli avambracci.', 'Non piegarti sopra il peso per spingere.'],
  },
  {
    id: 'french-press', nome: 'French press', gruppo: 'Braccia', img: 'EZ-Bar_Skullcrusher', tipo: 'kg',
    alias: ['french press', 'skull crusher', 'estensioni tricipiti su panca'],
    muscoli: 'Tricipiti',
    passi: [
      'Sdraiato sulla panca con il bilanciere EZ a braccia tese sopra il petto.',
      'Piega solo i gomiti portando il bilanciere verso la fronte.',
      'Distendi di nuovo le braccia.',
    ],
    consigli: ['I gomiti puntano al soffitto e non si allargano.', 'Peso moderato: il movimento passa vicino alla testa.'],
  },
  {
    id: 'estensioni-sopra-testa', nome: 'Estensioni sopra la testa con manubrio', gruppo: 'Braccia', img: 'Standing_Dumbbell_Triceps_Extension', tipo: 'kg',
    alias: ['estensioni sopra la testa', 'overhead triceps extension', 'french press in piedi', 'estensioni tricipiti con manubrio'],
    muscoli: 'Tricipiti',
    passi: [
      'Seduto o in piedi, tieni un manubrio con due mani sopra la testa a braccia tese.',
      'Piega i gomiti portando il manubrio dietro la testa.',
      'Distendi di nuovo le braccia verso l\'alto.',
    ],
    consigli: ['I gomiti restano vicini alla testa e puntano in avanti.', 'Addome contratto per non inarcare la schiena.'],
  },
  {
    id: 'estensioni-corda-sopra-testa', nome: 'Estensioni sopra la testa al cavo', gruppo: 'Braccia', img: 'Cable_Rope_Overhead_Triceps_Extension', tipo: 'kg',
    alias: ['estensioni al cavo sopra la testa', 'overhead cable extension', 'french press al cavo'],
    muscoli: 'Tricipiti',
    passi: [
      'Di spalle al cavo con la corda, busto inclinato in avanti e corda dietro la testa.',
      'Distendi le braccia in avanti sopra la testa.',
      'Torna indietro lentamente.',
    ],
    consigli: ['Si muovono solo gli avambracci.'],
  },
  {
    id: 'kickback-tricipiti', nome: 'Kickback per tricipiti', gruppo: 'Braccia', img: 'Tricep_Dumbbell_Kickback', tipo: 'kg',
    alias: ['kickback tricipiti', 'tricep kickback'],
    muscoli: 'Tricipiti',
    passi: [
      'Busto inclinato in avanti, gomito piegato a 90° e attaccato al fianco.',
      'Distendi il braccio indietro.',
      'Torna a 90° lentamente.',
    ],
    consigli: ['Il gomito resta fermo in alto per tutta la serie.'],
  },
  {
    id: 'dip-panca', nome: 'Dip su panca', gruppo: 'Braccia', img: 'Bench_Dips', tipo: 'corpo',
    alias: ['dip su panca', 'bench dips', 'dip tra due panche'],
    muscoli: 'Tricipiti',
    passi: [
      'Mani sul bordo della panca dietro di te, gambe distese davanti.',
      'Scendi piegando i gomiti fino a 90°.',
      'Risali spingendo con le braccia.',
    ],
    consigli: ['Più le gambe sono piegate, più è facile.', 'Schiena vicina alla panca.'],
  },

  // ---------------------------------------------------------------- Gambe
  {
    id: 'squat', nome: 'Squat con bilanciere', gruppo: 'Gambe', img: 'Barbell_Squat', tipo: 'kg',
    alias: ['squat', 'back squat', 'squat bilanciere'],
    muscoli: 'Quadricipiti, glutei, femorali, lombari',
    passi: [
      'Bilanciere sui trapezi, piedi poco più larghi delle spalle con le punte leggermente aperte.',
      'Petto in fuori e addome contratto.',
      'Scendi spingendo il bacino indietro e piegando le ginocchia, come per sederti.',
      'Scendi almeno finché le cosce sono parallele al pavimento, poi risali spingendo sui talloni.',
    ],
    consigli: ['Le ginocchia seguono la direzione delle punte dei piedi.', 'Talloni sempre a terra.', 'Usa il rack con le sicure.'],
  },
  {
    id: 'goblet-squat', nome: 'Goblet squat', gruppo: 'Gambe', img: 'Goblet_Squat', tipo: 'kg',
    alias: ['goblet squat', 'squat con manubrio', 'squat con kettlebell'],
    muscoli: 'Quadricipiti, glutei, addome',
    passi: [
      'Tieni un manubrio o un kettlebell davanti al petto con entrambe le mani.',
      'Piedi poco più larghi delle spalle.',
      'Scendi in squat tenendo il busto dritto e i gomiti tra le ginocchia.',
      'Risali spingendo sui talloni.',
    ],
    consigli: ['Il modo migliore per imparare lo squat.', 'Scendi più che puoi mantenendo la schiena dritta.'],
  },
  {
    id: 'squat-sumo', nome: 'Squat sumo con manubrio', gruppo: 'Glutei', img: 'Plie_Dumbbell_Squat', tipo: 'kg',
    alias: ['squat sumo', 'sumo squat', 'plie squat'],
    muscoli: 'Glutei, adduttori, quadricipiti',
    passi: [
      'Piedi molto larghi con le punte aperte verso l\'esterno.',
      'Tieni un manubrio tra le gambe a braccia tese.',
      'Scendi tenendo il busto dritto e le ginocchia aperte.',
      'Risali stringendo i glutei.',
    ],
    consigli: ['Spingi le ginocchia verso l\'esterno durante la discesa.'],
  },
  {
    id: 'leg-press', nome: 'Leg press', gruppo: 'Gambe', img: 'Leg_Press', tipo: 'kg',
    alias: ['leg press', 'pressa', 'pressa 45'],
    muscoli: 'Quadricipiti, glutei, femorali',
    passi: [
      'Siediti con la schiena ben appoggiata e i piedi sulla pedana alla larghezza delle spalle.',
      'Sblocca le sicure e scendi piegando le ginocchia verso il petto.',
      'Scendi finché il bacino non si stacca dallo schienale.',
      'Spingi senza bloccare le ginocchia in fondo.',
    ],
    consigli: ['Piedi più alti sulla pedana = più glutei e femorali; più bassi = più quadricipiti.', 'Il bacino non deve mai staccarsi.'],
  },
  {
    id: 'hack-squat', nome: 'Hack squat', gruppo: 'Gambe', img: 'Hack_Squat', tipo: 'kg',
    alias: ['hack squat'],
    muscoli: 'Quadricipiti, glutei',
    passi: [
      'Schiena e spalle contro i cuscinetti, piedi al centro della pedana.',
      'Sblocca le sicure e scendi piegando le ginocchia.',
      'Risali spingendo con tutta la pianta del piede.',
    ],
    consigli: ['Scendi lentamente e risali con forza.'],
  },
  {
    id: 'affondi', nome: 'Affondi con manubri', gruppo: 'Gambe', img: 'Dumbbell_Lunges', tipo: 'kg',
    alias: ['affondi', 'affondi camminati', 'lunges', 'walking lunges', 'affondi in avanti'],
    muscoli: 'Quadricipiti, glutei',
    passi: [
      'In piedi con un manubrio per mano.',
      'Fai un passo lungo in avanti e scendi finché il ginocchio dietro sfiora il pavimento.',
      'Il ginocchio davanti resta sopra la caviglia.',
      'Spingi con il piede davanti per tornare su (o per fare il passo successivo).',
    ],
    consigli: ['Le ripetizioni sono per gamba.', 'Busto dritto, sguardo avanti.'],
  },
  {
    id: 'affondi-indietro', nome: 'Affondi indietro', gruppo: 'Glutei', img: 'Dumbbell_Rear_Lunge', tipo: 'kg',
    alias: ['affondi indietro', 'reverse lunge', 'affondi posteriori'],
    muscoli: 'Glutei, quadricipiti',
    passi: [
      'In piedi con un manubrio per mano.',
      'Fai un passo indietro e scendi finché il ginocchio dietro sfiora il pavimento.',
      'Spingi sul tallone della gamba davanti per tornare su.',
    ],
    consigli: ['Più delicati sulle ginocchia degli affondi in avanti.', 'Busto leggermente in avanti = più lavoro per i glutei.'],
  },
  {
    id: 'affondi-bulgari', nome: 'Affondi bulgari', gruppo: 'Glutei', img: 'Split_Squat_with_Dumbbells', tipo: 'kg',
    alias: ['affondi bulgari', 'bulgarian split squat', 'split squat'],
    muscoli: 'Glutei, quadricipiti',
    passi: [
      'Appoggia il collo del piede dietro di te su una panca.',
      'Con l\'altro piede avanti, scendi piegando la gamba davanti.',
      'Scendi finché la coscia davanti è parallela al pavimento.',
      'Risali spingendo sul tallone.',
    ],
    consigli: ['Le ripetizioni sono per gamba.', 'Inizia senza pesi per trovare l\'equilibrio.'],
  },
  {
    id: 'leg-extension', nome: 'Leg extension', gruppo: 'Gambe', img: 'Leg_Extensions', tipo: 'kg',
    alias: ['leg extension', 'estensioni gambe'],
    muscoli: 'Quadricipiti',
    passi: [
      'Siediti con il rullo sopra le caviglie e le ginocchia allineate al perno della macchina.',
      'Distendi le gambe fino in fondo.',
      'Stringi i quadricipiti 1 secondo e scendi lentamente.',
    ],
    consigli: ['Non far cadere il peso: scendi controllando.'],
  },
  {
    id: 'leg-curl', nome: 'Leg curl seduto', gruppo: 'Gambe', img: 'Seated_Leg_Curl', tipo: 'kg',
    alias: ['leg curl', 'leg curl seduto', 'flessioni gambe'],
    muscoli: 'Femorali',
    passi: [
      'Siediti con il rullo sotto i polpacci e il cuscinetto sopra le cosce.',
      'Piega le ginocchia portando i talloni sotto il sedile.',
      'Torna su lentamente.',
    ],
    consigli: ['Schiena appoggiata per tutta la serie.'],
  },
  {
    id: 'leg-curl-sdraiato', nome: 'Leg curl sdraiato', gruppo: 'Gambe', img: 'Lying_Leg_Curls', tipo: 'kg',
    alias: ['leg curl sdraiato', 'lying leg curl'],
    muscoli: 'Femorali',
    passi: [
      'Sdraiati a pancia in giù con il rullo sopra le caviglie.',
      'Piega le ginocchia portando i talloni verso i glutei.',
      'Scendi lentamente.',
    ],
    consigli: ['Il bacino resta appoggiato alla panca.'],
  },
  {
    id: 'stacco-rumeno', nome: 'Stacco rumeno con bilanciere', gruppo: 'Gambe', img: 'Romanian_Deadlift', tipo: 'kg',
    alias: ['stacco rumeno', 'romanian deadlift', 'rdl', 'stacco a gambe tese'],
    muscoli: 'Femorali, glutei, lombari',
    passi: [
      'In piedi con il bilanciere davanti alle cosce, ginocchia appena piegate.',
      'Spingi il bacino indietro e scendi con il bilanciere lungo le gambe.',
      'Scendi finché senti tirare dietro le cosce (di solito a metà tibia).',
      'Risali spingendo il bacino in avanti e stringendo i glutei.',
    ],
    consigli: ['La schiena resta sempre dritta.', 'Le ginocchia non si piegano di più durante la discesa.'],
  },
  {
    id: 'stacco-rumeno-manubri', nome: 'Stacco rumeno con manubri', gruppo: 'Glutei', img: 'Stiff-Legged_Dumbbell_Deadlift', tipo: 'kg',
    alias: ['stacco rumeno manubri', 'stacco gambe tese manubri', 'dumbbell rdl'],
    muscoli: 'Femorali, glutei',
    passi: [
      'In piedi con un manubrio per mano davanti alle cosce.',
      'Ginocchia appena piegate, spingi il bacino indietro e scendi con i manubri lungo le gambe.',
      'Fermati quando senti tirare dietro le cosce.',
      'Risali stringendo i glutei.',
    ],
    consigli: ['Pensa a chiudere una porta con il sedere.', 'Schiena dritta: se si curva, scendi meno.'],
  },
  {
    id: 'step-up', nome: 'Step up su panca', gruppo: 'Glutei', img: 'Dumbbell_Step_Ups', tipo: 'kg',
    alias: ['step up', 'salite sulla panca', 'step-up'],
    muscoli: 'Glutei, quadricipiti',
    passi: [
      'Davanti a una panca o un box, con un manubrio per mano.',
      'Appoggia tutto il piede sulla panca e sali spingendo su quel tallone.',
      'Scendi lentamente con la stessa gamba che è salita per ultima.',
    ],
    consigli: ['Le ripetizioni sono per gamba.', 'Non darti la spinta con il piede a terra.'],
  },
  {
    id: 'polpacci', nome: 'Calf in piedi', gruppo: 'Gambe', img: 'Standing_Calf_Raises', tipo: 'kg',
    alias: ['polpacci', 'calf', 'calf raise', 'calf in piedi'],
    muscoli: 'Polpacci',
    passi: [
      'Punte dei piedi sul bordo della pedana, talloni fuori.',
      'Sali sulle punte più in alto che puoi.',
      'Scendi lentamente sotto il livello della pedana.',
    ],
    consigli: ['Fermati 1 secondo in alto e 1 in basso.'],
  },

  // ---------------------------------------------------------------- Glutei
  {
    id: 'hip-thrust', nome: 'Hip thrust', gruppo: 'Glutei', img: 'Barbell_Hip_Thrust', tipo: 'kg',
    alias: ['hip thrust', 'spinte del bacino', 'hip thrust bilanciere', 'hip thrust macchina'],
    muscoli: 'Glutei, femorali',
    passi: [
      'Siediti a terra con la parte alta della schiena appoggiata a una panca, bilanciere (con un cuscinetto) sul bacino.',
      'Piedi a terra alla larghezza dei fianchi, ginocchia piegate.',
      'Spingi il bacino verso l\'alto finché il busto è parallelo al pavimento.',
      'Stringi forte i glutei 1-2 secondi in alto, poi scendi.',
    ],
    consigli: ['Mento verso il petto: lo sguardo segue il bacino.', 'In alto le tibie devono essere verticali.', 'Il re degli esercizi per i glutei.'],
  },
  {
    id: 'ponte-glutei', nome: 'Ponte per glutei', gruppo: 'Glutei', img: 'Barbell_Glute_Bridge', tipo: 'kg',
    alias: ['ponte glutei', 'glute bridge', 'ponte'],
    muscoli: 'Glutei, femorali',
    passi: [
      'Sdraiata a terra con le ginocchia piegate e i piedi appoggiati.',
      'Peso (bilanciere o manubrio) sul bacino, se previsto.',
      'Solleva il bacino stringendo i glutei.',
      'Scendi lentamente.',
    ],
    consigli: ['Si può fare anche senza peso o con un elastico sopra le ginocchia.'],
  },
  {
    id: 'abductor', nome: 'Abductor machine', gruppo: 'Glutei', img: 'Thigh_Abductor', tipo: 'kg',
    alias: ['abductor', 'abduttori', 'abduzioni', 'macchina abduttori'],
    muscoli: 'Gluteo medio, abduttori',
    passi: [
      'Siediti con i cuscinetti all\'esterno delle ginocchia.',
      'Apri le gambe più che puoi.',
      'Richiudi lentamente senza far sbattere i pesi.',
    ],
    consigli: ['Busto leggermente in avanti = più lavoro per i glutei.'],
  },
  {
    id: 'kickback-cavo', nome: 'Kickback al cavo', gruppo: 'Glutei', img: 'One-Legged_Cable_Kickback', tipo: 'kg',
    alias: ['kickback glutei', 'glute kickback', 'slanci al cavo', 'kickback al cavo'],
    muscoli: 'Glutei',
    passi: [
      'Cavigliera agganciata al cavo basso, mani appoggiate alla macchina.',
      'Busto leggermente inclinato in avanti.',
      'Porta la gamba indietro e in alto stringendo il gluteo.',
      'Torna avanti lentamente.',
    ],
    consigli: ['Le ripetizioni sono per gamba.', 'Non inarcare la schiena: si muove solo l\'anca.'],
  },
  {
    id: 'slanci-glutei', nome: 'Slanci per glutei a terra', gruppo: 'Glutei', img: 'Glute_Kickback', tipo: 'corpo',
    alias: ['slanci', 'donkey kick', 'slanci a quattro zampe'],
    muscoli: 'Glutei',
    passi: [
      'A quattro zampe, mani sotto le spalle e ginocchia sotto i fianchi.',
      'Spingi un piede verso il soffitto con il ginocchio piegato.',
      'Stringi il gluteo in alto e torna giù.',
    ],
    consigli: ['Le ripetizioni sono per gamba.', 'Si può aggiungere una cavigliera.'],
  },

  // ---------------------------------------------------------------- Addome
  {
    id: 'plank', nome: 'Plank', gruppo: 'Addome', img: 'Plank', tipo: 'sec',
    alias: ['plank', 'tenuta plank'],
    muscoli: 'Addome, lombari, spalle',
    passi: [
      'Appoggiati sugli avambracci e sulle punte dei piedi.',
      'Corpo dritto dalla testa ai talloni.',
      'Tieni la posizione respirando normalmente.',
    ],
    consigli: ['Il bacino non deve né scendere né salire.', 'Stringi glutei e addome.'],
  },
  {
    id: 'plank-laterale', nome: 'Plank laterale', gruppo: 'Addome', img: 'Side_Bridge', tipo: 'sec',
    alias: ['plank laterale', 'side plank'],
    muscoli: 'Obliqui, addome',
    passi: [
      'Di fianco, appoggiato sull\'avambraccio e sul lato del piede.',
      'Solleva il bacino fino ad avere il corpo dritto.',
      'Tieni la posizione, poi cambia lato.',
    ],
    consigli: ['Il tempo è per lato.'],
  },
  {
    id: 'crunch', nome: 'Crunch', gruppo: 'Addome', img: 'Crunches', tipo: 'corpo',
    alias: ['crunch', 'addominali', 'sit up'],
    muscoli: 'Addome',
    passi: [
      'Sdraiato con le ginocchia piegate e le mani dietro la testa.',
      'Solleva le spalle da terra arrotolando la schiena.',
      'Scendi lentamente.',
    ],
    consigli: ['Non tirare la testa con le mani.', 'Movimento corto: conta la contrazione, non l\'altezza.'],
  },
  {
    id: 'crunch-inverso', nome: 'Crunch inverso', gruppo: 'Addome', img: 'Reverse_Crunch', tipo: 'corpo',
    alias: ['crunch inverso', 'reverse crunch'],
    muscoli: 'Addome basso',
    passi: [
      'Sdraiato con le gambe sollevate e le ginocchia piegate a 90°.',
      'Porta le ginocchia verso il petto sollevando il bacino da terra.',
      'Scendi lentamente.',
    ],
    consigli: ['Niente slancio: solleva il bacino con l\'addome.'],
  },
  {
    id: 'crunch-cavi', nome: 'Crunch ai cavi', gruppo: 'Addome', img: 'Cable_Crunch', tipo: 'kg',
    alias: ['crunch ai cavi', 'cable crunch', 'crunch in ginocchio al cavo'],
    muscoli: 'Addome',
    passi: [
      'In ginocchio davanti al cavo alto, corda tenuta ai lati della testa.',
      'Arrotola il busto portando i gomiti verso le ginocchia.',
      'Torna su lentamente.',
    ],
    consigli: ['Il bacino resta fermo: si piega solo la schiena.'],
  },
  {
    id: 'russian-twist', nome: 'Russian twist', gruppo: 'Addome', img: 'Russian_Twist', tipo: 'corpo',
    alias: ['russian twist', 'torsioni russe'],
    muscoli: 'Obliqui, addome',
    passi: [
      'Seduto con le ginocchia piegate e il busto inclinato indietro.',
      'Ruota il busto portando le mani (o un disco) da un lato all\'altro.',
    ],
    consigli: ['Per renderlo più difficile solleva i piedi da terra.', 'Una ripetizione = destra + sinistra.'],
  },
  {
    id: 'dead-bug', nome: 'Dead bug', gruppo: 'Addome', img: 'Dead_Bug', tipo: 'corpo',
    alias: ['dead bug', 'scarafaggio'],
    muscoli: 'Addome profondo',
    passi: [
      'Sdraiato con braccia verso il soffitto e ginocchia piegate a 90° sopra i fianchi.',
      'Allunga il braccio destro dietro la testa e la gamba sinistra in avanti, senza toccare terra.',
      'Torna al centro e cambia lato.',
    ],
    consigli: ['La parte bassa della schiena resta schiacciata a terra.', 'Lento e controllato.'],
  },
  {
    id: 'leg-raise', nome: 'Sollevamento gambe alla sbarra', gruppo: 'Addome', img: 'Hanging_Leg_Raise', tipo: 'corpo',
    alias: ['leg raise', 'sollevamento gambe', 'hanging leg raise', 'knee raise'],
    muscoli: 'Addome basso, flessori dell\'anca',
    passi: [
      'Appeso alla sbarra (o con gli avambracci sulla sedia romana).',
      'Solleva le gambe fino a 90° (o le ginocchia verso il petto).',
      'Scendi lentamente senza dondolare.',
    ],
    consigli: ['Con le ginocchia piegate è più facile.'],
  },
  {
    id: 'mountain-climber', nome: 'Mountain climber', gruppo: 'Addome', img: 'Mountain_Climbers', tipo: 'sec',
    alias: ['mountain climber', 'scalatore'],
    muscoli: 'Addome, spalle, cardio',
    passi: [
      'In posizione di piegamento a braccia tese.',
      'Porta un ginocchio verso il petto, poi cambia gamba velocemente.',
    ],
    consigli: ['Bacino basso e fermo.'],
  },

  // ---------------------------------------------------------------- Cardio
  {
    id: 'tapis-roulant', nome: 'Tapis roulant (camminata)', gruppo: 'Cardio', img: 'Walking_Treadmill', tipo: 'min',
    alias: ['tapis roulant', 'camminata', 'camminata in pendenza', 'treadmill'],
    muscoli: 'Cardio, gambe',
    passi: ['Imposta velocità e pendenza indicate nella scheda.', 'Cammina senza tenerti alle maniglie.'],
    consigli: ['La camminata in pendenza (8-12%) brucia molto ed è leggera sulle articolazioni.'],
  },
  {
    id: 'corsa', nome: 'Corsa sul tapis roulant', gruppo: 'Cardio', img: 'Running_Treadmill', tipo: 'min',
    alias: ['corsa', 'running', 'corsa tapis roulant'],
    muscoli: 'Cardio, gambe',
    passi: ['Inizia con 3-5 minuti di camminata.', 'Corri alla velocità indicata, passo leggero.'],
    consigli: ['Per gli intervalli: alterna tratti veloci e lenti come da scheda.'],
  },
  {
    id: 'cyclette', nome: 'Cyclette', gruppo: 'Cardio', img: 'Bicycling_Stationary', tipo: 'min',
    alias: ['cyclette', 'bici', 'spinning', 'bike'],
    muscoli: 'Cardio, gambe',
    passi: ['Regola il sellino: con il pedale in basso la gamba resta appena piegata.', 'Pedala alla resistenza indicata.'],
    consigli: ['Ottima per il cardio dopo i pesi senza affaticare le articolazioni.'],
  },
  {
    id: 'ellittica', nome: 'Ellittica', gruppo: 'Cardio', img: 'Elliptical_Trainer', tipo: 'min',
    alias: ['ellittica', 'elliptical'],
    muscoli: 'Cardio, tutto il corpo',
    passi: ['Sali sui pedali e impugna le maniglie mobili.', 'Spingi e tira con braccia e gambe a ritmo costante.'],
    consigli: ['Mantieni il busto dritto.'],
  },
  {
    id: 'vogatore', nome: 'Vogatore', gruppo: 'Cardio', img: 'Rowing_Stationary', tipo: 'min',
    alias: ['vogatore', 'rowing', 'remoergometro'],
    muscoli: 'Cardio, schiena, gambe',
    passi: ['Spingi prima con le gambe, poi porta indietro il busto e tira la maniglia al petto.', 'Torna avanti nell\'ordine inverso.'],
    consigli: ['La forza viene per il 60% dalle gambe.'],
  },
  {
    id: 'stepper', nome: 'Stair climber', gruppo: 'Cardio', img: 'Stairmaster', tipo: 'min',
    alias: ['stair climber', 'scale', 'stepper', 'stairmaster'],
    muscoli: 'Cardio, glutei, gambe',
    passi: ['Sali i gradini a ritmo costante.', 'Tieniti alle maniglie solo per l\'equilibrio.'],
    consigli: ['Ottimo anche per i glutei.'],
  },
];

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

const index = new Map();
for (const ex of EXERCISES) for (const key of [ex.id, ex.nome, ...ex.alias]) index.set(norm(key), ex);

/** Esercizio della libreria da id o nome (anche con alias o parole in più), oppure null. */
export function findExercise(idOrName) {
  const key = norm(idOrName);
  if (!key) return null;
  if (index.has(key)) return index.get(key);
  // Nome con aggiunte (es. "Hip thrust al multipower"): vince l'alias più lungo contenuto nel nome.
  let best = null, bestLen = 0;
  for (const [k, ex] of index) {
    if (k.length > bestLen && (` ${key} `).includes(` ${k} `)) { best = ex; bestLen = k.length; }
  }
  return best;
}

export const exerciseById = id => EXERCISES.find(e => e.id === id) ?? null;
