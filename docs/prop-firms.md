# Prop firms — comparaison des comptes

Fiche de comparaison des offres, pour choisir où placer les comptes. Elle se remplit au fur et à mesure des captures ; chaque bloc note sa source et sa date, parce que ces offres changent souvent (promos, règles révisées).

Toutes les valeurs sont en **dollars**. Le risque de référence est celui du plan en vigueur : **500 $ par trade, 2 lots**, voir `docs/backtesting.md` §1.

Sources : captures du 24.11.2026 — FTMO (code promo `FTMO26`, onglets *Overview* et fiches 50K / 100K) et LMI (les trois formules, promo valable jusqu'au 30 novembre).

---

> **Mise à jour du 24.11.2026, en fin de journée** : un poste en présentiel de 8h à 18h change le critère de choix. Le prix et la cohérence passent au second plan derrière **le droit d'automatiser** — voir §7, qui prime sur le verdict ci-dessous.

## 0. Verdict au 24.11.2026 — LMI, en formule Standard

**LMI reste meilleur que FTMO**, sur trois points qui pèsent plus que tout le reste :

1. **La plateforme.** VolFix n'est pas proposé par FTMO. Les niveaux, l'approche en ticks, l'ordre limite 1 tick avant le niveau : toute la méthode se lit sur le DOM VolFix. Tant qu'on ne sait pas si VolFix se branche sur le flux FTMO, c'est éliminatoire — pas une ligne de tableau.
2. **Les retraits.** LMI verse 100 % jusqu'à 30 000 $ gagnés, puis 90 %. FTMO : 90/10, **la moitié seulement est retirable**, plafond de 2 500 $ par demande, 4 jours à 150 $+ et « profit neuf de 50 % du montant demandé ». À 3 389 $/mois, LMI paie tout, FTMO freine.
3. **Le prix.** 609 $/an contre 1 008 $/an par compte (et 1 428 $ hors promo FTMO). Sur trois comptes, ~1 200 $/an d'écart.

Et la formule à choisir chez LMI est **Standard**, pas Direct Funded : voir §4.

**Si tu devais partir de LMI, ce serait vers TopStep, pas FTMO** : même prix (85 $/mois), mais des plafonds de retrait de 4 000 à 6 000 $ par demande contre 2 500, l'activation du compte financé gratuite, un reset offert chaque mois, et une cohérence à 55 % qui ne bloque jamais rien chez toi. Voie de retrait la plus rapide : 5 jours gagnants à 150 $+, soit **9 jours de trading** en moyenne sur ton historique.

**Ce que FTMO a pour lui**, honnêtement : une perte journalière plus large sur le 100K (2 000 contre 1 500), un drawdown peut-être figé plutôt que suiveur (non confirmé), et surtout **le risque de contrepartie** — c'est une firme bien plus grosse et plus ancienne. Cet argument-là ne se mesure pas sur un backtest, mais il grandit avec les montants en jeu.

L'avantage « drawdown peut-être figé » est en grande partie neutralisé par les chiffres : **le pire creux de fin de journée de l'année est de 790 $** pour une limite de 2 000 $, soit 1 210 $ de marge jamais entamée. Suiveur ou figé, ça ne change presque rien à ton niveau de risque.

---

## 1. LMI — les trois formules

Les règles de trading sont **identiques dans les trois formules** ; seuls le prix, l'objectif et la cohérence changent.

| par taille | MINI 10k | SMALL 30k | **MEDIUM 50k** | **LARGE 100k** | MAX 150k | EXTRA 300k |
|---|---|---|---|---|---|---|
| Drawdown max **suiveur** (EOD) | 450 | 1 000 | **2 000** | **3 000** | 4 500 | 6 500 |
| Taille max de position | 1 | 3 | **5** | **10** | 15 | 30 |
| Pause quotidienne | 250 | 750 | **1 000** | **1 500** | 2 500 | 3 500 |

| MEDIUM 50k | **Standard** | **Sans frais d'activation** | **Direct Funded** |
|---|---|---|---|
| Objectif de profit | 3 000 | 3 000 | **aucun** |
| Abonnement | 40 $/30 j (56 hors promo) | 57 $/30 j (81) | **aucun** |
| Frais d'activation | 129 $ | 0 | 0 |
| Coût du redémarrage | 39 $ | 55 $ | — |
| Coût du compte | — | — | **360 $ une fois** (450) |
| Règle de cohérence | *non affichée* | *non affichée* | **20 %** |

| LARGE 100k | **Standard** | **Sans frais d'activation** | **Direct Funded** |
|---|---|---|---|
| Objectif de profit | 6 000 | 6 000 | **aucun** |
| Abonnement | 78 $/30 j (111) | 105 $/30 j (150) | **aucun** |
| Frais d'activation | 139 $ | 0 | 0 |
| Coût du redémarrage | 69 $ | 89 $ | — |
| Coût du compte | — | — | **488 $ une fois** (610) |
| Règle de cohérence | *non affichée* | *non affichée* | **20 %** |

---

## 2. Les trois firmes, sur un compte 50k

| | **LMI** MEDIUM 50k | **FTMO** 50K | **TopStep** 50K |
|---|---|---|---|
| Prix | **40 $/mois** + 129 $ d'activation (Standard) | 84 $/mois (119 hors promo) | 85 $/mois (95) |
| Coût sur un an | **609 $** | 1 008 $ | 1 020 $ |
| Objectif (évaluation) | 3 000 | 3 000 | 3 000 |
| Drawdown max | 2 000, **suiveur**, EOD | 2 000, EOD (*suiveur ou figé ?*) | 2 000, « Max Loss Limit — One Rule » (*suiveur jusqu'où ?*) |
| Perte journalière | 1 000 (pause) | 1 000, « soft » | 1 000 |
| Contrats max | 5 mini | 5 mini | 5 mini **ou 50 micros** |
| Règle de cohérence | **aucune** (Standard) ; 20 % en Direct Funded | 40 %, évaluation seulement | **55 %**, évaluation |
| Frais d'activation du compte financé | 129 $ | — | **gratuit** (Express Funded) |
| Redémarrage | 39 $ | *à vérifier* | 85 $, **un crédit de reset par mois inclus** |
| Plafond par retrait | *à vérifier* | 2 500 | **4 000** (voie Standard) ou **6 000** (voie Consistency) — doublés en promo |
| Conditions de retrait | *à vérifier* | 4 jours à 150 $+, 50 % retirable | 5 jours gagnants à 150 $+ (Standard), ou 3 jours tradés avec meilleur jour ≤ 40 % (Consistency) |
| Partage des gains | 100 % jusqu'à 30 000, puis 90 % | 90 / 10, 50 % retirable | *non affiché* |
| Comptes simultanés | *à vérifier* | 3 | *à vérifier* |
| Plateforme | **VolFix** | NinjaTrader, TradingView, Tradovate | *à vérifier* |

Sur le 100k, LMI et FTMO offrent 10 contrats et 3 000 $ de drawdown ; FTMO est plus large sur la perte journalière (2 000 contre 1 500).

**Ce que les chiffres disent de chacun :**

- **LMI** est le moins cher (609 $/an contre ~1 020 $ chez les deux autres) et le seul à verser 100 % des gains. Et c'est le seul à proposer VolFix.
- **TopStep** a la meilleure mécanique de retrait : 4 000 à 6 000 $ par demande là où FTMO plafonne à 2 500, activation gratuite du compte financé, et un reset offert par mois. Sa cohérence à 55 % est la plus large des trois.
- **FTMO** ne gagne sur rien en particulier à cette taille : même prix que TopStep, plafonds de retrait deux fois plus bas, et la moitié des gains seulement retirable.

---

## 3. La cohérence, mesurée sur ton backtest

Mesuré sur l'année du backtest : 384 trades, 2 lots, commissions déduites, 197 jours tradés, 40 671 $ soit 3 389 $/mois.

**Ta distribution est très plate** : 152 jours gagnants sur 197, et les cinq plus grosses journées font 1 558, 1 372, 1 343, 1 123 et 892 $. La plus grosse journée de l'année ne pèse que **3,8 % du total annuel**. Ce n'est pas un profil « un gros coup et on arrête », qui est ce que ces règles visent.

Le seuil se lit ainsi : une journée à 1 558 $ exige un cumul de **3 896 $ à 40 %**, mais de **7 792 $ à 20 %**.

| objectif à atteindre | 55 % (TopStep) | 40 % (FTMO) | 20 % (LMI Direct Funded) |
|---|---|---|---|
| 3 000 $ | 14,9 jours (5–27) · **ne bloque jamais** | 15,5 jours (7–27) · bloque **28 %** · +0,7 jour | 24,8 jours (9–46) · bloque **81 %** · **+10 jours** |
| 2 000 $ | — | 12,5 jours (4–27) · bloque 37 % · +2,1 jours | 23,4 jours (7–46) · bloque **93 %** · **+13 jours** |
| 1 500 $ | — | 11,2 jours (3–26) · bloque 53 % · +2,9 jours | 23,4 jours (7–46) · bloque **100 %** · **+15 jours** |

Lecture : à 40 %, la règle n'est qu'une gêne occasionnelle — elle ajoute moins d'un jour en moyenne pour un objectif de 3 000 $, et sur l'évaluation FTMO 100K (6 000 $) **elle ne bloque jamais**, sur aucun des 171 départs simulés.

À 20 %, elle devient structurante : elle mord sur 8 départs sur 10 et ajoute **10 jours de trading en moyenne**. Et plus le montant visé est petit, pire c'est — pour sortir 1 500 $, elle bloque **100 %** des départs. Autrement dit, une règle à 20 % interdit en pratique les petits retraits fréquents : il faut laisser le profit s'accumuler jusqu'à ~8 000 $ dès qu'une journée à 1 500 $ est passée.

**Mais le 20 % n'existe que sur Direct Funded.** Le classement complet est donc :

1. **LMI Standard / Sans frais d'activation — aucune règle de cohérence affichée.** Rien ne bat ça.
2. **TopStep — 55 %, évaluation.** Si large qu'elle ne bloque **aucun** des départs simulés : la Combine se valide en 14,9 jours, exactement comme s'il n'y avait pas de règle.
3. **FTMO — 40 %, et sur l'évaluation seulement.** Gêne mineure : +0,7 jour en moyenne sur le 50K, jamais bloquant sur le 100K.
4. **LMI Direct Funded — 20 %.** De loin la plus contraignante, +10 jours en moyenne.

Autrement dit, FTMO est meilleur que **Direct Funded**, mais moins bon que les deux autres formules LMI. Et comme le compte en cours tourne sur une formule avec abonnement (cf. `docs/backtesting.md`, « ~50 € par compte »), la situation actuelle est déjà la plus favorable des trois sur ce point.

Le vrai arbitrage est donc **interne à LMI** : Direct Funded fait sauter l'évaluation (pas d'objectif, 360 $ une fois) mais impose le 20 % à vie ; Standard garde l'évaluation (3 000 $, ~15 jours de trading) et l'abonnement, mais aucune contrainte de cohérence ensuite. Sur ton profil, l'évaluation coûte deux semaines une fois ; le 20 % coûte dix jours **à chaque retrait**. Standard gagne dès le deuxième retrait.

Deux réserves :

- Les grilles Standard et Sans frais d'activation **n'affichent pas** de ligne de cohérence — ce n'est pas la même chose qu'une confirmation qu'il n'y en a pas. À vérifier dans les règles complètes.
- Je ne sais pas **à quoi** s'applique le 20 % de Direct Funded. Comme cette formule n'a pas d'évaluation, il porte vraisemblablement sur les **retraits** : c'est la lecture utilisée pour les chiffres ci-dessus. S'il se mesure autrement (mois civil, solde), le tableau est à refaire.

---

## 4. Challenge ou Direct Funded ? — simulé sur l'année

Les deux voies simulées depuis chacun des 167 départs possibles de l'année, avec le drawdown suiveur de 2 000 $ actif :

| | **Standard** (évaluation) | **Direct Funded** |
|---|---|---|
| Pour commencer à toucher | atteindre 3 000 $ | rien, le compte est financé d'emblée |
| Délai avant le premier retrait | **14,9 jours** de trading (5–27) | **24,1 jours** (7–46), à cause des 20 % |
| Départs où le compte saute avant | **0 / 167** | **0 / 167** |
| Coût sur 12 mois (MEDIUM) | 609 $ (129 + 40×12) | **360 $** une fois |
| Et aux retraits suivants | aucune contrainte | **+10 jours à chaque fois** |

Lecture : l'évaluation coûte **quinze jours, une seule fois**. Le 20 % coûte **dix jours, à chaque retrait**. La deuxième sortie d'argent suffit à annuler l'avantage de Direct Funded, et tout ce qui suit est du pur déficit.

Les 249 $ d'écart de prix annuel ne pèsent rien en face : 0,6 % du profit annuel du backtest.

**Entre les deux formules à abonnement** : Standard revient à 129 + 40 $/mois, Sans frais d'activation à 57 $/mois. Standard devient le moins cher au-delà de **8 mois** de détention, et son redémarrage est moins cher aussi (39 $ contre 55 $). Sans frais d'activation n'a d'intérêt que pour un compte gardé moins de huit mois.

Réserve sur le « 0 / 167 » : les réglages du backtest ont été choisis **sur cette même année**, donc le taux d'échec réel est forcément au-dessus de zéro. Ce que le chiffre dit vraiment, c'est que la marge est large — la pire journée de l'année perd 465 $ pour un drawdown de 2 000 $.

---

## 5. La fenêtre de retrait chez FTMO

Une fois financé, FTMO remplace la cohérence par des conditions de retrait : 4 jours à 150 $+ chacun (50K).

| seuil | jours concernés sur l'année | pour en réunir 4 |
|---|---|---|
| 150 $+ (50K) | 111 / 197 | 7,2 jours de trading en moyenne (4 au mieux, 14 au pire) |
| 300 $+ (100K) | 62 / 197 | 12,9 jours (4 au mieux, 32 au pire) |
| 450 $+ (150K) | 33 / 197 | 24,5 jours (6 au mieux, 49 au pire) |

Mesuré à **2 lots** : si tu montes la taille avec le compte, le 100K et le 150K retombent au niveau du 50K.

S'ajoutent le plafond par demande (2 500 $ sur le 50K), la part retirable de 50 % et le « profit neuf de 50 % du montant demandé » — soit un rythme de retrait sensiblement plus lent que les 100 % de LMI.

---

## 6. Trader loin de chez soi — ce qu'il faut vraiment

Le problème posé : l'appli mobile VolFix ne sait pas gérer TP1 / TP2.

**Mais le besoin n'est pas une appli pour trader au doigt.** Les entrées sont des ordres limites posés **1 tick avant un niveau connu la veille**, avec le SL attaché, 2 lots, TP1 sur un lot et trailing sur l'autre. Tout ça peut être posé avant de partir et vivre **côté serveur**. Ce qu'il faut, c'est une plateforme qui sait poser un ordre en attente avec **deux cibles et un stop partagé**, pas un DOM sur téléphone.

Deux technologies le font, et elles sont côté serveur (donc l'ordinateur peut être éteint) :

- **ATM Tradovate** : on ajoute des cibles avec le bouton « + » (cible 1 à 10 ticks sur 2 contrats, cible 2 à 15 ticks sur 2 contrats, stop commun), le tout en OCO. Les quantités se déclarent en contrats, pas en pourcentage. Appli iOS/Android native.
- **ATM NinjaTrader** : mêmes stratégies multi-cibles avec scale-out, stops hébergés sur les serveurs Rithmic. Appli mobile disponible.

État des lieux côté firmes :

| | plateformes mobiles | TP1/TP2 en attente |
|---|---|---|
| **LMI** | VolFix uniquement | **non** — le problème actuel |
| **FTMO** | Tradovate, NinjaTrader, TradingView | **oui**, via ATM |
| **TopStep** | TopstepX en navigateur / PWA ; appli native encore en liste d'attente fin 2026 | à vérifier |
| **MyFundedFutures** | **Volumetrica (VolFix) *et* Tradovate / NinjaTrader** selon le type de compte | **oui** — et VolFix reste dispo sur le bureau |

Deux réserves honnêtes : l'édition d'un ATM **multi-cibles depuis le mobile** est documentée sur bureau/web, pas sur téléphone — à tester avant de s'engager ; et chez MyFundedFutures les sources se contredisent sur la disponibilité de Tradovate selon le produit.

**Piste tierce** : PropTerminal (web + iOS + Android) pose des brackets OCO avec trailing sur Tradovate, NinjaTrader et Rithmic, et sait envoyer **un ordre vers plusieurs comptes avec des tailles différentes** — ce qui couvre aussi le montage master/slave.

**Ce qui bloquera quand même**, et qui n'est pas un problème de plateforme : un ordre en attente ne connaît pas les conditions du plan — les 15 ticks d'approche depuis l'ouverture, le niveau déjà utilisé, le blackout news ±10 min, les heures exclues. Poser les ordres la veille revient donc à prendre des trades que le plan interdit. La voie praticable : la Fiche du jour dit le matin quels niveaux sont tradables, on ne pose que ceux-là, avec une annulation programmée avant les news. Le journal pourrait produire cette liste d'ordres à poser — à construire.

---

## 7. Un travail de 8h à 18h — ce que ça change

Nouvelle contrainte depuis le 24.11.2026 : poste en présentiel **de 8h à 18h**, soit la quasi-totalité de la fenêtre d'ordres (9h–21h Berlin).

**Ne trader que le soir ne finance rien** : les entrées à 18h ou après font 56 trades sur 384, soit **272 $/mois au lieu de 3 389** — 8 % du revenu. Aucune entrée avant 8h, la séance ne commence qu'à 9h.

**Mais le process « Out of Home » existe déjà** (`docs/backtesting.md` §4) : ordres posés avant 9h, rien à toucher jusqu'à 18h, 4 paires, grosses news sautées → **≈ 1 680 $/mois**, DD 1 180. C'est la vraie base de comparaison, pas les 272 $. L'écart qui reste avec une journée normale chez soi (3 300 $/mois) est de **~1 620 $/mois** : c'est exactement ce que vaudrait un téléphone capable d'annuler et de reposer un ordre en cours de journée.

**La bonne nouvelle, et elle est décisive : il n'y a jamais plus d'un trade par paire et par jour.** Sur les 384 trades de l'année, les 384 cas sont à un seul trade par couple paire/jour. L'état intraday (« le niveau est déjà utilisé ») ne produit donc jamais une deuxième entrée le même jour sur la même paire : **toute la journée peut être posée le matin avant de partir**, un ordre par paire éligible, et plus rien à décider ensuite.

Restent quatre choses qui doivent tourner sans toi :

1. **Retirer l'ordre avant une news** (±10 min) — l'heure est connue la veille, donc une expiration horaire suffit, si la plateforme la propose.
2. **Le reposer après la news** — c'est le point dur : rien ne sait « poser un ordre à partir de telle heure ». Sans automatisation, ces entrées-là sont perdues.
3. **Retirer l'ordre aux heures exclues** de chaque paire — même mécanique que la news.
4. **Fermer à 4 h** (jamais après 16h Chicago) — il faut un ordre de clôture programmé, que les ATM classiques ne font pas.

Et un risque nouveau : **la limite de 5 contrats**. 78 paires de trades se chevauchent dans l'année, et jusqu'à 7 trades tombent le même jour. Aujourd'hui tu es devant l'écran pour arbitrer ; en posant six ordres le matin, trois remplissages simultanés font 6 contrats et la règle saute. Il faut soit limiter le nombre d'ordres posés en même temps, soit que le système le gère.

**Conséquence sur le choix de la firme : le critère qui décide n'est plus le prix, c'est le droit d'automatiser.** 400 $/an d'écart ne pèsent rien face à 3 100 $/mois de revenu qui dépendent d'ordres qui tournent seuls.

| firme | automatisation | VPS | note |
|---|---|---|---|
| **MyFundedFutures** | **autorisée, y compris complète** (politique de juillet 2025) | non interdit | propose **Volumetrica (VolFix) *et* Tradovate** |
| **FTMO Futures** | autorisée | autorisé | Tradovate, NinjaTrader, TradingView |
| **FundedNext Futures** | autorisée | autorisé | — |
| **TopStep** | API maison (~29 $/mois), mais **automatisation interdite sur le compte Live Funded** ; VPS et VPN interdits | non | l'API ne sert donc qu'à la Combine |
| **Apex** | **interdite** | — | — |
| **LMI** | *inconnue* | *inconnue* | **à demander avant tout** |

Sources : agrégateurs tiers, pas les CGU des firmes — à confirmer auprès de chacune. Et la règle a changé plusieurs fois en 2026.

**Ce que ça donne comme plan** : si LMI interdit l'automatisation, y rester revient à accepter 8 % du revenu. Dans ce cas MyFundedFutures devient le candidat naturel — VolFix au bureau pour la préparation, Tradovate pour l'exécution automatique, et le journal qui pilote. Le journal a déjà les niveaux, le calendrier, les fenêtres d'ordres et la table `PlanOrder` ; il lui manque l'API courtier.

---

## 8. Plateformes et paiements

| | **LMI** | **FTMO** |
|---|---|---|
| Plateformes | VolFix | NinjaTrader, TradingView, Tradovate — **pas de VolFix** |
| Moyens de paiement | *à vérifier* | Apple Pay, carte, Google Pay, PayPal, Revolut Pay |
| Moyens de retrait | *à vérifier* | Mastercard, Revolut, Visa Direct, Wise |

---

## 9. Points à trancher

- **À quoi s'applique le 20 % de LMI** (retraits ? mois civil ? solde ?) — toute la section 3 en dépend.
- **VolFix n'est pas dans la liste des plateformes FTMO.** Toute ta méthode se lit sur le DOM VolFix : les niveaux, l'approche en ticks, l'ordre limite 1 tick avant. Reste à savoir si VolFix sait se brancher sur le flux FTMO (Rithmic / CQG / Tradovate). Si non, changer de firme veut dire refaire la méthode sur NinjaTrader — et ça pèse plus lourd que n'importe quelle différence de règle.
- **Le drawdown FTMO est-il suiveur ?** La capture dit « Max Drawdown (EoD) » sans préciser, là où LMI écrit explicitement « Max. trailing drawdown (EOD) ». S'il est **figé** chez FTMO, c'est un avantage réel : passé 2 000 $ de gains, le compte ne peut plus mourir. S'il suit le pic, les deux sont équivalents.
- **Direct Funded est-il vraiment sans frais récurrents ?** La ligne « Durée de l'abonnement » est vide et le coût s'affiche en paiement unique. À confirmer, parce que c'est l'argument qui décide du coût annuel. (Note : `docs/backtesting.md` parle de « ~50 € par compte 50k », ce qui ressemble plutôt à l'abonnement Standard — à réconcilier.)
- **Comptes simultanés chez LMI**, et **copy trading master/slave** des deux côtés : rien dans les captures. FTMO affiche 3 comptes simultanés ; sans autorisation du copy trading, aucune des deux offres ne rentre dans le montage actuel.
- **Part retirable FTMO : 50 % de quoi ?** Du profit accumulé, ou du solde au-dessus du départ ?
- **Délai de paiement, jours minimum, règles news** : non affichés des deux côtés.

---

## 10. À ajouter

Les autres firmes à comparer, au même format. Envoyer les captures et je remplis.
