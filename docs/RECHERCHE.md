# Recherche et optimisation

Ce document rassemble la recherche menée pour optimiser Pécule : les repères financiers français utilisés par les conseils, les méthodes reprises des meilleures applications de budget, et les mesures de performance. Pour chaque point : le constat, sa source, et ce qui a été fait dans l'application.

Les valeurs chiffrées sont centralisées dans `js/defaults.js` (`REFERENCE`, `SAVINGS_PRODUCTS` et, pour la famille, `FAMILY`). **Les taux réglementés sont révisés le 1er février et le 1er août de chaque année : c'est le seul fichier à mettre à jour.**

## 1. Épargne réglementée (taux au 1er août 2026)

| Produit | Taux net | Plafond de dépôt | Fiscalité |
|---|---|---|---|
| Livret A | 1,70 % | 22 950 € | Exonéré |
| LDDS | 1,70 % | 12 000 € | Exonéré |
| LEP | 2,50 % | 10 000 € | Exonéré, sous conditions de revenus |
| Livret jeune | au moins 1,70 % | 1 600 € | Exonéré |
| CEL | 1,25 % | 15 300 € | Imposable |
| PEL ouvert depuis 2026 | 2 % brut (1,4 % après prélèvement forfaitaire de 30 %) | 61 200 € | Imposable |

- Le Livret A et le LDDS passent de 1,5 % à 1,7 % au 1er août 2026 (première hausse après cinq baisses) ; le LEP est maintenu à 2,5 %.
- LEP : revenu fiscal de référence 2024 au plus égal à 23 028 € pour une part et 35 326 € pour un couple (plafonds 2026). Le solde peut dépasser 10 000 € par les intérêts.
- Fonds en euros d'assurance vie : 2,63 % en moyenne en 2025 (rapport ACPR du 30 juin 2026).

**Application.**
- Les comptes épargne ont un champ « produit » qui affiche le taux, les intérêts annuels estimés et le remplissage du plafond.
- Les conseils détectent :
  - l'argent qui dort sur le compte courant au-delà d'un mois de dépenses, avec le gain sur un Livret A ou un LEP et la perte due à l'inflation ;
  - l'éligibilité possible au LEP ;
  - un plafond atteint.
- Le simulateur d'épargne propose ces taux en un clic.

Sources : [La finance pour tous](https://www.lafinancepourtous.com/2026/07/15/livret-a-un-taux-de-17-au-1er-aout-2026/), [Meilleurtaux Placement](https://placement.meilleurtaux.com/livret-epargne/actualites/2026-juillet/livrets-les-taux-officiels-au-1er-aout-2026.html), [Nalo](https://blog.nalo.fr/taux-ldds/), [MoneyVox](https://www.moneyvox.fr/livret-a/actualites/109680/livret-a-lep-voici-les-nouveaux-taux-officiels-de-vos-livrets-epargne-au-1er-aout-2026), [Advize Experts (plafonds)](https://advizexperts.fr/baremes-seuils/livrets-reglementes/), [Meilleurtaux (LEP 2026)](https://placement.meilleurtaux.com/livret-epargne/actualites/2026-juin/lep-en-2026-plafond-taux-et-conditions-de-revenus.html), [Weblex (plafonds LEP)](https://www.weblex.fr/weblex-actualite/livret-d-epargne-populaire-des-plafonds-reevalues-pour-2026), [Meilleurtaux (fonds en euros, ACPR)](https://placement.meilleurtaux.com/assurance-vie/actualites/2026-mars/assurance-vie-fonds-euros-a-2-6-en-2025-selon-lacpr.html).

## 2. Repères économiques

- Inflation 2026 prévue à 2,3 % par la Banque de France (projections de septembre 2026). Elle sert de valeur par défaut au simulateur d'épargne et au calcul de la perte de pouvoir d'achat de l'argent non placé.

Source : [Banque de France, projections de septembre 2026](https://www.banque-france.fr/fr/publications-et-statistiques/publications/projections-macroeconomiques-intermediaires-septembre-2026).

## 3. Crédits

- **Taux d'endettement** plafonné à 35 % assurance comprise, durée de 25 ans au plus (27 ans dans le neuf) : norme du Haut Conseil de stabilité financière (HCSF). Utilisé par le simulateur de capacité d'emprunt, le score et une alerte au-delà de 35 %.
- **Indemnités de remboursement anticipé (IRA)** :
  - crédit immobilier (art. L313-47 du Code de la consommation) : au plus 6 mois d'intérêts sur la somme remboursée et 3 % du capital restant dû ; elles ne sont pas dues en cas de vente liée à un changement de lieu de travail, de cessation forcée d'activité ou de décès ;
  - crédit à la consommation (art. L312-34) : aucune indemnité jusqu'à 10 000 € remboursés sur 12 mois ; au-delà, 1 % de la somme (0,5 % s'il reste moins d'un an), sans dépasser les intérêts restants.

  Ces règles sont implémentées dans `prepaymentPenalty()` et testées.
- **Renégociation** rentable si l'écart de taux atteint 0,7 à 1 point, si l'on est dans la première moitié du prêt et si le capital restant dépasse 70 000 €. Les taux de marché 2026 vont de 3,4 % (15 ans) à 4,2 % (25 ans). Le conseil ne s'affiche que si les trois conditions sont réunies, avec une estimation nette des IRA.
- **Assurance emprunteur** : depuis la loi Lemoine (2022), on peut en changer à tout moment, sans frais, à garanties équivalentes. L'économie moyenne est estimée entre 5 000 et 15 000 € pour un prêt de 250 000 € sur 20 ans.

Sources : [Pretto (HCSF)](https://www.pretto.fr/pret-immobilier/hcsf/), [Selectra (remboursement anticipé)](https://selectra.info/finance/guides/comprendre/remboursement-anticipe-pret), [Fortuneo (IRA)](https://www.fortuneo.fr/blog/qu-est-ce-que-les-indemnites-de-remboursement-anticipe-615), [Bourse des crédits (crédit conso)](https://boursedescredits.com/faq-puis-faire-remboursement-anticipe-penalite-111.php), [CPIM (seuil de rentabilité 2026)](https://www.cpim.fr/renegociation-credit-immo-seuil-rentabilite/), [Empruntis](https://www.empruntis.com/financement/rachats-credits-immobilier/bon-moment-pour-une-renegociation/), [Magnolia (loi Lemoine)](https://www.magnolia.fr/actualites/assurance-emprunteur/loi-lemoine-assurance-pret-chance-pour-tous-emprunteurs), [MoneyVox (assurance de prêt)](https://www.moneyvox.fr/credit/actualites/103521/tout-le-monde-peut-faire-des-economies-cette-astuce-negligee-permet-de-casser-le-cout-du-pret-immobilier).

## 4. Frais bancaires

- En 2026, un client paie en moyenne 191,90 € par an dans une banque traditionnelle, contre 0 à 20 € dans une banque en ligne.
- Les commissions d'intervention sont plafonnées à 8 € par opération et 80 € par mois. Avec l'offre « clientèle fragile », les frais d'incident sont limités à 20 € par mois et 200 € par an, et les commissions à 4 € par opération et 20 € par mois.

**Application.** Les frais de l'année sont annualisés. Au-delà de 30 € par an, un conseil chiffre l'économie possible et rappelle les plafonds si des frais d'incident apparaissent.

Sources : [Finalib](https://finalib.fr/blog/patrimoine-epargne/frais-bancaires-2026-economiser-246-euros), [Selectra (frais bancaires)](https://selectra.info/finance/guides/frais-bancaires), [Banque de France (plafonnement)](https://www.banque-france.fr/fr/a-votre-service/particuliers/connaitre-pratiques-bancaires-assurance/compte-frais/plafonnement-frais-incidents).

## 5. Épargne de précaution

- La Banque de France recommande de 2 à 6 mois de revenus selon la situation ; l'AMF, de 2 à 3 mois immédiatement disponibles.
- Repère courant : 3 mois de dépenses pour un salarié en CDI, 6 mois ou plus pour des revenus variables.

**Application.**
- Un réglage « revenus réguliers / variables » fixe la cible à 3 ou 6 mois.
- Le score mesure la couverture.
- Un conseil propose de créer l'objectif « Fonds d'urgence » avec l'effort mensuel nécessaire.

Sources : [INC et Banque de France](https://www.inc-conso.fr/content/lepargne-de-precaution-indispensable-pour-les-imprevus-avec-la-banque-de-france), [Invesse](https://invesse.fr/epargne/epargne-de-precaution-combien/).

## 6. Économie comportementale

- **Se payer en premier.** Dans le programme Save More Tomorrow (Thaler et Benartzi), l'épargne automatique a fait passer le taux d'épargne des participants de 3,5 % à 13,6 % en trois ans et demi. Le conseil « Automatisez votre épargne » crée en un clic un virement mensuel le lendemain de la paie.
- **Boule de neige contre avalanche.** Une étude de la Kellogg School of Management (Gal et McShane, 6 000 personnes endettées) montre que solder les petites dettes d'abord aide davantage à aller au bout, même si l'avalanche (taux le plus élevé d'abord) coûte moins d'intérêts. La rubrique Crédits compare les deux, avec report des mensualités soldées.

Sources : [The Decision Lab](https://thedecisionlab.com/intervention/how-automatic-saving-plans-save-users-twice-as-much-over-five-years), [témoignage de R. Thaler au Congrès](https://www.jec.senate.gov/archive/Documents/Hearings/thalertestimony10march2004.pdf), [Kellogg School of Management](https://www.kellogg.northwestern.edu/news_articles/2012/snowball-approach.aspx).

## 7. Score de santé financière

Le FinHealth Score du Financial Health Network repose sur 8 indicateurs répartis en 4 piliers : dépenser, épargner, emprunter, planifier.

L'adaptation française est calculée à partir des données réelles, sans questionnaire :

| Pilier | Indicateur 1 | Indicateur 2 |
|---|---|---|
| Dépenser | Dépenses inférieures aux revenus (taux d'épargne) | Jours de découvert sur 90 jours |
| Épargner | Mois de dépenses couverts par l'épargne de précaution | Épargne de long terme (placements + épargne au-delà de la réserve) |
| Emprunter | Taux d'endettement (35 % maximum) | Coût moyen des dettes |
| Planifier | Budgets respectés | Capacité à financer les objectifs |

Le « credit score » américain n'a pas d'équivalent en France : il est remplacé par le coût des dettes. Les seuils sont ceux du FinHealth Score : 80 et plus « en bonne santé », 40 à 79 « à consolider », moins de 40 « vulnérable ».

Source : [FinHealth Score Toolkit](https://finhealthnetwork.org/wp-content/uploads/2021/11/FinHealthScoreToolkit-2021.pdf).

## 8. Fonctionnalités inspirées des applications de référence

Les comparatifs 2026 de YNAB, Monarch Money, Copilot Money et Rocket Money retiennent comme points forts :
- la détection des abonnements oubliés ;
- la prévision de trésorerie ;
- le suivi du patrimoine net ;
- le « disponible à dépenser ».

**Application.**
- **Détection des paiements récurrents.** Méthode : regrouper les opérations par marchand normalisé (sans « PRLV SEPA », dates ni numéros), garder les montants à ±10 % de la médiane, chercher un intervalle dominant (hebdomadaire 7 ± 2 jours, mensuel 30 ± 4, trimestriel 91 ± 10, annuel 365 ± 21…) et exiger au moins 3 occurrences. Un bouton « Suivre » les transforme en récurrences.
- **Prévision de trésorerie sur 90 jours.** Elle combine les récurrences, les opérations futures et les dépenses variables moyennes, hors dépenses exceptionnelles. Elle signale le point bas et un éventuel risque de découvert.
- **« Disponible à dépenser »** d'ici la fin du mois, au total et par jour.
- **Hausses de dépenses** (30 jours contre la moyenne des 90 précédents, hors prélèvements fixes) et **dépenses inhabituelles** (au moins 3 fois la médiane de la catégorie), pour repérer une erreur ou une fraude.
- **Comparaison à date** : en cours de mois, les revenus et dépenses sont comparés à la même période du mois précédent.

Sources : [Asian Efficiency](https://www.asianefficiency.com/technology/copilot-money-vs-monarch-vs-ynab/), [Costbench](https://costbench.com/best/best-budgeting-apps/), [SubTracker (détection)](https://subtracker.io/build/recurring-charge-detection), [Spade (transactions récurrentes)](https://docs.spade.com/reference/recurring-transaction-guide.md).

## 9. Performance et fiabilité de l'application

| Constat | Source | Ce qui a été fait |
|---|---|---|
| `localStorage` est synchrone (bloque l'écran) et limité à environ 5 Mo ; IndexedDB est asynchrone | [web.dev, Storage for the web](https://web.dev/articles/storage-for-the-web) | Stockage dans IndexedDB, découpé par mois : une modification ne réécrit que le mois concerné. Migration automatique depuis la version précédente. |
| Safari efface les données d'un site non visité depuis 7 jours, sauf pour les apps ajoutées à l'écran d'accueil | [Michael Tsai](https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/) | Conseil affiché dans les paramètres, demande de stockage persistant (`navigator.storage.persist`), rappel de sauvegarde tous les 30 jours. |
| Une interaction doit répondre en moins de 200 ms (INP) ; les tâches de plus de 50 ms doivent être découpées | [web.dev, Optimize INP](https://web.dev/articles/optimize-inp) | Enregistrement et calcul des conseils pendant les temps morts (`requestIdleCallback`), index de recherche préparé par petits morceaux. |
| `content-visibility: auto` évite de dessiner le contenu hors écran | [web.dev, content-visibility](https://web.dev/content-visibility) | Appliqué aux journées de la liste des opérations. |
| Sans outil de compilation, les modules ES se chargent en cascade ; `modulepreload` les demande en parallèle | [Go Make Things](https://gomakethings.com/web-performance-and-parallel-vs.-waterfall-downloads/) | Tous les modules sont préchargés (un test vérifie la liste). |
| Mieux vaut proposer une mise à jour que l'imposer pendant une saisie | [web.dev, PWA Update](https://web.dev/learn/pwa/update), [Chrome Workbox](https://developer.chrome.com/docs/workbox/handling-service-worker-updates) | Service worker « cache d'abord » (démarrage instantané, hors ligne) avec bouton « Mettre à jour ». La version change à chaque déploiement. |
| Node 20 est retiré des machines GitHub Actions en 2026 | [actions/deploy-pages](https://github.com/actions/deploy-pages/issues/410) | Actions mises à jour : checkout v6, setup-node v6, configure-pages v6, upload-pages-artifact v5, deploy-pages v5. |

Calculs : les données dérivées (tri chronologique, index mensuel, soldes, dépenses par catégorie, texte de recherche) sont mises en cache et invalidées à chaque modification. Les filtres par période ne parcourent que les mois concernés.

### Mesures

Même script pour les deux versions : Chromium, processeur ralenti 4 fois (téléphone moyen), 14 352 opérations sur 5 ans (3,5 Mo). Moyenne de deux passages, en millisecondes.

| Mesure | Avant | Après |
|---|---:|---:|
| Démarrage | 795 | 517 |
| Ouvrir le tableau de bord | 128 | 65 |
| Ouvrir les comptes | 128 | 96 |
| Ouvrir les rapports | 193 | 159 |
| Ouvrir les budgets | 75 | 60 |
| Ouvrir les opérations | 66 | 76 |
| Ajout d'une opération : écran à jour | 158 | 148 |
| Ajout d'une opération : blocage total sur 3 s, enregistrement compris | 362 | 135 |
| Ajout d'une opération : plus longue tâche | 253 | 131 |

L'ancienne version a été mesurée au commit précédent ; sa page Optimisation n'existait pas. Avec ce volume, l'ancienne version approchait aussi de la limite de 5 Mo de `localStorage` : une copie supplémentaire des données échouait déjà.

## 10. Famille : budget à deux et arrivée d'un bébé

Les barèmes sont regroupés dans `js/defaults.js` (`FAMILY`, `BABY_EQUIPMENT`, `BABY_MONTHLY`) et les calculs dans `js/family.js` (fonctions pures, testées). Montants en vigueur au 1er avril 2026 pour la CAF.

### Partager les dépenses en couple

| Constat | Source | Dans l'application |
|---|---|---|
| En France, 36 % des personnes en couple partagent à 50/50 et 24 % au prorata des revenus. Avec des revenus différents, le 50/50 pèse davantage sur celui qui gagne le moins et l'empêche d'épargner. | [Pretto](https://www.pretto.fr/acheteur-immobilier/co-emprunteur/repartition-depenses-en-couple/), [SG](https://particuliers.sg.fr/nos-conseils/epargner/comment-epargner-en-couple) | Trois règles : prorata des revenus (par défaut), 50/50, pourcentage choisi. Conseil « Partager au prorata ? » quand la règle 50/50 s'applique à des revenus qui diffèrent d'au moins 30 %. |
| Les guides proposent souvent un compte joint alimenté par chacun selon sa part, plus un compte personnel chacun. | Mêmes sources | Chaque compte a un titulaire (commun ou l'un des deux). Chaque dépense est « commune » ou personnelle ; par défaut, commune sur le compte joint et pour les besoins du foyer. |

**Calcul de l'équilibre.** Le compte joint est supposé alimenté selon la règle de partage. Une dépense commune payée avec un compte personnel est due par l'autre pour sa part. Une dépense personnelle payée par le compte joint est due par son bénéficiaire pour la part de l'autre. Les remboursements enregistrés remettent le compteur à zéro.

**Prévision du budget commun sur 12 mois.** Base : moyenne des dépenses communes des 3 derniers mois. On y ajoute le coût net de bébé. Au prorata, la part de chacun est recalculée les mois où un congé réduit ses revenus.

### Congés liés à la naissance

| Règle 2026 | Source | Dans l'application |
|---|---|---|
| Congé maternité : 16 semaines (6 avant, 10 après) ; 26 semaines à partir du 3e enfant ; **34 semaines pour des jumeaux** (12 + 22) | [service-public.fr](https://www.service-public.gouv.fr/particuliers/vosdroits/F35890) | Dates calculées depuis le terme prévu. |
| Congé de paternité et d'accueil : 25 jours, **32 jours en cas de naissances multiples** | [info.gouv.fr](https://www.info.gouv.fr/actualite/conge-de-paternite-et-d-accueil-de-l-enfant-regles-demarches-et-evolutions-recentes) | Placé à partir de la naissance. |
| Indemnités journalières : salaire journalier de base (3 derniers salaires bruts ÷ 91,25) moins 21 %, plafonnées à 104,02 € par jour | [L'Essentiel de l'éco](https://lessentieldeleco.fr/6006-conge-maternite-2026-quel-montant-pouvez-vous-vraiment-toucher/) | Perte de revenus = salaire net − indemnités, sauf si l'employeur maintient le salaire (case à cocher). |
| Congé supplémentaire de naissance : 1 ou 2 mois par parent, indemnisé 70 % du salaire net le 1er mois et 60 % le 2e, dans la limite du plafond de la Sécurité sociale | [ameli.fr](https://www.ameli.fr/assure/droits-demarches/famille/maternite-paternite-adoption/conge-supplementaire-naissance), [FED Group](https://www.fed-group.fr/fed-group/actualites-fed/conge-naissance-reforme-2026) | 0, 1 ou 2 mois par parent, à la suite du congé maternité ou paternité. |

### Aides et fiscalité

| Aide | Source | Dans l'application |
|---|---|---|
| Prime à la naissance : 1 093,11 €, versée avant la naissance, **pour chaque enfant** | [aide-sociale.fr](https://www.aide-sociale.fr/caf-paje/), [justice.fr](https://www.justice.fr/fiche/allocation-base-paje-versee-naissance-enfant) | Versée au 7e mois de grossesse si le revenu de 2024 est sous le plafond. |
| Allocation de base : 198,17 € (taux plein) ou 99,09 € (taux partiel) par mois jusqu'aux 3 ans. En cas de naissances multiples, une allocation par enfant. | [justice.fr](https://www.justice.fr/fiche/allocation-base-paje-versee-naissance-enfant), [Assemblée nationale, QE 43894](https://questions.assemblee-nationale.fr/dyn/13/questions/QANR5L13QE43894.pdf) | Taux selon le revenu fiscal de référence 2024 et les plafonds (1 ou 2 revenus, majorés par enfant). |
| Allocations familiales dès 2 enfants : 152,25 €, 76,13 € ou 38,06 € par mois selon les revenus | [caf.fr](https://www.caf.fr/professionnels/offres-et-services/accompagnement-des-allocataires/bareme-allocations-familiales) | Comptées dès 2 enfants à charge (donc pour des jumeaux dès leur naissance). |
| Crèche : tarif horaire = ressources mensuelles × taux d'effort (0,0619 % pour 1 enfant, 0,0516 % pour 2…), entre un plancher et un plafond de ressources | [CAF, guide PSU 2026](https://caf.fr/sites/default/files/medias/493/Partenaires/Petite-enfance/EAJE/Guide_PSU_2026_02_V_Def.pdf) | Coût mensuel = tarif × heures × nombre de bébés. |
| Assistante maternelle : depuis septembre 2025, le complément de mode de garde (CMG) est calculé à l'heure, comme en crèche, dans la limite de 825,16 € par mois | [quelles-aides.fr](https://www.quelles-aides.fr/allocations-familiales/naissance/cmg/), [aide-sociale.fr](https://www.aide-sociale.fr/cmg-assistante-maternelle/), [Fepem](https://observatoire.fepem.fr/app/uploads/2025/12/Barometre-48_VF.pdf), [DREETS](https://pays-de-la-loire.dreets.gouv.fr/sites/pays-de-la-loire.dreets.gouv.fr/IMG/pdf/fiche_remu_indemnites_frais_au_12062026.pdf) | Estimation simplifiée : la famille paie l'équivalent du tarif crèche, le CMG couvre le reste jusqu'à 8 € de l'heure. |
| Crédit d'impôt pour frais de garde : 50 % des frais restant à charge, plafond 3 500 € par enfant de moins de 6 ans | [Meilleurtaux](https://placement.meilleurtaux.com/placement-financier/actualites/2026-mars/frais-de-garde-le-credit-dimpot-jusqua-1-750-eur.html) | Affiché par an, versé l'année suivante. |
| Quotient familial : une demi-part par enfant pour les deux premiers, une part à partir du 3e ; avantage plafonné à 1 807 € par demi-part | [Légifiscal](https://www.legifiscal.fr/actualites-fiscales/4474-ir-bareme-2026-quotient-familial-decote.html) | Avantage maximal indiqué. |

### Dépenses d'un bébé

La première année d'un enfant coûte en moyenne 6 172 € selon le baromètre Sofinscope. La liste de départ de Pécule totalise environ 2 000 € neuf pour un bébé. Sources : [Journal de l'économie](https://www.journaldeleconomie.fr/un-enfant-6-172-euros-premiere-annee/), [Avis Parents](https://www.avis-parents.com/vie-famille/budget-famille/cout-bebe-premiere-annee/).

**Dans l'application.**
- Liste d'achats de 16 articles, avec prix courants et quantités pour des jumeaux (2 sièges auto, poussette double…). L'occasion réduit le prix, sauf pour le siège auto.
- Dépenses mensuelles par enfant selon les choix (couches jetables ou lavables, allaitement ou lait infantile), plus la diversification à partir de 6 mois.
- **Comparaison 1 bébé / jumeaux** tant que le nombre n'est pas confirmé.
- **Somme à mettre de côté** : le besoin de trésorerie le plus élevé entre aujourd'hui et la reprise du travail. Il comprend les achats, les dépenses courantes et la baisse de revenus, aides déduites. Après la reprise, le coût relève du budget mensuel.
- Boutons pour créer l'objectif d'épargne, les récurrences (aides de la CAF, frais de garde) et le budget « Enfants ». Le budget est proposé un mois avant la naissance, pour ne pas rester inutilisé.

## 11. Limites

- Les conseils sont indicatifs et ne remplacent pas un conseiller financier.
- Les taux et plafonds sont datés (`REFERENCE.ratesDate`) et doivent être mis à jour à chaque révision.
- La prévision de trésorerie ignore par défaut les revenus variables (case à cocher pour les inclure).
- La détection d'abonnements ne voit que ce qui passe par vos comptes : un abonnement payé via un magasin d'applications apparaît sous le nom du magasin.
- Les droits aux aides familiales sont des estimations : seule la CAF les calcule (situation, ressources exactes, date de déclaration de grossesse). Le revenu fiscal de référence est estimé à 90 % des revenus nets annuels s'il n'est pas saisi. Le CMG et la PreParE sont simplifiés ou non calculés.
