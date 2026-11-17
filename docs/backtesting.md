# Backtesting — plan, chiffres et ce qu'on a appris

Ce fichier contient le plan de trading en vigueur, les chiffres qui le justifient et la liste de ce qui a été testé puis écarté. Il est mis à jour à chaque changement du plan.

- Le backtest se lance sur le Mac avec `npx tsx scripts/databento-analyse.ts`.
- La table `PAIRS` de ce script contient les niveaux et les réglages de chaque paire ; c'est elle qui fait foi.
- Les résultats vont dans `prisma/databento-results.json`, que l'appli charge au démarrage.

Toutes les distances sont en **ticks** : 1 tick = une ligne du DOM, comme sur VolFix. Les heures sont en heure de **Chicago** ; à Berlin, c'est +7 h (+6 h entre fin octobre et début novembre).

---

## 1. Le compte

- **Prop firm** : LMI / VolFix, compte MEDIUM 50k.
  - Drawdown suiveur **fin de journée** de 2 000 $ : si on l'atteint, le compte saute.
  - Pause journalière de 1 000 $ de la firme.
  - **5 contrats** au maximum en même temps.
  - Pas d'objectif de profit une fois le compte financé.
- **Limites personnelles** :
  - jamais plus de **500 $** de perte sur un trade ;
  - **500 $ par jour** au maximum, positions ouvertes comprises : une fois atteints, on ferme tout et la journée est finie.
- **Taille** : toujours **2 lots**, sans micros. Avec 5 contrats autorisés, ça fait 2 positions ouvertes au plus en même temps.
- **Partage des gains** : 100 % pour moi jusqu'à 30 000 $ gagnés sur un compte, puis 90 % au-delà. Que le seuil soit par compte reste une supposition, non confirmée.
- **Commissions** (aller-retour, par contrat) : 3,22 $ sur le forex, 4,12 $ sur les grains, 1,52 $ sur ZN.
- **Frais fixes** : environ 50 € par compte 50k. Ils ne sont pas encore comptés dans l'appli.

## 2. Les règles — les mêmes pour toutes les paires

**Préparer la séance**

- **Horaires** : ordres de **2h à 14h** (9h à 21h à Berlin), sauf les heures exclues de chaque paire (voir §3). Les heures exclues ne concernent que les **nouveaux ordres** : un ordre pas encore rempli à l'heure exclue s'annule ; un trade déjà rempli se gère jusqu'au bout (SL, TP1, trailing, 4 h max). Exemple 6B : entré à 7h40, il continue après 8h et se ferme au plus tard à 11h40.
- **News** : pas d'ordre de **10 min avant à 10 min après** chaque news 3 étoiles des devises de la paire, **selon la note de TradingView** — ce sont celles de la Fiche du jour. Les 3 étoiles d'investing.com en plus (Initial Jobless Claims, ADP, JOLTS, stocks de pétrole, ventes de logements…) ne bloquent pas : testé le 16.11, les bloquer aussi coûte ≈ 120 $/mois (2 374 au lieu de 2 494), surtout sur 6E et ZS.
- **Approche** : je n'entre sur un niveau que si le prix a fait **au moins 15 ticks vers lui** depuis l'ouverture de 17h (19h pour les grains). Elle se mesure **depuis l'ouverture seulement**, et **jusqu'au niveau lui-même**, pas jusqu'au prix de l'ordre (sur ZS, l'ordre est 7 ticks au-delà : mesurer jusqu'à l'ordre ajoute 2 trades par an et coûte 15 $/mois, testé le 16.11) : une séance ouverte à moins de 15 ticks du niveau ne le trade pas, même si le prix s'en éloigne ensuite de 30 ticks ou plus puis revient ; il redevient tradable à la séance suivante si elle ouvre à au moins 15 ticks (ZS le 11.11 : ouvert à 9 ticks, parti de 44, revenu — pas de trade, et le stop aurait sauté). Un niveau traversé pendant la séance ne se trade donc plus dans l'autre sens.
- **Niveau tradable = deux conditions ensemble** : l'approche ci-dessus, et un niveau pas encore « utilisé » (déjà touché, par un trade ou hors horaires, sans s'en être éloigné de 30 ticks depuis). Les 30 ticks ne remplacent pas les 15 : ouvert à 40 ticks, touché la nuit, reparti de 15, revenu à 9h → non ; reparti de 35 → oui.

**Entrer**

- **Sens** : achat quand le prix descend sur le niveau, vente quand il monte dessus.
- **Ordre** : ordre limite **1 tick avant le niveau** (pour ZS : 7 ticks au-delà), 2 lots, avec le SL attaché à l'ordre. À 1 tick avant, l'ordre est rempli dès que le prix touche le niveau, quelle que soit ma place dans la file d'attente.
- **Un trade par jour et par paire** : je pose un ordre par niveau valable. Dès que l'un d'eux est rempli, j'annule les autres ordres de cette paire pour la journée. Les autres paires gardent leurs ordres.
- **Nouvelle touche** : un niveau déjà touché ne compte de nouveau que si le prix s'en éloigne de **30 ticks**, puis revient dessus. Exemple 6E le 06.11.26, niveau 1,1187 : séance ouverte 100 ticks au-dessus, touché à 1h32 (avant 2h, hors horaires), remonté de 43 ticks à 2h37, revenu à 3h19 → achat rempli à 3h34, +8,5 ticks. À l'inverse, 6J le 02.11.26 : touché à 20h, reparti de 23 ticks seulement → pas de trade le lendemain matin.
- **Ordre pas rempli** : si le prix touche l'entrée sans me prendre puis repart de moins de 30 ticks, c'est la même touche : l'ordre reste posé, et s'il est rempli au retour pendant mes horaires, c'est le trade. Exemple 6B le 14.09 : touché vers 4h15, remonté de 21 ticks, revenu et rempli à 7h53 (avant 8h), TP1 à 10h54. L'ordre se pose au prix de la colonne « Entrée » (1 tick avant le niveau) : posé sur le niveau même, il peut être touché sans être pris.
- **Déjà touché hors horaires** : pas d'ordre sur un niveau que le prix a déjà touché **en dehors des heures d'ordres** (la nuit avant 2h, pendant une heure exclue ou pendant le blackout d'une news), tant qu'il ne s'en est pas éloigné de 30 ticks. Une touche la nuit compte même sans trade : par exemple, touché à 23h30, éloigné de 15 ticks, revenu à 3h → pas de trade, c'est la même touche ; il faut d'abord 30 ticks d'éloignement puis un retour pendant les horaires. À vérifier sur le graphique à 2h, et en reposant les ordres après une news. Un prix qui traîne sur un niveau depuis des heures ne rebondit plus.

**Gérer le trade**

- **TP1** : je sors 1 lot au TP1 et je remonte le stop au prix d'entrée.
- **Runner** : l'autre lot suit un trailing qui démarre au TP1, à une distance égale au TP1. Il sort au **TP2** si le prix l'atteint.
- **Durée** : **4 h** au maximum en position.

## 3. Les paires

| Paire | Niveaux | SL | TP1 = trailing | TP2 | Ordres | Risque (2 lots) |
|---|---|---|---|---|---|---|
| 6B | 1,3186 · 1,3316 · 1,3477 · 1,3651 | 25 | 18 | 75 | 2h–8h seulement | 312 $ |
| 6E | 1,1187 · 1,15065 · 1,1591 · 1,16595 · 1,18435 | 12 | 15 | 60 | 2h–14h | 150 $ |
| 6J | 0,006286 · 0,0063545 · 0,006429 · 0,006555 | 15 | 10 | 40 | 3h–14h | 187 $ |
| 6N | 0,60785 · 0,59635 · 0,5930 · 0,58855 · 0,58515 · 0,57865 · 0,56795 · 0,5596 | 25 | 20 | 130 | 3h–7h, 9h–14h | 250 $ |
| 6C | 0,7078 · 0,70965 · 0,71235 · 0,71705 · 0,7196 · 0,7269 · 0,72935 | 25 | 20 | 55 | 2h–14h | 250 $ |
| ZN | 104'065 · 104'245 · 105'275 · 106'120 · 108'265 · 109'125 · 109'275 · 112'000 | 12 | 5 | 30 | 2h–14h | 375 $ |
| ZS | 1153,75 · 1174,75 · 1229,50 · 1293,50 | 12 | 10 | 45 | 8h–14h seulement | 300 $ |
| ZW | 578,25 · 606,50 · 634,50 · 710,50 | 15 | 5 | 40 | 2h–8h, 9h–14h | 375 $ |

**Pourquoi ces réglages :**

- **Heures exclues** : ce sont les ouvertures de marché. À 2h, c'est Londres (6J, 6N). De 7h à 9h, c'est l'ouverture américaine avec les chiffres de 7h30 (6N). À 8h, c'est la réouverture des grains à 8h30 (ZW).
- **6B seulement de 2h à 8h** : c'est la séance de Londres. Après, la séance américaine fait traverser les niveaux au sterling. Le matin seul fait 5 fois plus par trade, avec 2 fois moins de trades.
- **6E 12/15, 6J 15/10, ZW 15/5** : c'est moi qui les ai choisis, pour avoir plus de trades gagnants.
- **ZS au-delà du niveau, de 8h à 14h** : ZS dépasse ses niveaux avant de tourner, et la séance de jour des grains est la seule qui tienne.
- **TP2** : il est placé juste sous les plus grosses courses du runner sur l'année, et environ 1 runner sur 10 l'atteint. VolFix exige un TP2 dans le bracket ; placé là, il ne gêne pas le trailing.

Les prix d'entrée, de SL, de TP1, de TP2 et du 2e rebond de chaque niveau sont dans l'appli : onglet de la paire → « Prix par niveau ».

## 4. Les chiffres (état au 15.11.2026)

Le backtest porte sur un an de données Databento, de novembre 2025 à novembre 2026. Il est compté **de façon prudente** : un ordre n'est considéré comme rempli que si le prix le dépasse d'au moins 1 tick.

| Paire | Trades par an | Gagnants | $/mois brut | $/mois net de commissions | DD de la paire |
|---|---|---|---|---|---|
| 6B | 33 | 91 % | 519 | 501 | 350 |
| 6E | 66 | 62 % | 364 | 329 | 981 |
| 6J | 45 | 71 % | 163 | 139 | 531 |
| 6N | 79 | 68 % | 476 | 434 | 630 |
| 6C | 50 | 78 % | 372 | 345 | 430 |
| ZN | 33 | 76 % | 169 | 161 | 563 |
| ZS | 33 | 64 % | 216 | 193 | 925 |
| ZW | 30 | 83 % | 184 | 164 | 900 |

**Sur un compte entier** (toutes les paires ensemble, avec la limite de 500 $ par jour et celle de 5 contrats) :

- environ **2 070 $/mois** net de commissions (environ 2 250 $ en brut ; ZS sur 1229,50 depuis le 17.11, −31 $/mois) ;
- 359 trades par an, soit environ 7 par semaine ;
- drawdown fin de journée d'environ **1 230 $**, pour une limite de 2 000 $ ;
- pire journée : −500 $ ;
- RR moyen d'environ 1:1 : gain moyen et perte moyenne autour de 185 $, avec environ 75 % de trades gagnants et un profit factor d'environ 3.

**Ce que j'attends en réel : environ 50 à 65 % du backtest**, soit **1 050 à 1 350 $/mois par compte**. Avec 5 comptes copiés, ça fait environ 5 000 à 6 500 $/mois.

L'écart avec le backtest vient de deux choses :
- les niveaux ont été choisis en regardant la même année que celle qui est testée (voir §6) ;
- le prix d'exécution réel est parfois un peu moins bon que prévu (glissement).

## 5. Testé et écarté

On ne refait pas ces tests sans raison nouvelle.

**Entrées**

- **Ordre sur le niveau** : le résultat dépend de ma place dans la file d'attente, de 2 340 à 3 040 $/mois selon les cas, et c'est imprévisible. À 1 tick avant, c'est 2 510 à 2 600 $/mois, quelle que soit la file. À 2 ticks avant, c'est moins bien.
- **Annuler l'ordre** si le prix l'a touché sans le remplir puis est parti : ça n'apporte rien.
- **Entrée sur confirmation** (attendre que le prix reste 10 à 20 min autour du niveau) : c'est moins bien sur 6E et ZW, qui rebondissent tout de suite, et à peine mieux sur 6B et 6J.
- **Entrée en deux fois** (plus bas, ou 2e lot après 10 à 30 min) : moins bien.
- **Écart d'entrée différent pour chaque paire** : rejeté, je veux la même règle partout.

**Sorties**

- Config 90 % de gagnants, config « gros gains », trailing serré, règle en R unique, TP1 atteint dans au moins 80 % des cas : moins bien.
- **TP2 serré** (2 fois le TP1) : ça coûte, jusqu'à 80 $/mois sur 6N. Il doit rester loin.
- **Demi-pips / pips entiers** : la question ne se pose plus depuis qu'on compte en ticks.
- **TP1 de 6B** (10 à 20 ticks, testé le 16.11) : 20 faisait le plus sur l'année (537 $/mois), mais depuis juillet le prix s'arrête souvent à 17–19 ticks. **Passé à 18** : 519 $/mois sur l'année (−18), mieux sur la seconde moitié (+69 $) et depuis juillet (+94 $) ; 17 et en dessous coûtent plus (15 : 421 $/mois). Les trades fermés à 4 h sont surtout des runners après TP1, pas des TP1 ratés.
- **Distance du trailing** (3, 5, 8, 10, 15 ticks, = TP1 ou 1,5 × TP1, testé le 16.11) : trailing = TP1 reste le meilleur au total. Un trailing moyen (10–15 ticks sur 6B) est le pire des deux : il rend une partie du gain sans garder les grosses courses (6B à 10 : 502 $/mois au lieu de 537). Seul 6E à 23 ticks fait mieux sur les deux moitiés de l'année (+61 $/mois, DD 1 025 au lieu de 981) : pas retenu, même règle partout.
- **Stop du runner à l'entrée +1 tick** au lieu de l'entrée (testé le 16.11) : +5 $/mois, dans le bruit, car le trailing passe au-dessus de l'entrée dès 1 tick après TP1. **+2 ticks** : moins bien (2 438 $/mois au lieu de 2 512, surtout ZS et ZN). 1 tick couvre déjà les frais d'un contrat sur toutes les paires.
- **TP1 placé 1 tick avant la VWAP de la séance** quand elle se trouve entre l'entrée et le TP1 (testé le 16.11, VWAP depuis 17h Chicago calculée sur les volumes) : la règle ne joue que sur 20 à 45 trades par an, et elle coûte sur toutes les paires concernées, de −1 à −31 $/mois (−20 à −100 $/mois au total selon l'écart retenu). Le prix traverse la VWAP plus souvent qu'il n'y bute. Pas retenu.
- **La VWAP mensuelle ou annuelle à la place des niveaux** (testé le 16.11, mêmes règles, SL/TP1/TP2 de chaque paire, ordre 1 tick avant, frais déduits ; VWAP mensuelle à partir de décembre 2025, annuelle à partir de 2026) : la mensuelle perd sur 7 paires sur 8, ≈ −560 $/mois au total, avec environ 40 % de gagnants. L'annuelle est à peu près nulle au total (≈ +65 $/mois) ; seuls 6B (+153 $/mois) et 6J (+45) gagnent sur les deux moitiés, sur une dizaine de trades. Pas retenu ; l'annuelle sur 6B est à revoir sur plusieurs années.
- **6B : stop à l'entrée quand le prix touche la VWAP de la séance avec au moins +15 ticks, avant TP1** (testé le 16.11, VWAP depuis 17h Chicago sur les volumes) : elle se déclenche 7 fois sur 33 trades et ne sauve aucune perte. Les 2 seuls SL de l'année ne sont jamais montés au-delà de +7 ticks. Elle coûte −112 $ sur l'année (stop à l'entrée), −94 $ (entrée +1), −69 $ (entrée +2), −244 $ dès +5 ou +10 ticks. Le 11.11, le trade du backtest monte à +13 ticks à 4h32 CT, 2 ticks sous la VWAP, et se ferme à −1 tick au bout des 4 h (6h23 CT) ; le SL n'est touché qu'à 7h51 CT. Pas retenu.
- **Protéger un trade qui n'avance pas, sans VWAP** (testé le 16.11 sur les 8 paires) : stop à l'entrée dès +10, +13 ou +15 ticks avant TP1 ; durée max 3 h ou 2 h au lieu de 4 h ; sortie si le trade n'a pas fait +5 ticks en 1 h ou +10 en 2 h. Presque tout coûte : 6B −17 à −126 $/mois selon la variante, 6N et 6C jusqu'à −150 et −176. Les seuls gains sont de bruit (6E +8 avec le stop à l'entrée à +13, ZW +36 à 2 h, sur 30 trades). Pas retenu : la protection du plan reste la sortie au bout de 4 h.
- **La VWAP calculée en H1** (comme sur le graphique : bougies d'une heure, niveau fixe pendant l'heure ; testé le 16.11) : mêmes résultats qu'en minute. Mensuelle ≈ −520 $/mois au total, annuelle ≈ +80 $/mois ; seuls 6B (+153 $/mois) et 6J (+56) gagnent sur les deux moitiés, sur une dizaine de trades par an.
- **Suivre la tendance de la séance** (testé le 16.11 : prix sous la VWAP de la séance depuis 2, 3 ou 4 clôtures H1, vente au retour sur la VWAP, et l'inverse au-dessus ; mêmes règles, frais déduits) : 13 à 21 trades par mois et par paire, autour de 50 % de gagnants. Perd sur 7 paires sur 8, ≈ −1 800 $/mois au total à 3 h. Les réglages choisis sur la première moitié perdent sur la seconde (≈ −2 700 $/mois au total). Pas retenu.
- **Trois idées de tendance** (testé le 16.11, mêmes règles, frais déduits ; réglages de la paire, puis réglages choisis sur la 1re moitié et jugés sur la 2e) :
  - *Niveau cassé (clôture H1 au-delà), trade du retour dans le sens de la cassure* : ≈ +140 $/mois au total. Positif sur les deux moitiés pour 6E (+109) et ZW (+221) ; négatif sur ZS (−240).
  - *Range de Londres (plus haut/bas de 2h à 3h), trade de la sortie* : perd sur 7 paires sur 8. Seul **6B** gagne sur les deux moitiés (+361 $/mois, 21 trades/mois, 56 %).
  - *Plus haut/bas de la veille* : en rebond, perd presque partout. En cassure puis retour, **ZS (+391 $/mois)** et **ZW (+183)** gagnent sur les deux moitiés, et leurs réglages choisis sur la 1re moitié tiennent sur la 2e ; les devises perdent.
  - *Niveau cassé, variantes* (13 règles testées, une même règle pour toutes les paires : 1 ou 2 clôtures H1, clôture M15, cassure de 1, 5 ou 10 ticks, éloignement de 5 à 30 ticks, validité de la séance à 48 h, ordre avant, sur ou au-delà du niveau) : aucune ne gagne au total (de −19 à −771 $/mois). Une définition un peu différente de la cassure suffit à faire passer le total de +140 à −182 $/mois : le résultat est fragile. ZW gagne dans les 13 variantes et 6B dans 10 ; ZS, 6C et ZN perdent presque toujours.
  - À vérifier avant de les ajouter : 32 combinaisons testées, donc quelques-unes gagnent par hasard ; il faut leur drawdown, leur effet sur le compte avec le plan actuel (1 trade par jour et par paire, 5 contrats), et idéalement plusieurs années.
- **La même VWAP avec des réglages à elle** (testé le 16.11 : SL, TP1, entrée 1 tick avant ou 3 ticks au-delà, filtre « dans le sens de l'annuelle », choisis sur la première moitié de l'année puis jugés sur la seconde) : les réglages qui gagnaient sur la première moitié perdent sur la seconde, sur presque toutes les paires (la mensuelle ≈ −1 100 $/mois au total sur la seconde moitié). Pas d'avantage réel.
- **Les deux lots à TP1, sans runner** (testé le 16.11) : ≈ 2 090 $/mois net au lieu de ≈ 2 315 avec le trailing, même taux de gagnants, drawdown pas plus bas. Le trailing gagne sur 7 paires sur 8 (ZN fait l'inverse, +29 $/mois, pas sur les deux moitiés).

**Filtres**

- **Trader un niveau déjà touché hors horaires**, une fois les ordres reposés (testé le 15.11, à partir de 6J le 02.11) : 140 trades de plus par an, 34 % de gagnants, **−13 460 $ par an**. La règle « déjà touché hors horaires » (§2) les écarte.
- Tendance, jour de la semaine, niveau récemment stoppé, une seule position à la fois : sans intérêt.
- Trader seulement de 7h à 11h, blackout des news à ±30 ou 60 min, pas de trade les jours de news : moins bien.
- Règles « niveau traversé » et « ouverture proche » : moins bien.
- **Grosse bougie d'1 h sur 6E** (≥ 60 pips) : seulement 2 trades par an, j'ai annulé la règle.
- **Approche comptée depuis le point le plus éloigné** et non plus depuis l'ouverture de 17h (testé le 15.11) : une séance qui ouvre près du niveau puis s'en éloigne avant de revenir compterait. Résultat : 100 trades de plus par an, 2 246 $/mois au lieu de 2 513, avec moins de gagnants. Seul 6B fait mieux sur les deux moitiés de l'année (621 au lieu de 537 $/mois) ; 6N, 6J et ZS font nettement moins bien.
- **Distance pour une nouvelle touche** (15, 20, 25, 30, 40 ou 60 ticks, testé le 15.11) : 30 est le meilleur au total (2 513 $/mois, contre 2 483 à 20 et 2 435 à 25) et sur les deux moitiés de l'année. Quelques paires font un peu mieux à une autre valeur, mais jamais sur les deux moitiés de l'année. Au-dessus de 30, c'est nettement moins bien. En pratique, 25 à 30 ticks suffisent.
- **Durée** : 4 h fait mieux que 1 à 3 h, et mieux que 6 h ou sans limite.
- **6E de 2h à 8h seulement** : n'apporte rien. **6J de 9h à 14h en 25/10** : +87 $/mois, refusé pour l'instant.

**Marchés**

- **ES, CL, UB** : le stop permis par la limite de 500 $ est trop petit par rapport à ce qu'ils bougent en une heure.
- **ZC** : 126 $/mois, avec un stop de 500 $ pour un TP1 de 5 ticks. Non retenu.

**Autres stratégies**

- **Cassure puis retour** (le prix casse un plus bas ou un plus haut, puis revient dessus) : la seule version qui tienne est sur ZS, de 10h à 12h, pour environ 350 à 450 $/mois réalistes. **Abandonnée parce que trop compliquée.** Ma règle sur des box de 10 min perd de l'argent.
- **Double bas ou double haut de la journée** (le prix revient sur le plus bas ou le plus haut de la séance, ZS la nuit) : environ 280 $/mois, avec 69 % de gagnants. Ça tient sur les deux moitiés de l'année, mais ce n'est pas assez pour du réel. À tester en simulation au mieux.

## 6. Ce qui reste à vérifier

1. **Les niveaux ont été choisis en regardant la même année que celle qui est testée.** C'est le plus gros biais. Seuls les niveaux ajoutés le 14.11 sur 6E (1,16595) et 6N (0,59635, 0,58855, 0,58515, 0,56795) ont passé un vrai test : trouvés sur novembre–mai, gagnants sur mai–novembre.
2. **ZN est la paire la moins vérifiée.** Le prix a baissé toute l'année, de 113 à 104, donc 30 de ses 33 trades tombent de mai à novembre, sur les mêmes mois qui ont servi à choisir les niveaux. **109'125 perd de l'argent** (−219 $ sur 7 trades) : à retirer ou à surveiller. L'idéal serait de refaire ses niveaux sur 2 à 3 ans d'historique.
3. **Test en conditions réelles** : 1 à 2 mois sur 1 compte (de préférence un 100k à 2 lots, pour avoir de la marge), avec les niveaux tracés à l'avance. Je note chaque trade, y compris les ordres non remplis, et je compare au backtest. Je ne passe à plusieurs comptes que si le réel ressemble au backtest.
4. **Chaque mois** : télécharger le mois écoulé, relancer l'analyse et vérifier que les niveaux tiennent toujours. Ajouter des niveaux quand le prix sort des anciens.
5. **Règle de sécurité** sur un 50k : passer à 1 lot après un recul de 1 000 $ par rapport au plus haut. Pas encore testée.
6. **Nouveaux marchés à tester** : LE (bétail), puis ZL (huile de soja), puis FGBL (Bund, si LMI l'autorise ; il faut les données Eurex). Également les plus hauts et plus bas de la veille comme niveaux automatiques.
7. **Comptes 100k et 150k** : il me faut les règles de LMI (drawdown, limite par jour, contrats, prix) pour calculer s'il vaut mieux passer à 3 lots.
8. **Question restée ouverte** : est-ce que mes zones sont des bandes plutôt que des prix exacts ?

## 7. Journal

- **13.11.2026** :
  - le backtest passe sur le Mac ;
  - même règle pour toutes les paires ;
  - blackout de ±10 min sur chaque news 3 étoiles ;
  - règle des 15 ticks d'approche ;
  - 6B seulement de 2h à 8h ;
  - ZS réintégré, de 8h à 14h, ordre au-delà du niveau.
- **14.11.2026** :
  - niveaux ajustés sur les tournants de l'année ;
  - 6B 1,3552 et ZW 685 retirés ;
  - 6C et ZN ajoutés ;
  - limite personnelle de 500 $ par jour ;
  - test de la stratégie cassure puis retour, puis abandon.
- **15.11.2026** :
  - toutes les distances en ticks ;
  - prix par niveau affichés dans chaque paire ;
  - TP2 pour le runner ;
  - **ordre 1 tick avant le niveau** et backtest compté de façon prudente ;
  - commissions et partage des gains LMI dans le rapport ;
  - ZN affiché au format CME (107'015) ;
  - règle « déjà touché hors horaires » écrite : le backtest l'appliquait déjà sans le dire ;
  - distance de nouvelle touche et approche depuis le point le plus éloigné testées : on garde 30 ticks et l'approche depuis 17h.
- **16.11.2026** :
  - distance du trailing, stop du runner à +1 ou +2 ticks, et tout à TP1 testés : on garde trailing = TP1, stop à l'entrée ;
  - journal : sous « Support / Resistance Yearly » (ex-Jahreswiderstand), un trade a sa zone, son SL, TP1 et TP2 proposés par le plan, et son résultat (SL, TP1, TP1 + trailing stop, TP2) ; le formulaire ne montre que les prix de ce résultat, et le prix de sortie du trailing.
  - TP1 avant la VWAP de la séance testé : ça coûte, pas retenu.
  - VWAP mensuelle et annuelle comme niveaux testées : la mensuelle perd, l'annuelle est nulle, pas retenu.
  - 6B : TP1 (et trailing) de 20 à 18 ticks.
  - 6B, stop à l'entrée quand la VWAP est touchée à +15 ticks testé : ne sauve aucune perte, coûte ≈ −10 $/mois, pas retenu.
  - Stratégie de tendance (retour sur la VWAP de la séance après 2 à 4 h du même côté) testée : elle perd, pas retenue.
  - Trois idées de tendance testées (niveau cassé, range de Londres, plus haut/bas de la veille) : quatre pistes à vérifier — 6B range de Londres, ZS et ZW cassure-retour sur la veille, 6E et ZW retour sur niveau cassé.
