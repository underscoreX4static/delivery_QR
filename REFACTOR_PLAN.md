# REFACTOR_PLAN — Modèle de monétisation (Phase 0)

> Plan écrit, **aucun code applicatif modifié**. Seul ce fichier est créé.
> Source de vérité existant : `AUDIT_FINANCE.md`. Source de vérité cible : le
> prompt de refactor. Rien ne bouge tant que tu n'as pas validé ce plan **et**
> tranché les décisions ⚠️ ci-dessous.

---

## 0. Confirmations demandées

- **Forward-only confirmé.** Les commissions restent des snapshots gelés
  (`affiliate_commissions.commission_amount/rate`). Je ne réécris jamais
  l'historique. Un recalcul rétroactif = migration séparée, à ta demande.
- **Math centralisée** : toute la nouvelle cascade vit dans `lib/calculations.ts`.
  Aucune arithmétique monétaire ailleurs.
- **`settings.driver_pool_balance`** (Phase 4) : gardé tel quel comme **solde
  d'ouverture de la poche `driver_bonus`** du nouveau ledger. Aucun mouvement
  historique reconstruit ; le ledger `pool_movements` prend le relais à partir
  du déploiement.
- **J'ai validé ta formule** en re-calculant les 4 cas A–D : ils tombent **exacts**
  (aux 3 décimales près — voir ⚠️ D1 sur l'arrondi). La formule est cohérente.

## ⚠️ Le risque n°1 à comprendre AVANT tout : la commission est gelée, PAS le payout

C'est le point le plus important du refactor et il nuance le « forward-only ».

- **Ce qui est gelé** (snapshot) : `commission_amount` / `commission_rate` par
  commande, dans `affiliate_commissions`. Les dashboards les relisent via
  `affiliateCommissionOverride` → **l'historique des commissions ne bouge pas**. ✅
- **Ce qui N'est PAS gelé** : `driverPayout`, `ownerNet`, `grossProfit`. Ils ne
  sont **stockés nulle part**. `earnings.ts`, `finance.ts`,
  `drivers/[id]/route.ts` et **`settlements.ts`** les **recalculent en direct**
  via `calculatePayout` à chaque appel, à partir des champs de la commande.

**Conséquence :** dès que je change `calculatePayout` (Phase 1), la part livreur
et le net owner **changent rétroactivement** :
1. **Dans les dashboards** — l'historique de « driver payouts » / « owner net »
   s'affiche sous la nouvelle formule (decision-grade, probablement acceptable).
2. **Dans les settlements — c'est de l'ARGENT RÉEL.** Toute commande **déjà livrée
   mais pas encore réglée** sera versée au livreur sous la **nouvelle** formule.
   Or le fix du double-comptage livraison **réduit** la part livreur. Donc un
   livreur pourrait toucher, pour des courses déjà faites, un montant différent
   de ce qu'il aurait eu sous l'ancienne règle.

→ Ça devient la **⚠️ DÉCISION D5** ci-dessous. Ce n'est pas un détail : c'est le
seul endroit où « changer la formule » sort de « forward-only ».

---

## 1. Les décisions à trancher (⚠️) — chacune : 2 options + ma reco

> Aucune de ces décisions n'est codée avant ton arbitrage. Une fois tranchées,
> je les consigne dans `DECISIONS.md`.

### ⚠️ D1 — Arrondi (bloquant pour les tests)

Tes résultats attendus ont **3 décimales** (`maxCommission=33.108`,
`ownerNet=4.092`). Or l'app arrondit tout au centime (`round2`) et les colonnes
SQL sont `decimal(10,2)` — `33.108` deviendrait `33.11` en base.

- **Option A (reco)** : on garde `round2` au centime sur chaque **sortie
  monétaire** (`driverPayout`, `commissionApplied`, `ownerNet`), calcul interne
  en pleine précision. Cas D devient alors `commissionApplied=33.11`,
  `ownerNet=4.09`. J'ajuste les assertions de test à ces valeurs arrondies.
- **Option B** : pleine précision en interne, arrondi uniquement à la
  persistance. Les dashboards afficheraient `4.092` mais la base stockerait
  `4.09` → risque de désaccord affichage/versement d'un centime.
- **Ma reco : A.** L'argent, c'est des centimes ; les colonnes le sont déjà.
  Je te confirme juste que j'écris les tests avec `33.11 / 4.09`, pas `33.108 / 4.092`.

### ⚠️ D2 — La remise (promo) et le crédit parrainage : qui les finance ?

Ta formule pose `netProductRevenue = subtotal − discount`, donc **la remise réduit
la marge** → le livreur en partage le coût via ses 38 %. Même question pour le
**crédit de parrainage** (`creditApplied`), qui aujourd'hui réduit `total`.

Exemple : `subtotal=200, discount=20, COGS=110, rate=5 %`.
- **Option A — promo dans la marge (ta formule actuelle)** : `margin=180−110=70` →
  livreur `26.60`, owner net `39.90`. Le livreur co-finance la promo.
- **Option B — promo financée par l'owner seul (poche acquisition)** :
  `margin=subtotal−COGS=90` → livreur `34.20` (intact), puis l'owner porte la
  remise : owner net `= 55.80 − commission(4.50) − 20 = 31.30`. Le livreur ne
  paie pas la promo ; elle est tracée dans la poche `acquisition` (Phase 4) et
  soumise au plancher.
- **Ma reco : B.** C'est cohérent avec ta vision « growth pool finance
  l'acquisition » et « plancher owner ». La promo et le crédit parrainage sont
  des **coûts d'acquisition owner**, pas une charge livreur. Mais c'est un vrai
  choix de partage — à toi. (Si B : le crédit parrainage suit la même logique.)

### ⚠️ D3 — DRIVER_SHARE et OWNER_SHARE : liés ou indépendants ?

Ils valent `0.38 + 0.62 = 1.0`. Si les deux sont des réglages indépendants, un
admin pourrait les régler à `0.40 + 0.62` et sur/sous-distribuer la marge.

- **Option A (reco)** : un seul réglage `driver_share` (défaut 0.38),
  `owner_share = 1 − driver_share` **dérivé**. Impossible de casser la somme.
- **Option B** : deux réglages indépendants + un garde-fou qui refuse si la somme
  ≠ 1.
- **Ma reco : A**, plus simple et incassable.

### ⚠️ D4 — Colonne de base de commission

`affiliate_commissions.order_total` stockera désormais une **marge**, plus un CA.

- **Option A** : garder le nom `order_total`, documenter qu'il contient la marge
  de référence. Zéro migration. Nom trompeur.
- **Option B (reco)** : ajouter une colonne `commission_base decimal(10,2)`
  (migration douce, additive) et y écrire la marge ; laisser `order_total` se
  remplir de `order.total` pour l'audit/lisibilité. Nom clair, historique
  distinguable (ancien = CA, nouveau = marge via présence de `commission_base`).
- **Ma reco : B.** Additive, sans risque, et l'historique reste lisible.

### ⚠️ D5 — Rétroactivité du payout recalculé (le risque n°1)

Voir la section rouge ci-dessus. Pour les commandes **déjà livrées non réglées** :

- **Option A** : accepter le recalcul. Simple. En pratique les règlements
  suivent la livraison de peu, la fenêtre est courte. Je te préviens juste que
  les prochains settlements de courses passées appliqueront la nouvelle part.
- **Option B (reco long terme)** : **snapshoter `driver_payout` (et `owner_net`)
  à la livraison** dans `markDelivered`, comme la commission. Les settlements et
  dashboards lisent alors le snapshot → réellement forward-only, versements
  déterministes, plus de dérive. Coût : colonnes en plus + `markDelivered` +
  bascule des lecteurs vers le snapshot (scope réel).
- **Ma reco : B** si tu veux du propre et du déterministe (c'est la vraie
  correction de la « fuite » recalculée). **A** si tu veux aller vite et que la
  fenêtre non-réglée est négligeable. **À trancher explicitement.**

### ⚠️ D6 — Infra de test (il n'y en a AUCUNE)

Pas de vitest/jest, pas de fichiers de test, script `test` absent. Or tu exiges
des tests chiffrés.

- **Option A (reco)** : ajouter **vitest** (devDep) + script `test`, et des tests
  unitaires purs sur `lib/calculations.ts` (aucune DB, fonction pure → idéal).
- **Option B** : un script Node autonome (`scripts/verify-payout.ts`) qui log les
  cas A–D. Zéro dépendance, mais pas de vrai harnais réutilisable.
- **Ma reco : A**, vitest sur les fonctions pures. Léger, réutilisable pour
  toutes les phases.

### ⚠️ D7 — Parrainage : seuil de déblocage côté parrain (Phase 3)

- **Option A** : crédit débloqué dès la 1ʳᵉ livraison du **filleul** (côté parrain
  immédiat une fois le filleul actif).
- **Option B (reco, = ta spec)** : double condition — filleul livré **ET** parrain
  ayant atteint N commandes à lui. Défaut `N=2`, paramétrable via `settings`.
- **Ma reco : B avec N=2 par défaut**, comme ton prompt.

### ⚠️ D8 — Le pool trace ou plombe les commissions ? (Phase 4)

- **Option A (reco)** : les commissions restent un accrual direct per-order
  (`affiliate_commissions`, settlements inchangés) ; le growth pool **ne fait que
  les tracer** (écrit un `pool_movement` catégorie `acquisition`). Aucun
  re-plombage des settlements → risque minimal.
- **Option B** : les commissions **transitent** par le pool (provisionnées puis
  versées depuis le pool). Refonte des settlements partenaires → risqué.
- **Ma reco : A.** Tracer sans re-plomber.

### ⚠️ D9 — Traduction Finance : en dur ou i18n (Phase 5)

- **Option A (reco)** : traduction **en dur** FR→EN maintenant (rapide, scope
  contenu). i18n propre plus tard si besoin multi-langue.
- **Option B** : introduire un i18n minimal (`next-intl` ou dictionnaire maison).
  Plus propre, mais élargit le scope de la phase.
- **Ma reco : A** maintenant.

---

## 2. Plan phase par phase

### PHASE 1 — Cœur : `calculatePayout` (base marge + plancher + fix livraison)

**Fichiers touchés**
- `lib/calculations.ts` — réécriture de `calculatePayout` + nouvelle `PayoutInput`
  (entrées : `subtotal, discount, deliveryFee, costOfGoods, driverIsOwner,
  partnerCommissionRate/override, driverShare, ownerFloor`). Ajout constantes
  `OWNER_FLOOR_HARD_MIN = 0.11`. `total` n'est plus une entrée du payout.
- `lib/settings.ts` + `app/api/admin/settings/route.ts` (`FIELD_TO_KEY`) —
  nouveaux réglages `driver_share` (défaut 0.38) et `owner_floor` (défaut 0.11,
  clampé au dur), selon D3.
- `lib/orders.ts` (`markDelivered:127`) — base commission `order.total` → `margin`.
  Écriture snapshot selon D4. Si D5=B : snapshot `driver_payout`/`owner_net`.
- `components/admin/SettingsBoard.tsx` — champs pour les nouveaux réglages.
- (migration additive si D4=B et/ou D5=B — fichier `009_*.sql`, appliqué à la main.)

**Ordre** : settings → calculations → orders → SettingsBoard → tests.

**Lecteurs à re-vérifier un par un** (audit §4.1) : `lib/orders.ts`,
`lib/earnings.ts`, `lib/finance.ts`, `lib/settlements.ts`,
`app/api/admin/drivers/[id]/route.ts`. Pour chacun : confirmer qu'il passe bien
`subtotal/discount/deliveryFee/costOfGoods` (et non plus `total`) et que ses
sorties agrégées restent cohérentes. `finance.ts` (COD in transit, poolable owner
net, simBasis) et `earnings.ts` (ownerNet/takeHome) recalculent → à revalider.

**Tests** : vitest sur `calculatePayout`, cas A–D (valeurs arrondies selon D1) +
cas remise selon D2 + cas plancher qui mord + cas owner-livreur. Chiffres montrés.

**STOP checkpoint** : diff + sortie des tests.

---

### PHASE 2 — Attribution first-touch exclusive

**Fichiers touchés**
- `app/api/orders/route.ts` (création de commande) — figer/lire `first_qr_source`.
- `lib/orders.ts` (`markDelivered`) — résoudre le partenaire via
  `users.first_qr_source` du client, **plus** via `orders.qr_code_id`.
- Point de capture du first-touch (`/start`, `app/api/telegram/route.ts` /
  `lib/telegram*`) — garantir que `first_qr_source` se fige à la 1ʳᵉ capture et
  ne change jamais (déjà partiellement le cas ; à verrouiller).

**Règles** : client déjà attribué → jamais de 2ᵉ attribution vers un autre
partenaire. Client sans `first_qr_source` → organique, pas de commission.

**Lecteurs à re-vérifier** : tout ce qui lit l'attribution partenaire
(`partners/[id]` stats, `qr-codes` conversion). Vérifier qu'on n'introduit pas de
double comptage entre `qr_code_id` (par commande) et `first_qr_source` (par client).

**Tests** : QR-A puis QR-B → commission toujours à A ; sans source → 0 commission.

**STOP checkpoint.**

---

### PHASE 3 — Parrainage débloqué à la livraison

**Fichiers touchés**
- `lib/referrals.ts` — `approveReferral` ne crédite plus immédiatement ; il marque
  « approuvé, en attente d'activation ». Nouveau déblocage lié à la livraison.
- `lib/orders.ts` (`markDelivered`) — hook : à la 1ʳᵉ livraison du filleul (+
  condition parrain selon D7), créditer les deux `credit_balance`.
- `settings` — seuil parrain `N` (D7).

**Invariant** : le crédit reste un **crédit produit** (`users.credit_balance`),
jamais du cash. Idempotence : un filleul ne débloque qu'une fois.

**Lecteurs à re-vérifier** : `finance.ts` (referral float), `cart/preview` +
`orders` (application au checkout), `referrals` board/telegram.

**Tests** : filleul jamais livré → 0 ; filleul livré (+ parrain éligible) →
crédit des deux côtés, une seule fois.

**STOP checkpoint.**

---

### PHASE 4 — Growth Pool unifié (acquisition + bonus livreurs)

**Fichiers / schéma**
- **Nouvelle table append-only `pool_movements`** (`id, category
  ('acquisition'|'driver_bonus'), direction ('in'|'out'), amount, order_id?,
  reference, created_at`) — migration `010_*.sql` (additive, manuelle).
- `lib/driver-pool.ts` → étendu (ou nouveau `lib/growth-pool.ts`) : écrire un
  mouvement à chaque `in`/`out`, solde par poche = somme des mouvements (+ solde
  d'ouverture `driver_bonus` = `settings.driver_pool_balance` conservé).
- `lib/orders.ts` — `contributeToPool` écrit un mouvement `driver_bonus/in` ; les
  commissions/crédits/promos écrivent `acquisition/out` (selon D2/D8, en
  **traçage** si D8=A).
- `lib/finance.ts` — la section « pools » lit le nouveau ledger, expose les deux
  poches séparément.

**Invariants** : une seule caisse, deux poches **tracées séparément** (répondre
« combien d'acquisition ce mois » indépendamment des bonus). L'enveloppe/plancher
de Phase 1 gouverne la poche `acquisition` ; les bonus livreurs restent
discrétionnaires (poche `driver_bonus`). `settings.driver_pool_balance` conservé
comme solde d'ouverture.

**Lecteurs à re-vérifier** : `finance.ts` (pools + burn), `driver-pool` route,
`DriversBoard`/`DriverDetail` (budget pool).

**Tests** : reconstitution du solde par poche depuis `pool_movements` ; une
livraison → mouvement `driver_bonus/in` ; une commission → `acquisition/out`.

**STOP checkpoint.**

---

### PHASE 5 — Page Finance : EN + reflet du nouveau modèle

**Fichiers touchés**
- `components/admin/FinanceBoard.tsx`, `components/admin/EarningsBoard.tsx` —
  traduction FR→EN de tous les strings de l'audit §3.3 (D9 = en dur).
- Libellés modèle : « commission sur CA » → « commission on margin » ; séparer
  visuellement poche acquisition / bonus livreurs ; ajouter le plancher owner
  (11 %) et l'enveloppe aux « Active rates » ; refléter le growth pool.
- Simulateur (`FinanceBoard.tsx`) — recalcule sur la **nouvelle cascade** (base
  marge, plancher). Vérifier qu'il ne re-scale plus sur l'ancienne base CA
  (`simBasis` dans `lib/finance.ts`).
- `lib/finance.ts` / `lib/earnings.ts` restent des read-models (aucune math propre).

**Tests** : cohérence simulateur ↔ snapshot serveur sur un jeu de valeurs ;
revue visuelle (je ne peux pas lancer le serveur — je te le signalerai).

**STOP checkpoint final + récap décisions.**

---

## 3. Risques & mitigations

| Risque | Mitigation |
|---|---|
| **Payout recalculé rétroactivement** (D5) touche de l'argent réel sur les courses livrées non réglées | Trancher D5 ; si B, snapshot à la livraison → déterministe. Sinon prévenir l'owner avant déploiement. |
| Changer `calculatePayout` casse un des 6 lecteurs | Revue lecteur-par-lecteur imposée après Phase 1 (liste audit §4.1), avec sorties chiffrées. |
| Ambiguïté d'arrondi affichage ≠ versement | D1 = round2 au centime partout, tests sur valeurs arrondies. |
| Double comptage attribution (`qr_code_id` par commande vs `first_qr_source` par client) | Phase 2 bascule **une** source (first-touch) ; revue des stats partenaires. |
| Migration manuelle non appliquée en prod (pas de runner) | Chaque migration additive, non bloquante ; je te donne le SQL exact + l'ordre. Le code dégrade proprement si non appliquée. |
| Somme des parts ≠ 1 | D3 = `owner_share` dérivé de `driver_share`. |
| Crédit parrainage / promo « fuite » non tracée | D2 = coût owner tracé dans la poche acquisition (Phase 4), soumis au plancher. |

## 4. Forward-only : ce qui l'est, ce qui ne l'est pas

- **Forward-only garanti** : commissions (snapshot gelé), déblocage parrainage
  (nouveau, s'applique aux futures livraisons), mouvements de pool (ledger neuf).
- **Recalculé en direct (donc rétroactif si on ne snapshotte pas)** :
  `driverPayout`, `ownerNet`, `grossProfit` dans les dashboards **et les
  settlements** → gouverné par D5. C'est **la** décision qui définit si le
  refactor est strictement forward-only ou non.
- **Recalcul d'historique** (réécrire les vieilles `affiliate_commissions` sous la
  nouvelle base marge) : **hors scope**, migration séparée à ta demande explicite.

## 5. Livrables

- **Maintenant (Phase 0)** : ce `REFACTOR_PLAN.md`. **Aucun code.**
- **À chaque phase 1→5** : diff + tests chiffrés, un STOP checkpoint.
- **`DECISIONS.md`** : créé dès que tu tranches les ⚠️ ci-dessus (D1–D9), une
  entrée par décision + justification.
- **Fin** : récap forward-only vs migration d'historique éventuelle.

---

**STOP — J'attends (a) ta validation du plan et (b) tes arbitrages sur D1–D9
(au minimum D1, D2, D5, D6 qui conditionnent la Phase 1) avant d'écrire la
moindre ligne de code.**
