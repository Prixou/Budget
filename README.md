# Pécule : budget personnel

Application web complète pour gérer son budget : suivi des dépenses et des revenus, budgets par catégorie, comptes, opérations récurrentes, objectifs d'épargne, crédits, rapports et simulateurs financiers.

- **Aucune dépendance** : HTML, CSS et JavaScript natifs (modules ES). Pas de compilation.
- **Vos données restent chez vous** : tout est enregistré dans le navigateur (IndexedDB), rien n'est envoyé sur un serveur.
- **En couple et en famille** : partage des dépenses communes, équilibre entre vous deux, et plan pour l'arrivée d'un bébé ou de jumeaux (congés, aides de la CAF, garde, achats).
- **Des conseils chiffrés** : score de santé financière, abonnements oubliés, argent qui dort, prévision de trésorerie, stratégies de remboursement. Ils s'appuient sur les taux et règles en vigueur en France en 2026 (voir [docs/RECHERCHE.md](docs/RECHERCHE.md)).
- **Hors ligne et installable** : application web progressive (PWA), utilisable sur ordinateur et sur mobile.
- **En français**, avec les usages français : montants au format `1 234,56 €`, relevés bancaires CSV avec `;`, taux d'endettement de 35 %, pointage des opérations.

À la première ouverture, un jeu de **données d'exemple** (8 mois d'historique d'un couple qui attend un bébé) est chargé pour découvrir l'application. Le bouton « Créer mon budget (3 min) » lance l'**assistant de démarrage** :

1. **Votre foyer** : seul ou à deux, prénoms, revenus, jour de paie.
2. **Vos comptes** : compte courant ou joint, comptes personnels, livret, titres-restaurant.
3. **Charges fixes** : loyer, énergie, internet, assurances… et l'épargne automatique.
4. **Budgets** : une proposition par poste, calculée sur ce qui reste après les charges fixes, à ajuster.

L'assistant crée les comptes, les revenus et prélèvements récurrents et les budgets. Le tableau de bord affiche ensuite les étapes restantes (« Pour bien démarrer ») avec un bouton pour chacune.

## Fonctionnalités

| Rubrique | Ce qu'elle permet |
|---|---|
| **Tableau de bord** | Solde total, prévision de fin de mois, revenus / dépenses / reste à vivre (épargne versée déduite) / taux d'épargne du mois avec comparaison au mois précédent, alertes (budget dépassé, compte à découvert), graphique sur 6 mois, dépenses par catégorie, rythme des dépenses (moyenne par jour, projection), budgets, échéances à venir, dernières opérations, objectifs. |
| **Opérations** | Dépenses, revenus et virements entre comptes. Saisie rapide : montant, puis un clic sur l'une des catégories les plus utilisées (étiquettes, notes et répétition sont repliées dans « Plus d'options »). Paiement partagé entre titres-restaurant et carte bancaire. **Import par capture d'écran** de l'application de votre banque (lue sur l'appareil) ou par relevé CSV. Recherche (sans tenir compte des accents), filtres (période, type, compte, catégorie, pointage, étiquette), tri, sélection multiple (pointer, changer de catégorie, supprimer), duplication, étiquettes, notes. Le libellé mémorise la catégorie utilisée la dernière fois. Import d'un relevé CSV et export CSV. |
| **Budgets** | Plafond mensuel par catégorie, valable tous les mois ou pour un seul mois, avec **report du reste** (ou du dépassement) sur le mois suivant. États « dans le budget », « bientôt atteint » (seuil réglable), « consommé », « dépassé ». Suggestions calculées d'après vos 3 derniers mois. Montant des revenus restant à affecter. |
| **Comptes** | Compte courant, épargne (Livret A, LDDS, LEP, PEL… avec taux, intérêts estimés et plafond), espèces, carte de crédit, investissement, **titres-restaurant, CESU, chèques-vacances ou cadeaux** (crédit mensuel automatique, part de l'employeur, plafond de 25 € par jour, date limite du solde). Solde, solde pointé, évolution sur 12 mois, patrimoine net (dettes déduites). **Rapprochement bancaire** : saisissez le solde de votre relevé, l'écart est corrigé automatiquement. Comptes clôturés conservés dans l'historique. |
| **Récurrences** | Salaire, loyer, abonnements, virements d'épargne… de quotidien à annuel, avec date de fin facultative. Enregistrement automatique à l'échéance ou validation manuelle. Charges fixes mensuelles, reste à vivre (revenus − charges fixes − virements programmés vers l'épargne), coût annuel des abonnements, calendrier des 45 prochains jours, mise en pause. |
| **Objectifs d'épargne** | Montant visé, échéance, versements et retraits. Effort mensuel nécessaire, date d'atteinte estimée au rythme actuel. |
| **Crédits** | Suivi des prêts (immobilier, auto, consommation…) : mensualité, capital restant dû, intérêts payés et restants, coût total, tableau d'amortissement, taux d'endettement. Comparaison des stratégies « avalanche » et « boule de neige » avec un effort mensuel supplémentaire. |
| **Couple** | Prénoms, revenus et règle de partage (au prorata des revenus, 50/50 ou pourcentage choisi). Chaque compte a un titulaire (commun ou personnel) et chaque dépense est « commune » ou pour l'un de vous. Équilibre « qui doit combien à qui », remboursements, part de chacun dans les dépenses communes, budget commun prévu sur 12 mois avec le versement et le « reste pour soi » de chacun, y compris pendant les congés liés à la naissance. Filtre « Pour qui » dans les opérations. |
| **Bébé** | Plan d'arrivée d'un bébé ou de jumeaux, avec comparaison des deux tant que ce n'est pas confirmé : somme à mettre de côté avant la naissance, coût net de la première année, calendrier (congés maternité, paternité et de naissance, prime, début de la garde), projection mois par mois, baisse de revenus pendant les congés, aides de la CAF (prime, allocation de base, allocations familiales, CMG), crédit d'impôt, crèche ou assistante maternelle, liste d'achats à cocher. Un clic crée l'objectif d'épargne, les récurrences et le budget « Enfants ». Règles et barèmes 2026. |
| **Optimisation** | Score de santé financière sur 100 (4 piliers inspirés du FinHealth Score : dépenser, épargner, emprunter, planifier). Conseils classés par priorité avec le gain annuel estimé et une action en un clic, par exemple : argent qui dort sur le compte courant (gain sur Livret A ou LEP, perte due à l'inflation), épargne de précaution, frais bancaires, abonnements, hausses de dépenses, dépenses inhabituelles, budgets irréalistes, épargne automatique, remboursement anticipé, renégociation, assurance emprunteur. Prévision de trésorerie sur 90 jours avec point bas, « disponible à dépenser » d'ici la fin du mois, détection automatique des paiements récurrents non suivis. |
| **Rapports** | Toute période (mois, trimestre, année, personnalisée) et tout compte : revenus / dépenses par mois, solde mensuel (excédent ou déficit), évolution du solde, répartition par catégorie avec évolution par rapport à la période précédente, règle 50/30/20, plus grosses dépenses, étiquettes, tableau mensuel. Export CSV. |
| **Simulateurs** | Prêt (mensualité, coût, assurance, amortissement), remboursement anticipé (indemnités légales, intérêts économisés, comparaison avec un Livret A), capacité d'emprunt (35 % d'endettement), épargne à intérêts composés (taux 2026 en un clic, inflation), objectif d'épargne, règle 50/30/20 comparée à vos dépenses réelles, fonds d'urgence. Préremplis avec vos propres moyennes. |
| **Catégories** (depuis Paramètres) | 32 catégories par défaut, modifiables : icône, couleur, groupe « besoins / envies / épargne ». À la suppression, les opérations sont déplacées vers la catégorie de votre choix. |
| **Paramètres** | Devise, thème clair / sombre / automatique, seuil d'alerte des budgets, mode discret (montants floutés), sauvegarde et restauration (JSON), remise à zéro. |

Autres détails : annulation après chaque suppression, raccourcis clavier (`N` nouvelle opération, `/` recherche, `←` `→` changer de mois, `G` puis `T`/`O`/`B`/`C`/`R` pour naviguer), graphiques accessibles au clavier avec info-bulles, affichage adapté au mobile avec barre d'onglets.

## Utilisation

### En local

Les modules JavaScript doivent être servis par HTTP (ouvrir `index.html` directement ne fonctionne pas).

```bash
npm start            # serveur intégré, sans dépendance : http://localhost:8080
# ou
python3 -m http.server 8080
```

### En ligne avec GitHub Pages

Le dépôt contient un workflow (`.github/workflows/pages.yml`) qui lance les tests puis publie l'application.

1. Dans **Settings → Pages**, choisissez **Source : GitHub Actions**.
2. Poussez sur la branche `main`, ou lancez le workflow « Tests et déploiement » depuis l'onglet **Actions** (bouton *Run workflow*).
3. L'application est disponible à l'adresse `https://<utilisateur>.github.io/<dépôt>/`. Sur mobile, utilisez « Ajouter à l'écran d'accueil » pour l'installer.

### Importer depuis une capture d'écran

Dans **Opérations**, bouton image (ou collez une capture avec `Ctrl+V` n'importe où dans l'application) : faites une ou plusieurs captures de la liste des opérations dans l'application de votre banque. Pécule lit les dates (« Aujourd'hui », « Lundi 12 octobre », « 09/10/2026 »…), les libellés et les montants, devine la catégorie et signale les opérations déjà saisies. Tout reste modifiable avant l'ajout.

La lecture se fait **sur votre appareil** avec [Tesseract.js](https://github.com/naptha/tesseract.js) (dossier `vendor/tesseract`) : l'image n'est envoyée nulle part. Le moteur (environ 5 Mo) est téléchargé à la première utilisation puis fonctionne hors ligne. Les captures en mode sombre sont prises en charge ; vérifiez toujours les montants, surtout ceux encadrés (signe non lisible).

### Importer un relevé bancaire

Dans **Opérations**, bouton d'import (flèche vers le haut) : choisissez le fichier CSV exporté depuis votre banque. Le séparateur (`;`, `,`, tabulation), l'encodage (UTF-8 ou Windows-1252) et les colonnes (date, libellé, montant ou débit / crédit) sont détectés automatiquement et restent modifiables. Un aperçu signale les doublons probables, et les catégories sont retrouvées à partir de vos opérations passées.

### Sauvegarder ses données

Les données vivent dans le navigateur utilisé : elles ne sont pas synchronisées entre appareils et disparaissent si vous effacez les données du site. Utilisez **Paramètres → Exporter une sauvegarde** régulièrement (l'application vous le rappelle tous les 30 jours) ; le fichier JSON se restaure sur n'importe quel appareil.

Sur iPhone et iPad, Safari efface les données d'un site qui n'a pas été ouvert depuis 7 jours : **ajoutez Pécule à l'écran d'accueil** pour éviter cela. L'application demande aussi au navigateur un stockage persistant pour qu'il ne l'efface pas en cas de manque de place.

## Développement

```
index.html              structure de la page
css/styles.css          styles (thèmes clair et sombre)
js/app.js               démarrage, navigation, raccourcis
js/store.js             état, persistance, actions (ajout, suppression, annulation…)
js/calc.js              calculs purs : soldes, budgets, récurrences, crédits, épargne (avec cache)
js/insights.js          moteur d'optimisation : score, conseils, prévision, détection, stratégies
js/setup.js             assistant de démarrage : construit comptes, récurrences et budgets à partir des réponses
js/family.js            couple (partage, équilibre, prévision) et plan bébé (congés, aides, garde)
js/benefits.js          titres-restaurant et avantages : soldes, règles d'utilisation, échéances
js/csv.js               lecture / écriture CSV, import de relevés
js/capture.js           captures d'écran bancaires : dates, libellés, montants, catégories (analyse du texte)
js/ocr.js               lecture du texte d'une image sur l'appareil (Tesseract.js, chargé à la demande)
vendor/tesseract/       moteur de lecture et modèle français (licences dans le dossier)
js/charts.js            graphiques SVG et info-bulles
js/views/*.js           une vue par rubrique
tests/*.test.js         tests unitaires (node --test)
sw.js                   service worker (hors ligne, mises à jour proposées)
docs/RECHERCHE.md       sources, repères 2026 et mesures de performance
```

Les montants sont stockés en **centimes entiers** pour éviter les erreurs d'arrondi. Les dates sont des chaînes `AAAA-MM-JJ` en heure locale.

```bash
npm test             # tests unitaires (Node 18 ou plus récent)
```

Lors de l'ajout d'un fichier JavaScript, ajoutez-le à la liste `ASSETS` de `sw.js` et en `modulepreload` dans `index.html` (des tests le vérifient). La version du service worker est remplacée à chaque déploiement par l'identifiant du commit : les utilisateurs se voient proposer la mise à jour.

Les taux d'épargne et repères économiques se mettent à jour dans `js/defaults.js` (`REFERENCE`, `SAVINGS_PRODUCTS`), à chaque révision du 1er février et du 1er août. Les barèmes familiaux (`FAMILY`) changent au 1er avril (CAF) et au 1er janvier (Sécurité sociale, impôts).
