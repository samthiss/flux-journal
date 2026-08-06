type SeedExample = { tag: string; title: string; caption: string };

type SeedNote = {
  key: string;
  title: string;
  objectif?: string;
  theorie?: string[];
  reglesLabel?: string;
  regles?: string[];
  retenir?: string[];
  exemples?: SeedExample[];
  children?: SeedNote[];
};

export const NOTES_SEED: SeedNote[] = [
  {
    key: "plan",
    title: "Trading plan",
    objectif:
      "Le cadre de lecture du marché avant toute stratégie : préparer le terrain pour savoir où et pourquoi agir.",
    theorie: [
      "Le trading plan regroupe tout ce que je regarde avant de chercher un trade : les zones importantes, la tendance, et l'intention du marché. C'est la base commune à toutes mes stratégies.",
      "Bien préparé, il transforme des décisions floues en décisions mécaniques : je sais à l'avance quelles zones comptent et dans quel sens je veux trader.",
    ],
    retenir: ["Le plan se prépare à froid, avant l'ouverture.", "Aucune stratégie ne s'exécute sans ce cadre validé."],
    children: [
      {
        key: "plan-volumes",
        title: "Tracer zones de volumes",
        theorie: [
          "Les zones de volumes montrent où le marché a le plus échangé. Ce sont des aimants et des points de réaction : le prix y ralentit, y rebondit ou les traverse avec force.",
          "Je les trace en début de séance pour préparer mes niveaux, sans les redéfinir en cours de route.",
        ],
        retenir: ["Fort volume = zone de décision.", "Tracer avant, pas pendant le trade."],
      },
      {
        key: "plan-interet",
        title: "Placer zone d'intérêt",
        theorie: [
          "Une zone d'intérêt est un niveau où l'offre et la demande se sont déjà affrontées : ancien support/résistance, cassure retestée. J'y attends une réaction du prix.",
          "Je ne garde que les zones alignées avec la tendance — les autres ne sont pas des opportunités mais du bruit.",
        ],
        retenir: ["Laisser le prix venir à la zone.", "Une zone n'est valable que dans le sens de la tendance."],
      },
      {
        key: "plan-tendances",
        title: "Tendances",
        theorie: [
          "La tendance se lit avec la succession des sommets et des creux. Ascendants = haussier, descendants = baissier, ni l'un ni l'autre = range.",
          "Je définis la tendance sur l'unité de temps supérieure, puis je ne cherche des entrées que dans ce sens.",
        ],
        retenir: ["La tendance se définit sur l'UT supérieure.", "Jamais trader contre la structure."],
      },
      {
        key: "plan-direction",
        title: "Définir où va le marché",
        theorie: [
          "Avant chaque décision : « où veut aller le marché ? ». Vers la prochaine zone de liquidité ? Vers un plus-haut à balayer ? Cette question oriente tout le reste.",
          "Il ne s'agit pas de prédire mais de formuler un scénario clair, et son invalidation.",
        ],
        retenir: ["Toujours un scénario + son point d'invalidation.", "Lire l'intention, pas deviner le futur."],
      },
    ],
  },
  {
    key: "strategies",
    title: "Stratégies",
    objectif: "Mes systèmes d'exécution. Chacun est documenté avec sa logique et une archive de trades valides / invalides.",
    theorie: [
      "Deux stratégies actives : Backtest reverse (retournement) et Trend run (suivi de tendance). Ouvre chacune pour voir sa logique et ses exemples classés.",
    ],
    retenir: ["Une même logique, répétée proprement.", "Chaque trade est archivé : valide ou invalide."],
    children: [
      {
        key: "backtest",
        title: "Backtest reverse",
        objectif: "Jouer un retournement après un balayage de liquidité, contre le mouvement, avec confirmation.",
        theorie: [
          "Le marché va souvent chercher la liquidité au-delà d'un extrême avant de se retourner. Backtest reverse attend ce balayage puis un rejet net pour entrer dans le sens du retournement.",
          "C'est une stratégie de précision : sans confirmation claire, il n'y a pas de trade.",
        ],
        reglesLabel: "Conditions d'entrée",
        regles: [
          "Balayage confirmé d'un plus-haut / plus-bas.",
          "Rejet net (mèche + volume) dans la zone.",
          "Stop au-delà du balayage, TP à la zone opposée.",
        ],
        retenir: ["Le balayage précède le retournement.", "Pas de rejet = pas d'entrée."],
        children: [
          {
            key: "backtest-valid",
            title: "Trades valides",
            objectif: "Les trades où toutes les conditions étaient réunies — la référence de ce à quoi doit ressembler un bon setup.",
            retenir: ["Tout trade valide coche les 3 conditions.", "Bien noté, il devient un modèle à reconnaître."],
            exemples: [
              { tag: "VALIDE", title: "Balayage + rejet — GBP/USD", caption: "Liquidité prise au-dessus du plus-haut, rejet net, entrée au retour en zone. R:R 1:2.3." },
              { tag: "VALIDE", title: "Retournement propre — DAX", caption: "Balayage du plus-bas, mèche de rejet marquée, TP atteint à la zone opposée." },
            ],
          },
          {
            key: "backtest-invalid",
            title: "Trades invalides",
            objectif: "Les entrées prises sans que toutes les conditions soient réunies — à analyser pour ne pas répéter.",
            retenir: ["Une entrée sans une condition = trade invalide, même s'il gagne.", "L'erreur d'exécution compte plus que le résultat."],
            exemples: [
              { tag: "INVALIDE", title: "Entrée sans balayage — EUR/USD", caption: "Entrée anticipée avant la prise de liquidité : le prix a continué, stop touché." },
              { tag: "INVALIDE", title: "Rejet trop faible — US30", caption: "Pas de vrai rejet dans la zone, entrée « au feeling ». Setup non conforme." },
            ],
          },
        ],
      },
      {
        key: "trendrun",
        title: "Trend run",
        objectif: "Suivre une tendance établie en entrant sur les pullbacks vers une zone d'intérêt.",
        theorie: [
          "Une fois la tendance confirmée, Trend run attend un retracement vers une zone dans le sens du marché, puis un signal de confirmation pour entrer.",
          "C'est la stratégie la plus fiable du plan : on ne fait que suivre la force déjà en place.",
        ],
        reglesLabel: "Conditions d'entrée",
        regles: [
          "Tendance claire confirmée sur l'UT supérieure.",
          "Pullback vers une zone d'intérêt.",
          "Confirmation d'entrée, puis stop suiveur.",
        ],
        retenir: ["On suit la tendance, on ne l'anticipe pas.", "Laisser courir avec un stop suiveur."],
        children: [
          {
            key: "trendrun-valid",
            title: "Trades valides",
            objectif: "Les trades qui ont suivi la tendance proprement, de l'entrée en pullback à la sortie sur cassure.",
            retenir: ["Les meilleurs trades sont ceux qu'on laisse respirer.", "La sortie suit la structure."],
            exemples: [
              { tag: "VALIDE", title: "Pullback + reprise — EUR/USD", caption: "Tendance haussière, retour en zone, confirmation M15, laissé courir. R:R 1:2.8." },
              { tag: "VALIDE", title: "Continuation — NASDAQ", caption: "Pullback tenu, nouveaux plus-hauts, stop remonté sous chaque creux." },
            ],
          },
          {
            key: "trendrun-invalid",
            title: "Trades invalides",
            objectif: "Les entrées prises hors des conditions — souvent un range pris pour une tendance.",
            retenir: ["Un range n'est pas une tendance.", "Sans pullback, pas d'entrée Trend run."],
            exemples: [
              { tag: "INVALIDE", title: "Range pris pour tendance — GBP/JPY", caption: "Pas de vraie structure directionnelle : entrée dans du bruit, stop touché." },
              { tag: "INVALIDE", title: "Entrée sans pullback — DAX", caption: "Poursuite du prix sans attendre le retracement. Timing d'entrée mauvais." },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "risk",
    title: "Risk management",
    objectif: "Protéger le capital avant de penser au gain — la condition de survie qui rend le reste possible.",
    theorie: [
      "Je risque un pourcentage fixe et faible par trade, avec un stop placé au point d'invalidation du scénario. Aucune perte isolée ne peut faire mal.",
      "Certaines situations demandent une prudence renforcée : marché volatile, nouvelle zone, obstacles à l'exécution. Ces cas sont documentés ci-dessous.",
    ],
    reglesLabel: "Règles fixes",
    regles: [
      "Maximum 1% du capital risqué par trade.",
      "Stop au point d'invalidation, jamais arbitraire.",
      "Ratio risque/récompense d'au moins 1:2.",
    ],
    retenir: ["La taille de position découle du stop.", "Survivre d'abord, performer ensuite."],
    children: [
      {
        key: "risk-volatile",
        title: "Marché volatile",
        theorie: [
          "En forte volatilité (news, ouvertures), les mouvements sont amples et les stops facilement balayés. Je réduis la taille de position ou je m'écarte totalement.",
          "L'objectif n'est pas de tout jouer, mais de ne trader que quand mon avantage tient.",
        ],
        reglesLabel: "Ce que je fais",
        regles: [
          "Réduire la taille de position (ou ne pas trader).",
          "Éviter les fenêtres de news à fort impact.",
          "Élargir le stop seulement si le R:R reste valable.",
        ],
        retenir: ["Volatilité = danger, pas opportunité par défaut.", "Ne pas trader est une décision valable."],
      },
      {
        key: "risk-cluster",
        title: "Nouveau cluster",
        theorie: [
          "Un nouveau cluster de zones ou d'ordres change la carte du marché. Avant de trader autour, je le laisse se confirmer plutôt que de réagir au premier signal.",
          "Je note comment le prix réagit à ce nouveau niveau pour l'intégrer proprement à mes zones.",
        ],
        retenir: ["Laisser un nouveau niveau se confirmer.", "Observer avant d'exécuter autour."],
      },
      {
        key: "risk-obstacles",
        title: "Obstacles",
        theorie: [
          "Les obstacles sont ce qui peut gâcher un bon setup : niveau majeur juste devant le TP, session peu liquide, spread élevé, événement à venir.",
          "Je les vérifie avant d'entrer : un bon signal avec un obstacle sur le chemin devient un trade médiocre.",
        ],
        reglesLabel: "À vérifier avant d'entrer",
        regles: [
          "Une zone majeure bloque-t-elle le chemin vers le TP ?",
          "La session est-elle assez liquide ?",
          "Un événement à fort impact approche-t-il ?",
        ],
        retenir: ["Vérifier le chemin jusqu'au TP, pas seulement l'entrée.", "Un obstacle transforme un bon signal en trade médiocre."],
      },
    ],
  },
];
