/** Why each pair takes orders when it does: what its backtest found. */
export const HOURS_WHY: Record<string, string> = {
  "6B": "La livre tient ses niveaux pendant Londres ; New York les lui fait traverser.",
  "6E": "L'euro respecte ses niveaux toute la journée.",
  "6J": "L'ouverture de Londres secoue le yen sa première heure.",
  "6N": "Ouverture de Londres, puis chiffres US de 7h30 et ouverture américaine.",
  "6C": "Aucune heure ne fait mieux sans elle.",
  ZN: "Le T-Note est calme, 5 à 10 ticks l'heure.",
  ZS: "La nuit des grains est trop mince : seule la séance du jour compte.",
  ZW: "La réouverture des grains à 8h30 est trop brutale.",
};
