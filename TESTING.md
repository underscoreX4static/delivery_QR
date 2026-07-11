# TESTING — Plan de test (post-refonte monétisation + refonte UI)

> Beaucoup a été poussé en prod sans validation réelle. Ce doc liste **quoi
> tester**, priorisé, avec les résultats attendus quand ils sont calculables.
> Coche au fur et à mesure. La math pure est déjà couverte par 22 tests vitest
> (`npm test`) ; l'essentiel du reste est **DB / bout-en-bout**, pas encore testé.

Légende priorité : **P0** = argent réel, à faire en premier · **P1** = flux
métier · **P2** = dashboards · **P3** = UI.

---

## 0. Prérequis (à faire AVANT tout test)

- [ ] **Lancer les 4 migrations Supabase dans l'ordre** : `007`, `009`, `010`, `011`.
      Tant qu'elles ne sont pas là, le code dégrade (fallback formule / ledger vide)
      mais les colonnes/tables manquent → beaucoup de tests seront faussés.
- [ ] **Un vrai livreur de test** qui a fait `/start` sur le bot (sinon aucune
      notif Telegram ne part, et tout le flux settlement/bonus est bloqué). Ton
      compte owner (8376671012) marche déjà.
- [ ] **Renseigner `starting_cash`** dans Settings (sinon runway = 0 partout).
- [ ] Avoir au moins **1 partenaire** avec un `commission_rate` et un **QR code**,
      et **1 produit avec un batch** (cost_price + sell_price) pour générer des marges réelles.
- [ ] Vérifier `npm test` (22 tests) passe encore après tout futur changement.

---

## P0 — La math d'argent (refonte monétisation, phases 1–5)

### 0.1 Commande de référence (« golden order ») — vérifier les nombres exacts
Passe une commande réelle et suis-la jusqu'à `delivered`. Prends un cas simple :
**subtotal 130, remise 0, livraison 0 (au-dessus du seuil gratuit), COGS 70,
commission partenaire 10%, livreur non-owner, `bonus_pool_rate` = 10%.**

Après livraison, vérifier **en base** :
- [ ] `orders.margin` = **60.00** (`subtotal − COGS`, livraison exclue)
- [ ] `orders.driver_payout` = **22.80** (`60 × 0.38`, + livraison si >0)
- [ ] `orders.owner_net` = **31.20** (`60 × 0.62 − commission 6`)
- [ ] `affiliate_commissions.commission_base` = **60.00** (la marge, pas le CA)
- [ ] `affiliate_commissions.commission_amount` = **6.00** (`marge × 10%`)
- [ ] `pool_movements` : une ligne `driver_bonus / in / 3.12` (`owner_net 31.20 × 10%`)
- [ ] `pool_movements` : une ligne `acquisition / out / 6.00` (reference `commission`)

### 0.2 Le fix du double-comptage livraison
Commande **sous le seuil** (livraison facturée 10) : subtotal 40, COGS 25, rate 10%.
- [ ] `driver_payout` = **15.70** (`15 × 0.38 + 10`) — la livraison n'est ajoutée qu'**une** fois
- [ ] `owner_net` = **7.80** (`15 × 0.62 − 1.50`)

### 0.3 D2 — promo & crédit financés par l'owner (pas par le livreur)
Commande remisée : subtotal 200, remise 20, COGS 110, rate 5%.
- [ ] `driver_payout` = **34.20** (`90 × 0.38`) — **inchangé** par la promo
- [ ] `owner_net` = **31.30** (`55.80 − 4.50 − 20`) — l'owner absorbe la remise
- [ ] `pool_movements` : `acquisition / out / 20.00` (reference `promo_discount`)
- [ ] Réconciliation : `driver_payout + owner_net + commission + COGS` = `order.total`

### 0.4 Plancher owner (11% dur)
Mets un partenaire à une **commission absurde (ex. 95%)**, passe/livre une commande.
- [ ] La commission écrite est **plafonnée** à `ownerShareGross × 0.89`, pas 95% de la marge
- [ ] Dans Settings, mettre « Owner floor » à **0%** puis relivrer → toujours plafonné à 11% (min dur)

### 0.5 Owner-livreur
Livre une commande où **tu (owner) es le livreur**.
- [ ] `driver_payout` = **0**, `owner_net` inclut la part livreur + la livraison
- [ ] Pas de mouvement `driver_bonus/in` (pas de pool sur les courses owner)

### 0.6 Snapshot déterministe (D5)
- [ ] Change `driver_share` dans Settings **après** une livraison → le
      `driver_payout` figé de cette commande ne bouge **pas** (ni dans Earnings, ni au règlement)
- [ ] Une commande livrée **avant** la migration 009 : vérifier que le **backfill**
      lui a bien mis un `driver_payout` (ancienne formule) — pas de NULL

---

## P1 — Flux métier

### 1.1 Attribution first-touch (phase 2)
- [ ] Nouveau client scanne **QR-A** puis **QR-B** plus tard → une commande livrée
      crédite la commission à **A** (via `users.first_qr_source`), jamais B
- [ ] Client démarré **sans QR** (organique) puis scanne QR-A → attribué à A au 1er scan
- [ ] Client sans `first_qr_source` → **aucune** commission (organique)

### 1.2 Parrainage asymétrique (phase 3)
- [ ] Crée un parrainage (nouveau user via lien `ref_`), **approuve** dans /admin/referrals
      → le **filleul** est crédité **tout de suite** (`credit_balance`), notif « sur ta 1ʳᵉ commande »
- [ ] Le **parrain** n'est **pas** encore crédité à ce stade
- [ ] Le filleul passe sa 1ʳᵉ commande **avec la réduc appliquée** (crédit déduit au checkout)
- [ ] À la **livraison** de cette 1ʳᵉ commande → le **parrain** est crédité, notif « ton parrainage a payé »
- [ ] Relivrer / re-trigger ne **re-crédite pas** (idempotent, `referred_/referrer_credited_at`)
- [ ] Vérifier `pool_movements acquisition/out` pour le crédit **utilisé** (reference `referral_credit`)

### 1.3 Driver bonus pool & grants
- [ ] Le budget pool (Drivers) monte de `owner_net × bonus_pool_rate` à chaque livraison non-owner
- [ ] « Grant bonus » à 1 / plusieurs / tous → budget baisse d'`amount × nb`, chaque livreur reçoit la notif
- [ ] Budget peut passer **négatif** (rouge) si tu donnes plus que dispo
- [ ] Le solde affiché = **ouverture (settings) + net du ledger** (vérifier cohérence après plusieurs mouvements)

### 1.4 Règlements (settlements)
- [ ] Créer un règlement livreur → `payout_amount` = **Σ driver_payout (snapshot)** + bonus non réglés
- [ ] Le message Telegram détaille cash + 🎁 bonus + total, avec les boutons ✅/❌
- [ ] Confirme (✅) → `confirmed` ; « Mark paid » → notif « as-tu reçu ? » → ✅ → `payment_received`
- [ ] Les bonus du règlement passent `paid_out` au « mark paid »
- [ ] **Bouton Cancel** sur un règlement `proposed`/`confirmed` → il disparaît, commandes/bonus redeviennent réglables
- [ ] Règlement partenaire (par date) → somme des commissions non payées, « mark paid » → `paid_out`
- [ ] Règlement **bonus-only** (livreur sans nouvelle course mais avec un bonus) → passe

---

## P2 — Dashboards (réconciliation)

### 2.1 Finance (`/admin/finance`)
- [ ] « In your pocket » = owner net − pool ; la cascade « Breakdown » réconcilie
      (revenue − COGS − driver − commission = owner net)
- [ ] « Acquisition spend (30d) » ≈ somme commission + remise + crédit des livraisons récentes (depuis le ledger)
- [ ] « Driver pool budget » = solde ledger (= Drivers page)
- [ ] « Active rates » affiche : driver/owner share **of margin**, **owner floor**, commission **on margin**
- [ ] Runway (excl./incl. inventory) cohérent avec `starting_cash` + COD − engagements − stock
- [ ] **Simulateur** : bouge les curseurs → burn/runway projetés bougent ; « unchanged » quand tout est à sa baseline
- [ ] **Zéro texte français** restant sur la page

### 2.2 Earnings (`/admin/earnings`)
- [ ] Owner net (before pool) / In your pocket cohérents avec Finance sur la même période
- [ ] Le graphe 14 jours affiche les bons revenus

---

## P3 — UI / UX (refonte Foundry)

- [ ] **Dark mode** : toggle Soleil/Lune en bas à droite, persiste au reload, **n'affecte pas** le Mini App Telegram (reste clair)
- [ ] Nav en fonte (rail sombre) avec icônes lucide + groupes Operations/Growth/Money/Config
- [ ] Police **Fraunces** (serif) sur les titres et gros chiffres — vérifier qu'elle charge (pas de fallback système)
- [ ] Contraste OK partout (le laiton des petits labels était le point faible — vérifier lisibilité)
- [ ] Boutons : primaire (braise) / secondaire (contour) / destructif (rouge) distincts
- [ ] Responsive mobile : cartes empilées, tiroir nav sombre, tableaux scrollables
- [ ] Page de login : marque serif, champs avec focus visible

---

## Régression & cas limites

- [ ] **Annulation de commande** après livraison partielle : le stock est rendu — mais le **crédit parrainage utilisé n'est PAS remboursé** (gap connu, pré-existant) → à décider
- [ ] Double-tap « Delivered » sur Telegram → pas de double commission / double snapshot (guard `status === delivered`)
- [ ] Commande livrée **sans partenaire** (organique) → pas de commission, snapshot payout quand même écrit
- [ ] Filleul qui commande **avant** l'approbation admin → la réduc s'applique à sa commande **suivante** (pas la 1ʳᵉ) — comportement voulu, à vérifier
- [ ] Concurrence : deux livraisons quasi-simultanées d'un même filleul ne créditent pas le parrain deux fois

---

## Backlog — tests unitaires à AJOUTER

Déjà couvert (pur, `npm test`) : `calculatePayout` (cascade, plancher, promo, owner-livreur),
`resolveFirstTouch`, `isReferrerCreditable`, `poolBalanceFromMovements`.

À ajouter — **pur, facile, forte valeur** :
- [ ] `calculateOrderPricing` (`lib/calculations.ts`) — **aucun test** alors que c'est le
      prix client : livraison gratuite au seuil, 2 paliers de remise, application du crédit
      (jamais > solde, jamais total < 0). Cas chiffrés.
- [ ] `suggestSellPrice` — prix suggéré = `cost / (1 − margin)`.
- [ ] `parsePartnerIdFromNotes` (`lib/settlements.ts`) — extraction `partner:<uuid>`.
- [ ] `getAcquisitionSpend` logique out−in (extraire la somme en fonction pure comme `poolBalanceFromMovements`).

À ajouter — **intégration (plus lourd, nécessite une DB de test ou un mock Supabase)** :
- [ ] `markDelivered` bout-en-bout : snapshot écrit, commission sur marge, mouvements pool, hook parrainage.
- [ ] `createDriverSettlement` : `payout_amount` = Σ snapshot + grants gelés.
- [ ] Flux parrainage complet (approbation → crédit filleul → livraison → crédit parrain), idempotence.
- [ ] `computeEarnings` / `computeFinanceSnapshot` : réconciliation sur un jeu de commandes connu.
- Note infra : mettre en place soit une **base Supabase de test** dédiée, soit un **mock du client**
  `supabaseAdmin` (vitest), pour rendre ces fichiers testables sans prod.

---

*Doc de test uniquement — aucun code applicatif modifié. La math pure est verte
(`npm test`) ; tout le reste ci-dessus reste à valider, en priorité P0 → P3.*
