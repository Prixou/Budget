# Recherche et optimisation

Ce document rassemble la recherche menée pour optimiser Pécule : les repères financiers français utilisés par les conseils, les méthodes reprises des meilleures applications de budget, et les mesures de performance. Pour chaque point : le constat, sa source, et ce qui a été fait dans l'application.

Les valeurs chiffrées sont centralisées dans `js/defaults.js` (`REFERENCE` et `SAVINGS_PRODUCTS`). **Les taux réglementés sont révisés le 1er février et le 1er août de chaque année : c'est le seul fichier à mettre à jour.**

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

## 10. Limites

- Les conseils sont indicatifs et ne remplacent pas un conseiller financier.
- Les taux et plafonds sont datés (`REFERENCE.ratesDate`) et doivent être mis à jour à chaque révision.
- La prévision de trésorerie ignore par défaut les revenus variables (case à cocher pour les inclure).
- La détection d'abonnements ne voit que ce qui passe par vos comptes : un abonnement payé via un magasin d'applications apparaît sous le nom du magasin.
