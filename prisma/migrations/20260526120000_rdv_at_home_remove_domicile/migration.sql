-- Rendez-vous : lieu (à domicile ou au salon)
ALTER TABLE "RendezVous" ADD COLUMN IF NOT EXISTS "atHome" BOOLEAN NOT NULL DEFAULT false;

-- Suppression de l'ancien module « demande à domicile »
DROP TABLE IF EXISTS "DemandeDomicile";

-- Champ profil pro obsolète (remplacé par atHome sur chaque RDV)
ALTER TABLE "User" DROP COLUMN IF EXISTS "homeVisit";
