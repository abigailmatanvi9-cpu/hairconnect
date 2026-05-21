-- Supprime les doublons éventuels (garde la candidature la plus ancienne par couple offre / coiffeur).
DELETE FROM "Candidature" a
USING "Candidature" b
WHERE a."offerId" = b."offerId"
  AND a."coiffeurUid" = b."coiffeurUid"
  AND a."createdAt" > b."createdAt";

CREATE UNIQUE INDEX IF NOT EXISTS "Candidature_offerId_coiffeurUid_key"
  ON "Candidature"("offerId", "coiffeurUid");
