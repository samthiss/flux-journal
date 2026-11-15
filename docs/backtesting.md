# Backtesting — plan, chiffres et ce qu'on a appris

Ce fichier contient le plan de trading en vigueur, les chiffres qui le justifient et la liste de ce qui a été testé puis écarté. Il est mis à jour à chaque changement du plan.

- Le backtest se lance sur le Mac avec `npx tsx scripts/databento-analyse.ts`.
- La table `PAIRS` de ce script contient les niveaux et les réglages de chaque paire ; c'est elle qui fait foi.
- Les résultats vont dans `prisma/databento-results.json`, que l'appli charge au démarrage.

Toutes les distances sont en **ticks** : 1 tick = une ligne du DOM, comme sur VolFix. Les heures sont en heure de **Chicago** ; en Suisse, c'est +7 h (+6 h entre fin octobre et début novembre).

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

- **Horaires** : ordres de **2h à 14h** (9h à 21h en Suisse), sauf les heures exclues de chaque paire (voir §3).
- **News** : pas d'ordre de **10 min avant à 10 min après** chaque news 3 étoiles des devises de la paire.
- **Approche** : je n'entre sur un niveau que si le prix a fait **au moins 15 ticks vers lui** depuis l'ouverture de 17h. Un niveau traversé pendant la séance ne se trade donc plus dans l'autre sens.

**Entrer**

- **Sens** : achat quand le prix descend sur le niveau, vente quand il monte dessus.
- **Ordre** : ordre limite **1 tick avant le niveau** (pour ZS : 7 ticks au-delà), 2 lots, avec le SL attaché à l'ordre. À 1 tick avant, l'ordre est rempli dès que le prix touche le niveau, quelle que soit ma place dans la file d'attente.
- **Un trade par jour et par paire** : je pose un ordre par niveau valable. Dès que l'un d'eux est rempli, j'annule les autres ordres de cette paire pour la journée. Les autres paires gardent leurs ordres.
- **Nouvelle touche** : un niveau déjà touché ne compte de nouveau que si le prix s'en éloigne de **30 ticks**, puis revient dessus.

**Gérer le trade**

- **TP1** : je sors 1 lot au TP1 et je remonte le stop au prix d'entrée.
- **Runner** : l'autre lot suit un trailing qui démarre au TP1, à une distance égale au TP1. Il sort au **TP2** si le prix l'atteint.
- **Durée** : **4 h** au maximum en position.

## 3. Les paires

| Paire | Niveaux | SL | TP1 = trailing | TP2 | Ordres | Risque (2 lots) |
|---|---|---|---|---|---|---|
| 6B | 1,3186 · 1,3316 · 1,3477 · 1,3651 | 25 | 20 | 75 | 2h–8h seulement | 312 $ |
| 6E | 1,1187 · 1,15065 · 1,1591 · 1,16595 · 1,18435 | 12 | 15 | 60 | 2h–14h | 150 $ |
| 6J | 0,006286 · 0,0063545 · 0,006429 · 0,006555 | 15 | 10 | 40 | 3h–14h | 187 $ |
| 6N | 0,60785 · 0,59635 · 0,5930 · 0,58855 · 0,58515 · 0,57865 · 0,56795 · 0,5596 | 25 | 20 | 130 | 3h–7h, 9h–14h | 250 $ |
| 6C | 0,7078 · 0,70965 · 0,71235 · 0,71705 · 0,7196 · 0,7269 · 0,72935 | 25 | 20 | 55 | 2h–14h | 250 $ |
| ZN | 104'065 · 104'245 · 105'275 · 106'120 · 108'265 · 109'125 · 109'275 · 112'000 | 12 | 5 | 30 | 2h–14h | 375 $ |
| ZS | 1153,75 · 1174,75 · 1229,75 · 1293,50 | 12 | 10 | 45 | 8h–14h seulement | 300 $ |
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
| 6B | 33 | 91 % | 537 | 519 | 350 |
| 6E | 66 | 62 % | 364 | 329 | 981 |
| 6J | 45 | 71 % | 163 | 139 | 531 |
| 6N | 79 | 68 % | 476 | 434 | 630 |
| 6C | 50 | 78 % | 372 | 345 | 430 |
| ZN | 33 | 76 % | 169 | 161 | 563 |
| ZS | 33 | 67 % | 247 | 224 | 925 |
| ZW | 30 | 83 % | 184 | 164 | 900 |

**Sur un compte entier** (toutes les paires ensemble, avec la limite de 500 $ par jour et celle de 5 contrats) :

- environ **2 100 $/mois** net de commissions (2 283 $ en brut) ;
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

**Filtres**

- Tendance, jour de la semaine, niveau récemment stoppé, une seule position à la fois : sans intérêt.
- Trader seulement de 7h à 11h, blackout des news à ±30 ou 60 min, pas de trade les jours de news : moins bien.
- Règles « niveau traversé » et « ouverture proche » : moins bien.
- **Grosse bougie d'1 h sur 6E** (≥ 60 pips) : seulement 2 trades par an, j'ai annulé la règle.
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
  - ZN affiché au format CME (107'015).
