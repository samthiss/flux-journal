-- Brings the production checklist up to the one in prisma/checklistSeed.mjs.
--
-- The seed only fills the table when it is empty (prisma/seed.ts), and
-- production was never empty: it still held the nine English placeholders from
-- the very first deploy, so the real pre-market routine never landed there.
-- A migration is the right shape for this — it runs once, is recorded, and
-- cannot be replayed by a restart the way a seed can.
--
-- Written to be a no-op wherever the routine is already in place: every insert
-- is guarded on its own label, so running this against a database that already
-- has the 31 items changes nothing.

-- The placeholders. They exist in no other database, and nothing the app wrote
-- shares these group names.
DELETE FROM "ChecklistItem" WHERE "group" IN ('Market Context', 'Technical Setup', 'Risk & Mindset');


-- 1) Passé du marché (CP, 1 mois)
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed00', '1) Passé du marché (CP, 1 mois)', 'Comment le marché a-t-il évolué ? (Tendance / Range) – à noter dans le Cluster Profile', 0
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Comment le marché a-t-il évolué ? (Tendance / Range) – à noter dans le Cluster Profile');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed01', '1) Passé du marché (CP, 1 mois)', 'Où se situent les grandes zones de volume dans le P-Histogramme ? – à noter dans le Cluster Profile', 1
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Où se situent les grandes zones de volume dans le P-Histogramme ? – à noter dans le Cluster Profile');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed02', '1) Passé du marché (CP, 1 mois)', 'Où se situent les zones de retournement dans la vue d''ensemble (baisse de volume dans le P-Histogramme) ? – à noter dans le Cluster Profile', 2
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Où se situent les zones de retournement dans la vue d''ensemble (baisse de volume dans le P-Histogramme) ? – à noter dans le Cluster Profile');

-- 2) Passé du marché (CP, 1 semaine)
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed03', '2) Passé du marché (CP, 1 semaine)', 'À quoi ressemble l''image des derniers jours ? (Tendance / Range) – à noter dans le Cluster Profile', 3
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'À quoi ressemble l''image des derniers jours ? (Tendance / Range) – à noter dans le Cluster Profile');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed04', '2) Passé du marché (CP, 1 semaine)', 'Cette image correspond-elle à la vue d''ensemble (1 mois / 1 an) ?', 4
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Cette image correspond-elle à la vue d''ensemble (1 mois / 1 an) ?');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed05', '2) Passé du marché (CP, 1 semaine)', 'Quelles grandes zones de volume restent pertinentes maintenant ? – à noter dans le Cluster Profile', 5
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Quelles grandes zones de volume restent pertinentes maintenant ? – à noter dans le Cluster Profile');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed06', '2) Passé du marché (CP, 1 semaine)', 'Marquer les clusters horaires des derniers jours – lesquels influencent l''évolution du cours ?', 6
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Marquer les clusters horaires des derniers jours – lesquels influencent l''évolution du cours ?');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed07', '2) Passé du marché (CP, 1 semaine)', 'Marquer les éventuelles zones de retournement des derniers jours', 7
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Marquer les éventuelles zones de retournement des derniers jours');

-- 3) Aujourd'hui : trouver une idée de trade (CP, RC)
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed08', '3) Aujourd''hui : trouver une idée de trade (CP, RC)', 'Où est le cours actuellement ?', 8
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Où est le cours actuellement ?');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed09', '3) Aujourd''hui : trouver une idée de trade (CP, RC)', 'Définir les objectifs de cours possibles – à dessiner sur le graphique', 9
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Définir les objectifs de cours possibles – à dessiner sur le graphique');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed10', '3) Aujourd''hui : trouver une idée de trade (CP, RC)', 'Définir l''objectif global (où le marché pourrait-il encore aller avant)', 10
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Définir l''objectif global (où le marché pourrait-il encore aller avant)');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed11', '3) Aujourd''hui : trouver une idée de trade (CP, RC)', 'Définir les barrières / points de retournement possibles', 11
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Définir les barrières / points de retournement possibles');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed12', '3) Aujourd''hui : trouver une idée de trade (CP, RC)', 'Définir mes zones d''entrée possibles – à dessiner sur le graphique', 12
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Définir mes zones d''entrée possibles – à dessiner sur le graphique');

-- 4b) Quelle stratégie puis-je trader aujourd'hui et où ?
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed13', '4b) Quelle stratégie puis-je trader aujourd''hui et où ?', 'Trend Run (TR) : le marché évolue fortement dans une direction (short ou long) – le marché est DANS la Value Area de la session', 13
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Trend Run (TR) : le marché évolue fortement dans une direction (short ou long) – le marché est DANS la Value Area de la session');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed14', '4b) Quelle stratégie puis-je trader aujourd''hui et où ?', 'Backtest Reverse (BR) : le marché pourrait changer de direction (short ou long) – le marché est EN DEHORS de la Value Area de la session', 14
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Backtest Reverse (BR) : le marché pourrait changer de direction (short ou long) – le marché est EN DEHORS de la Value Area de la session');

-- 4) Vérifier les news – quand ne puis-je pas trader ?
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed15', '4) Vérifier les news – quand ne puis-je pas trader ?', 'Vérifier le calendrier économique pour les news à fort impact', 15
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Vérifier le calendrier économique pour les news à fort impact');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed16', '4) Vérifier les news – quand ne puis-je pas trader ?', 'Prévoir des pauses de trading autour des horaires de news', 16
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Prévoir des pauses de trading autour des horaires de news');

-- 5) MINDEST – Attendre son entrée
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed17', '5) MINDEST – Attendre son entrée', 'Le marché est dans une zone d''entrée définie', 17
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Le marché est dans une zone d''entrée définie');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed18', '5) MINDEST – Attendre son entrée', 'Le marché ne casse pas le cluster et la règle des 3 minutes est respectée', 18
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Le marché ne casse pas le cluster et la règle des 3 minutes est respectée');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed19', '5) MINDEST – Attendre son entrée', 'Pas de nouveau plan pour aujourd''hui si aucune entrée selon le plan n''est trouvée', 19
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Pas de nouveau plan pour aujourd''hui si aucune entrée selon le plan n''est trouvée');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed20', '5) MINDEST – Attendre son entrée', 'Ne pas définir de nouvelles zones d''entrée', 20
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Ne pas définir de nouvelles zones d''entrée');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed21', '5) MINDEST – Attendre son entrée', 'Ne pas modifier les réglages de cluster (sauf selon les règles)', 21
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Ne pas modifier les réglages de cluster (sauf selon les règles)');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed22', '5) MINDEST – Attendre son entrée', 'Ne pas entrer sans cluster', 22
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Ne pas entrer sans cluster');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed23', '5) MINDEST – Attendre son entrée', 'Ne pas rester plus longtemps sur le marché / trader à des horaires inhabituels', 23
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Ne pas rester plus longtemps sur le marché / trader à des horaires inhabituels');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed24', '5) MINDEST – Attendre son entrée', 'Ne pas ouvrir un autre marché', 24
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Ne pas ouvrir un autre marché');

-- Bilan
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed25', 'Bilan', 'Comment était mon entrée ?', 25
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Comment était mon entrée ?');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed26', 'Bilan', 'Ai-je respecté mon plan ?', 26
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Ai-je respecté mon plan ?');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed27', 'Bilan', 'Identifier les points à prendre en compte la prochaine fois lors de l''élaboration du plan', 27
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Identifier les points à prendre en compte la prochaine fois lors de l''élaboration du plan');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed28', 'Bilan', 'Si le plan n''a pas été respecté : POURQUOI ? (définir et noter le ressenti)', 28
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Si le plan n''a pas été respecté : POURQUOI ? (définir et noter le ressenti)');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed29', 'Bilan', 'Si le plan n''a pas été respecté : QUOI EXACTEMENT n''a pas été fait selon le plan ? (noter)', 29
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Si le plan n''a pas été respecté : QUOI EXACTEMENT n''a pas été fait selon le plan ? (noter)');
INSERT INTO "ChecklistItem" ("id", "group", "label", "order")
SELECT 'chkseed30', 'Bilan', 'Comment puis-je changer ce comportement ? (noter)', 30
WHERE NOT EXISTS (SELECT 1 FROM "ChecklistItem" WHERE "label" = 'Comment puis-je changer ce comportement ? (noter)');
