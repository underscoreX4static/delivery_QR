# DECISIONS — Refonte monétisation

Décisions tranchées avant Phase 1. Référence : `REFACTOR_PLAN.md §1`.

| # | Décision | Choix | Justification |
|---|---|---|---|
| **D1** | Arrondi | **Au centime (`round2`) sur chaque sortie monétaire** | L'argent est en centimes ; colonnes SQL `decimal(10,2)`. Le cas D devient `commissionApplied=33.11`, `ownerNet=4.09` (pas 33.108/4.092). Tests écrits sur les valeurs arrondies. |
| **D2** | Qui finance la promo / le crédit parrainage | **L'owner seul** | Remise + crédit parrainage sortent de la marge → le livreur touche pareil quelle que soit la promo. `margin = subtotal − COGS` (la remise n'est PAS dans la marge). L'owner porte remise + crédit dans son net (coût d'acquisition, tracé en Phase 4). Le cash reconcilie exactement (vérifié). |
| **D3** | Parts livreur/owner | **`driver_share` réglable (défaut 0.38), `owner_share = 1 − driver_share` dérivé** | Impossible de casser la somme = 1. |
| **D4** | Colonne base commission | **Colonne additive `commission_base`** sur `affiliate_commissions` (= marge) ; `order_total` conserve `order.total` | Nom clair, historique distinguable, migration additive sans risque. |
| **D5** | Rétroactivité paie livreur | **Figer à la livraison (snapshot)** | `orders.margin / driver_payout / owner_net` écrits à la livraison. Les courses déjà faites gardent leur ancien calcul (backfill ancienne formule) ; les nouvelles passent à la nouvelle. Déterministe, forward-only, aucun livreur lésé. |
| **D6** | Infra de test | **vitest** (devDep) + script `test`, tests purs sur `lib/calculations.ts` | Fonctions pures, aucune DB, réutilisable. |
| **D7** | Seuil parrain (Phase 3) | **N=2 par défaut, réglable** | = ta spec. |
| **D8** | Pool trace ou plombe (Phase 4) | **Trace** (accrual direct inchangé, le pool écrit un mouvement) | Aucun re-plombage des settlements → risque minimal. |
| **D9** | Traduction Finance (Phase 5) | **En dur** FR→EN maintenant | Rapide ; i18n propre plus tard si besoin multi-langue. |

## Nuances actées

- **Cash reconcilie (D2=owner)** : `driverPayout + ownerNet + commission + COGS = total`. La remise et le crédit sont **déjà nets dans `total`** (le client a payé moins) et absorbés dans `ownerNet` — on ne les rajoute donc pas. Vérifié algébriquement + test.
- **Plancher (Phase 1)** : ne plafonne que la **commission** (`maxCommission = ownerShareGross × (1 − ownerFloor)`), comme la formule cible. L'extension du plancher pour couvrir aussi remise + crédit (enveloppe d'acquisition complète) relève de la **Phase 4** — à confirmer à ce moment-là.
- **Plancher, minimum absolu** : `OWNER_FLOOR` réglable mais clampé à un **dur `OWNER_FLOOR_HARD_MIN = 0.11`** — un admin ne peut pas descendre sous 11 %.
- **D5, dépendance de déploiement** : les read-models préfèrent le snapshot ; à défaut (commande livrée avant migration), fallback sur la nouvelle formule. Le **backfill (ancienne formule)** doit être lancé pour verrouiller les anciennes courses à leur ancien calcul avant de régler des courses passées.
