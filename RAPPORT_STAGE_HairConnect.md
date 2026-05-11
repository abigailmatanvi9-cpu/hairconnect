# Rapport de projet — HairConnect  
**Projet de fin de parcours — Licence** · *Document synthétique (une page)*

---

## Contexte et problématique

Dans le secteur de la **coiffure et de la beauté**, les acteurs ont plusieurs besoins numériques complémentaires : **trouver un professionnel ou un salon** pour une prestation, **recruter ou postuler** (offres d’emploi), et **échanger produits ou contenus** dans un cadre dédié à la filière. Les outils généralistes ne couvrent pas toujours ces usages ensemble ni les **spécialités métiers** (barbier, tresseuse, coloriste, etc.).

Le projet **HairConnect** est une **application web** qui regroupe ces volets : **annuaire de professionnels**, **espace emploi** (offres, candidatures), **marketplace** (catalogue produits, commandes simulées), **fil social / publications**, ainsi que messagerie, avis et rendez-vous selon les modules développés — le tout articulé autour d’une API REST et d’une base PostgreSQL.

---

## Objectifs

- **Mise en relation « prestation » :** permettre aux pros de déclarer leurs **types d’activité** et aux utilisateurs de **filtrer l’annuaire** par ces types (sélection sur la page Annuaire, mémorisée localement).
- **Emploi :** permettre aux **salons** de **publier des offres** (titre, ville, type de contrat, description) et aux candidats d’accéder au flux d’offres avec recherche et filtres (temps plein / partiel / CDD).
- **Marketplace :** permettre la **vente de produits** entre utilisateurs via un catalogue, des **commandes** stockées en base (statuts, annulation), avec commission simulée côté métier.
- **Socle technique :** stack **Node.js / Express / Prisma / PostgreSQL**, interface **HTML/CSS/JS**, documentation et évolutivité pour un livrable de licence.

---

## Travail réalisé (synthèse)

**Données et persistance :** modèle utilisateurs multi-rôles (Client, Coiffeur, Salon) ; champs **métiers** au format JSON (`proMetiers`, filtrage annuaire) ; modèles **offres d’emploi**, **candidatures**, **marketplace** (produits, commandes), **publications** (fichier ou base selon implémentation) ; géolocalisation optionnelle pour la proximité.

**Serveur :** API sécurisée (hash **bcrypt**), routes **utilisateurs**, **offres**, **marketplace** (`/api/marketplace/products`, commandes, statuts), **publications** ; paramètre **`forClientMetiers`** pour le filtre annuaire ; évolution du besoin métier (anciennes notions genre / clientèle vers **filtre par types d’activité**).

**Client web :** pages dédiées — notamment **`recherche.html`** (annuaire + cases « types de professionnels »), **`offres.html`** (liste, onglets contrat, publication réservée au rôle salon), **`postuler.html`** / **`candidatures.html`** selon le parcours emploi ; module **`firebase.js`** comme client HTTP vers l’API ; session **localStorage** ; charte UI « beauté » (connexion, tableau de bord).

---

## Environnement technique

| Élément | Choix |
|--------|--------|
| Langage serveur | JavaScript (Node.js) |
| Framework HTTP | Express |
| Base de données | PostgreSQL |
| ORM | Prisma |
| Client front | HTML5, CSS3, JS (modules ES), Fetch API |
| Outils | npm, Prisma CLI (`db push`, `generate`) |

---

## Résultats et limites

**Résultats :** plateforme **multi-volets** (annuaire filtré, emploi, marketplace, publications) cohérente avec une même couche API ; règle métier **types d’activité** explicitée pour l’annuaire.

**Limites / poursuites :** paiements **réels** et connecteurs **Flooz / Mix** encore **simulés** ; déploiement cloud et tests automatisés à renforcer ; synchronisation des préférences annuaire entre appareils ; enrichissement du cycle **emploi** (notifications, messagerie RH).

---

## Conclusion

Ce projet de fin de licence illustre la **conception d’un produit numérique sectoriel** couvrant plus que la seule recherche de professionnels : **emploi**, **commerce de proximité** (marketplace) et **relation client** s’appuient sur une architecture commune. HairConnect démontre une maîtrise du **full-stack léger**, de la **modélisation métier** et de la **rédaction technique**, et constitue une base évolutive pour la filière coiffure-beauté.

---

*Nom de l’étudiant(e) : __________________ · Encadrant(e) : __________________ · Année universitaire : __________________*
