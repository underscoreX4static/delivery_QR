# AUDIT_FINANCE — Cartographie du modèle de monétisation actuel

> Rapport read-only. Aucun fichier applicatif modifié. État du repo au 2026‑07‑10.
> Objet : documenter l'existant (commissions, pool, attribution, settlements) avant refonte.
>
> ⚠️ Limite : cet audit lit **le code**, pas la base de production. Je n'ai pas
> d'accès aux données live (voir §5). Tout ce qui concerne les volumes réels est
> déduit du schéma, pas mesuré.

---

## 0. TL;DR — les 6 vérités à retenir

1. **La commission est calculée sur le CA (`order.total`), pas sur la marge.** Un seul site de calcul : `lib/orders.ts` → `markDelivered()` ligne 127.
2. **La commission EST déjà prélevée sur la part owner** (`ownerNet = margeBrute×0.62 − commission`), pas sur la part livreur. Ça, c'est déjà aligné avec la cible.
3. **Il existe un pool auto-financé, mais c'est un pool de BONUS LIVREURS**, pas un pool d'acquisition. Alimenté par `ownerNet × bonus_pool_rate` à chaque livraison. Stocké dans une **ligne `settings`** (`driver_pool_balance`), pas une table dédiée.
4. **L'attribution n'est pas first-touch exclusive.** La commission suit `orders.qr_code_id` (le QR de la commande), pas `users.first_qr_source` (le premier QR du client, qui existe mais n'est utilisé nulle part pour l'argent).
5. **Aucun plancher owner.** `ownerNet` / `ownerTakeHome` peuvent devenir négatifs, rien ne les borne.
6. **Le crédit de parrainage est débloqué à l'approbation admin** (immédiatement crédité au solde), pas après la première commande livrée du filleul.

Toute la math d'argent est centralisée dans **`lib/calculations.ts`** (imposé par une règle explicite en tête de fichier). Les commissions sont **gelées en snapshot** par commande → un changement de règle est **forward-only** sauf recalcul explicite.

---

## 1. Entités & schéma

Pas d'ORM : accès direct via le query builder `@supabase/supabase-js` sur `supabaseAdmin` (service_role, bypass RLS). Schéma défini dans `CLAUDE.md` (migrations 001–005) + `supabase/migrations/007_driver_pool_grants.sql`. La 008 (dispatch) ne touche pas à l'argent.

### 1.1 Tables liées à l'argent

| Table | Champs monétaires clés | Rôle |
|---|---|---|
| **orders** | `delivery_fee`, `subtotal`, `discount`, `total` (decimal 10,2), `qr_code_id`, `driver_id`, `user_id`, `status` (enum) | La commande. **Ne stocke ni marge ni coût.** |
| **order_items** | `unit_sell_price`, `unit_cost_price`, `quantity`, `line_total`, `batch_id` | **Le COGS vit ici** (une ligne par batch consommé, FIFO). |
| **product_batches** | `cost_price`, `sell_price`, `quantity_remaining`, `is_active` | FIFO. `stockValue = Σ quantity_remaining × cost_price` (BFR). |
| **partners** | `commission_rate` (decimal 5,4), `first_sale_bonus_amount`, `welcome_bonus_trigger_orders`, `first_sale_bonus_paid`, `telegram_id`, `is_active` | L'affilié / commercial. |
| **qr_codes** | `partner_id`, `slug` | Dispositif d'attribution (1 partenaire → N QR). |
| **qr_scans** | `qr_code_id`, `user_id`, `telegram_user_id`, `scanned_at` | Journal d'attribution (log). |
| **users** | `credit_balance` (decimal), `referral_code`, `referred_by`, `first_qr_source` | **Seul "wallet" client = `credit_balance`** (crédit parrainage). `first_qr_source` = first-touch capturé mais **inutilisé pour l'argent**. |
| **drivers** | `is_owner`, `is_active`, `bonus_pool_balance` (**LEGACY, vestige**), `telegram_id` | Livreur. `bonus_pool_balance` par-livreur n'est plus alimenté depuis la 007. |
| **affiliate_commissions** | `partner_id`, `order_id`, `order_total`, `commission_rate` (**snapshot**), `commission_amount` (**snapshot**), `paid_out`, `paid_out_at` | **Le grand livre des commissions.** Gelé par commande. |
| **settlements** | `type` (`driver`\|`partner`), `status` (`proposed`→`confirmed`→`paid`→`payment_received`), `driver_id`, `total_cash`, `payout_amount`, `notes`, timestamps | Agrégat de versement. Pour les partenaires : `driver_id` NULL, partenaire encodé dans `notes` = `"partner:<uuid>"`. |
| **settlement_orders** | (`settlement_id`, `order_id`) | Join. **Gèle** l'ensemble des commandes/commissions couvertes par un règlement. |
| **driver_bonus_grants** *(mig. 007)* | `driver_id`, `amount`, `note`, `paid_out`, `paid_out_at`, `settlement_id` | Bonus livreur **discrétionnaires** tirés du pool. |
| **driver_bonuses** | `driver_id`, `milestone_orders`, `bonus_amount`, `paid_out` | **LEGACY** — paliers auto, **plus attribués** (remplacés par grants). |
| **referrals** | `referrer_id`, `referred_id`, `status` (`pending`\|`approved`\|`rejected`), `reward_amount` (**snapshot**), `reviewed_at`, `reviewed_by` | Parrainage. |
| **settings** (k/v) | `bonus_pool_rate`, `referral_reward_amount`, `starting_cash`, **`driver_pool_balance`**, `delivery_fee`, `free_delivery_threshold`, `discount_threshold[_2]`, `discount_rate[_2]` | **Le "pool" et tous les taux vivent ici, en texte.** |

### 1.2 Ce qui N'EXISTE PAS (important pour la refonte)

- **Aucune table `Pool` / `Wallet` / `Ledger` dédiée.** Le pool est une ligne `settings` (compteur mutable). Le seul wallet est `users.credit_balance`.
- **Aucune table d'attribution** au-delà de `qr_codes` / `qr_scans` / `orders.qr_code_id` / `users.first_qr_source`.
- **Aucune notion de plancher owner**, de pool d'acquisition, ni de compte de trésorerie (juste `settings.starting_cash`, saisi à la main).
- **Aucun système i18n** (voir §6). Strings en dur, FR/EN mélangés.

### 1.3 Diagramme de dépendances (texte)

```
users ──< orders >── qr_codes ──> partners
  │         │  │                     │
  │         │  └──< order_items >── product_batches
  │         │        (COGS ici)
  │         │
  │         ├──> affiliate_commissions ──> partners        (snapshot commission)
  │         ├──< settlement_orders >── settlements
  │         └──> drivers
  │
  ├──> referrals (referrer/referred)      users.credit_balance = wallet
  └──> users.first_qr_source ─(inutilisé pour $)─> qr_codes

drivers ──< driver_bonus_grants >── settlements   (bonus discrétionnaires)
drivers ──< driver_bonuses (LEGACY, mort)

settings(k/v): driver_pool_balance  ← contributeToPool()  (le "pool")
               bonus_pool_rate, referral_reward_amount, starting_cash, tarifs
```

Flèche `A ──> B` = A référence B (clé étrangère ou usage logique).

---

## 2. Le flux de l'argent (le plus important)

Source unique de vérité : **`lib/calculations.ts`** (interdiction, en commentaire ligne 3, de faire de la math d'argent ailleurs).

### 2.1 Décomposition du CA — `calculatePayout()` (`lib/calculations.ts:84‑108`)

```
revenue        = order.total
grossProfit    = order.total − costOfGoods            (costOfGoods = Σ unit_cost_price×qty)
driverPayout   = isOwner ? 0 : delivery_fee + grossProfit × 0.38     (DRIVER_PAYOUT_SHARE)
affiliateCommission = snapshot gelé, sinon order.total × partner.commission_rate
ownerNet       = grossProfit × 0.62 − affiliateCommission            (OWNER_PROFIT_SHARE)
```

- **Livreur** : frais de livraison + 38 % de la marge brute. (Owner-livreur → 0, il garde tout.)
- **Owner** : 62 % de la marge brute, **moins** la commission. → la commission est bien **prélevée sur la part owner**.
- **Taux en dur** : `DRIVER_PAYOUT_SHARE = 0.38`, `OWNER_PROFIT_SHARE = 0.62` (`calculations.ts:7‑8`). Pas dans `settings`.
- **⚠️ Quirk** : `driverPayout` ajoute `delivery_fee` **par-dessus** 38 % d'une `grossProfit` qui **contient déjà** `delivery_fee` (car `total` inclut la livraison). Le frais de livraison est donc compté deux fois côté livreur. À vérifier lors de la refonte.
- **Pas de plancher** : `ownerNet` peut être négatif (aucun `Math.max`).

### 2.2 Où et quand la commission est CALCULÉE puis VERSÉE

| Étape | Fichier / fonction | Détail |
|---|---|---|
| **Prix à la commande** | `lib/calculations.ts` → `calculateOrderPricing()` (`:41`) | Frais livraison (gratuit ≥ seuil), 2 paliers de remise, crédit parrainage appliqué en dernier. Gelé dans `orders` + COGS gelé dans `order_items.unit_cost_price` (FIFO à la création). |
| **CALCUL commission** | `lib/orders.ts` → `markDelivered()` **ligne 127** | `commissionAmount = round2(order.total × partner.commission_rate)`. **Base = `order.total` (CA), déclencheur = livraison.** Partenaire résolu via `order.qr_code_id → qr_codes.partner_id`. |
| **ÉCRITURE commission** | `lib/orders.ts:138‑144` | Insert `affiliate_commissions` avec `commission_rate` + `commission_amount` **snapshotés**. Idempotent (no-op si déjà `delivered`). |
| **Welcome bonus** | `lib/orders.ts:146‑151` | À la Nᵉ commission (`welcome_bonus_trigger_orders`), notif Telegram. `first_sale_bonus_paid` marqué à la main plus tard. |
| **Contribution au pool** | `lib/orders.ts:161‑192` | Si livreur ≠ owner : `contribution = ownerNet × bonus_pool_rate` → `contributeToPool()` (incrémente `settings.driver_pool_balance`). |
| **VERSEMENT commission** | `lib/settlements.ts` → `createPartnerSettlement()` (`:173`) puis `markSettlementPaid()` (`:267`) | On-demand par date. Somme les `affiliate_commissions` non payées, les gèle dans `settlement_orders`, puis `paid_out=true` au « mark paid ». Pas de boucle Telegram. |

**Base et taux, en clair :**
- Commission = **CA × taux partenaire** (le taux est un `decimal(5,4)` par partenaire, ex. `0.05`). **Pas la marge.**
- Elle est **soustraite de la part owner** dans `ownerNet` — donc « prélevée sur la part owner » ✅, mais « sur la marge » ❌ (c'est sur le CA).

### 2.3 Comment les settlements agrègent

- **Livreur** (`createDriverSettlement`, `settlements.ts:43`) : toutes les commandes livrées non encore réglées → `cashShare = Σ driverPayout` ; + `driver_bonus_grants` non réglés. `total_cash = Σ order.total`, `payout_amount = cashShare + grants`. Boucle Telegram confirm/dispute → `paid` → « as-tu reçu ? » → `payment_received` (verrouillé). Les grants passent `paid_out` au « mark paid ».
- **Partenaire** (`createPartnerSettlement`, `settlements.ts:173`) : somme des commissions non payées sur une plage de dates → `confirmed` direct → « mark paid » ⇒ `paid_out=true` sur les commissions gelées.
- **Gel** : `settlement_orders` fige l'ensemble couvert à la création, pour qu'une commission créée après ne « fuite » pas dans un règlement déjà revu (`settlements.ts:165‑171`, `282‑298`).

### 2.4 Pool, attribution, plancher owner — état réel

- **Pool** : ✅ existe et ✅ auto-financé (`contributeToPool` à chaque livraison), **mais** c'est un **pool de bonus livreurs**, budget global unique (`settings.driver_pool_balance`), alimenté par `ownerNet × bonus_pool_rate`. **Ce n'est pas un pool d'acquisition** et il ne finance ni parrainages ni promos. L'owner y pioche des bonus discrétionnaires (`driver_bonus_grants`).
- **Attribution** : `users.first_qr_source` capture le first-touch (au `/start` avec payload QR), **mais n'est utilisé nulle part pour l'argent**. La commission suit `orders.qr_code_id` (le QR de *cette* session/commande). → attribution **par commande**, pas **first-touch exclusive client**.
- **Plancher owner** : ❌ inexistant.

---

## 3. La page Finance

### 3.1 Fichiers

| Couche | Fichier |
|---|---|
| Front (client) | `components/admin/FinanceBoard.tsx` (+ `EarningsBoard.tsx`) |
| Page | `app/admin/finance/page.tsx`, `app/admin/earnings/page.tsx` |
| Endpoint | `app/api/admin/finance/route.ts` → `lib/finance.ts` `computeFinanceSnapshot()` ; `app/api/admin/earnings/route.ts` → `lib/earnings.ts` `computeEarnings()` |

### 3.2 Serveur vs client

- **Serveur = toute la math d'argent.** `lib/finance.ts` est un *read-model* : il ne fait **aucune** math propre, tout passe par `calculatePayout` (commentaire `finance.ts:13‑22`). Il calcule : trésorerie (cash déclaré + COD en transit − engagements − stock/BFR), pools engagés, taux, burn 30j, runway, bases du simulateur.
- **Client = affichage + simulateur.** Le simulateur (`FinanceBoard.tsx`, composant `Simulator`) **re-scale** des baselines hebdo (`simBasis`) par les valeurs de curseurs — pure arithmétique de projection, pas de source de vérité. Formatage `money()` / `pct()` côté client.
- **Nuance assumée** : les figures finance sont « decision-grade, pas audit-grade » (contribution pool historique estimée au **taux courant**, cf. `earnings.ts:15‑19`).

### 3.3 Langue — la page est en FRANÇAIS (strings à traduire)

Pas de système i18n : tout est en dur. `FinanceBoard.tsx` est massivement en français ; l'en-tête de page est passé en anglais lors de la refonte UI. Inventaire (non exhaustif, `FinanceBoard.tsx` + `EarningsBoard.tsx`) :

- Runway : `Runway — sans BFR`, `Runway — avec BFR`, `Cash libre, stock traité comme du cash`, `Cash libre, stock immobilisé retiré`, `de cash libre`
- Trésorerie : `Trésorerie — cascade`, `Cash déclaré`, `+ COD chez les livreurs`, `= Trésorerie brute`, `− Engagements à payer`, `= Dispo (sans BFR)`, `− Stock immobilisé`, `= Dispo réel (avec BFR)`, `Crédits parrainage en circulation … passif futur (remises à venir), non retiré du cash`
- Pools : `Argent engagé (pools)`, `Budget pool livreurs (dispo à donner)`, `Bonus livreurs attribués, non payés`, `Commissions commerciales dues`, `Primes de bienvenue dues`, `COD à encaisser (part owner)`, `Total engagé (hard)`, `« Provisionné » et « en circulation » ne sont pas des sorties fermes…`
- Rentabilité : `Rentabilité`, `Dans la poche (owner net après pool)`, `Bénéf owner (avant pool)`, `− Mis dans le pool livreurs`
- Répartition : `Répartition — clôture du jour` / `Répartition de la période`, `Où va chaque dollar de CA livré sur la période…`, `CA livré (encaissé)`, `− Coût des produits`, `= Profit brut`, `− Part livreurs (38% + livraison)`, `− Commissions commerciaux`, `= Bénéf owner`, `− À mettre dans le pool livreurs`, `= Dans ta poche`
- Taux : `Taux actifs`, `Part livreur (du profit brut)`, `Part owner (du profit brut)`, `Cagnotte livreur (du net owner)`, `Commission moyenne commerciaux`, `Parrainage (par côté)`, `Livraison gratuite dès`, `Remise paliers … dès …`
- Simulateur : `Simulateur — jusqu'où je pousse ?`, `Cagnotte livreur`, `Parrainage / côté`, `Promo sur le CA (nouveau)`, `Burn / week projeté`, `Runway sans BFR`, `Runway avec BFR`, `inchangé`, `vs actuel`, `Bouge les curseurs… Simulation pure…`, `les réglages`
- Earnings : `Owner net (avant pool)`, `mis dans le pool livreurs`, `Dans la poche`, `Ce qui te reste après avoir financé le pool`

*(Les autres pages admin sont plutôt en anglais — mélange FR/EN généralisé dans l'app.)*

---

## 4. Points de couplage & risques

### 4.1 Qui LIT les montants (commission / settlement / payout)

| Donnée | Lecteurs (fichier) |
|---|---|
| `calculatePayout()` | `lib/orders.ts`, `lib/earnings.ts`, `lib/finance.ts`, `lib/settlements.ts`, `app/api/admin/drivers/[id]/route.ts` (stat « total payout earned » du livreur) |
| `affiliate_commissions` / `commission_amount` | écrit : `lib/orders.ts` — lu : `lib/earnings.ts`, `lib/finance.ts`, `lib/settlements.ts`, `app/api/admin/partners/route.ts` (dû par partenaire), `app/api/admin/partners/[id]/route.ts` (détail + « welcome bonus earned »), `app/api/telegram/route.ts` (`/mystats` commercial) |
| `payout_amount` / `total_cash` | uniquement `lib/settlements.ts` (+ `SettlementsBoard.tsx` pour l'affichage) |
| `users.credit_balance` | écrit : `lib/referrals.ts` — lu : `lib/finance.ts` (float), `app/api/cart/preview/route.ts` + `app/api/orders/route.ts` (appliqué au checkout), `app/api/telegram/route.ts` |
| `bonus_pool_rate` / `driver_pool_balance` | `lib/settings.ts`, `lib/calculations.ts`, `lib/orders.ts`, `lib/earnings.ts`, `lib/finance.ts`, `lib/driver-pool.ts`, `app/api/admin/settings/route.ts`, `app/api/admin/drivers/[id]/route.ts`, `app/api/admin/driver-pool/route.ts` |
| `computeEarnings` / `computeFinanceSnapshot` | `app/api/admin/earnings/route.ts`, `app/api/admin/finance/route.ts` |

Pas de cron financier (le seul cron est `app/api/cron/inventory-refresh`). Pas d'export comptable / de flux de paiement externe (COD only).

### 4.2 Où un changement de règle a un effet de bord

- **Changer `calculatePayout` (les 38/62, le plancher, la base commission)** ripple sur **6 fichiers** + tous les dashboards + `payout_amount` des settlements + la stat livreur. C'est le point le plus central.
- **Changer la base commission (CA → marge)** touche l'écriture (`markDelivered:127`) ET la sémantique des colonnes gelées (`order_total`, `commission_amount`). Comme tous les lecteurs consomment le **snapshot** (`affiliateCommissionOverride`), l'historique reste cohérent, mais **forward-only**.
- **Changer le point de déduction** (déjà sur l'owner) : peu d'impact, c'est déjà le cas.
- **Changer le pool** (le rendre « acquisition » vs « bonus livreurs ») : la plomberie existe (`contributeToPool`, `finance.ts` pools) mais est **scoping livreur** ; renommer/redéfinir touche `settings` copy, `driver-pool.ts`, `finance.ts`, `earnings.ts`.
- **Attribution first-touch** : nécessite de basculer le rattachement commission de `orders.qr_code_id` vers `users.first_qr_source`, dans la création de commande + `markDelivered`.

---

## 5. Données existantes & migration

**Je ne peux pas interroger la base de prod depuis cet environnement** (pas de credentials). Constats déduits du code :

- Les commandes / commissions / settlements / grants sont des **tables persistées** ; s'il y a du trafic réel, elles contiennent de l'historique.
- **Les commissions sont des snapshots gelés** (`commission_rate` + `commission_amount` par ligne). Conséquence directe pour la refonte :
  - Changer la **base** ou le **taux** de commission n'affecte que les commandes **livrées après** le changement (`markDelivered` calcule à la livraison). L'historique reste tel quel.
  - Les dashboards (earnings/finance) lisent le snapshot → l'historique reste **auto-cohérent** sans rien faire. Un **recalcul d'historique serait une migration délibérée** (réécriture des `affiliate_commissions`, potentiellement des `settlements` déjà `paid`).
- **Le pool est un compteur mutable** (`settings.driver_pool_balance`) : pas d'historique de mouvements. Changer la règle du pool ne recalcule rien rétroactivement ; il faudrait décider quoi faire du solde courant.
- **Migrations manuelles** : il n'y a pas de runner de migration ; le SQL se lance à la main dans Supabase. `007` (grants) doit être appliquée pour que le pool marche — **statut d'application en prod inconnu**. `008` (dispatch) n'est pas liée à l'argent.
- **Colonne morte** : `drivers.bonus_pool_balance` (per-livreur) subsiste mais n'est plus alimentée — à nettoyer ou à réutiliser.

**Recommandation** : traiter la refonte comme **forward-only** par défaut (nouvelles règles à partir d'une date), et ne prévoir un recalcul d'historique que si un besoin comptable l'exige — ce serait une migration séparée, à écrire et tester à part.

---

## 6. Stack

| Élément | Détail |
|---|---|
| Framework | **Next.js 16.2.10**, App Router. React 19.2.4. |
| Langage | **TypeScript** (strict, `no any`). |
| Base de données | **PostgreSQL via Supabase.** Accès `@supabase/supabase-js` ^2.110 + `@supabase/ssr` ^0.12. |
| ORM | **Aucun.** Query builder Supabase direct, client `supabaseAdmin` service_role (bypass RLS). RLS = policies `no_access` sur toutes les tables. |
| Migrations | SQL manuel (Supabase SQL editor). `CLAUDE.md` (001–005) + `supabase/migrations/007`, `008`. Pas de runner. |
| i18n | **Aucun système.** Strings en dur, FR/EN mélangés. À introduire si internationalisation voulue. |
| UI | Tailwind v4, recharts (graphes), lucide-react (icônes). Thème « Foundry » clair + toggle dark admin-only. |
| Telegram | `node-telegram-bot-api` (types) + wrapper `fetch` maison (`lib/telegram.ts`). Webhook unique `app/api/telegram/route.ts`. |
| Math d'argent | **Centralisée `lib/calculations.ts`** (règle explicite). |
| Cron | 1 seul : `app/api/cron/inventory-refresh` (inventaire, pas d'argent). |

---

## 7. Contradictions entre l'existant et la cible

Cible visée : **commission sur la MARGE** (pas le CA) · prélevée sur la **PART OWNER** · **pool auto-financé** (acquisition) · **attribution exclusive first-touch** · **plancher owner incompressible** · **parrainage en crédit débloqué tardivement**.

| # | Point cible | État actuel | Fichier(s) concerné(s) | Ampleur |
|---|---|---|---|---|
| 1 | **Commission sur la MARGE** | ❌ Sur le **CA** : `order.total × rate` | `lib/orders.ts:127` (calcul) ; `lib/calculations.ts:96` (fallback) ; colonne `affiliate_commissions.order_total` (sémantique) | **Moyen.** Un seul site d'écriture, mais snapshots gelés → forward-only + à réétiqueter les colonnes. |
| 2 | **Prélevée sur la part OWNER** | ✅ Déjà le cas : `ownerNet = marge×0.62 − commission` | `lib/calculations.ts:98` | **Faible.** Aligné ; à préserver lors du passage base CA→marge. |
| 3 | **Pool auto-financé (acquisition)** | ⚠️ Pool auto-financé oui, **mais bonus LIVREURS**, pas acquisition ; ne finance ni parrainages ni promos | `lib/orders.ts:161‑192`, `lib/driver-pool.ts`, `settings.driver_pool_balance`, `lib/finance.ts` (pools) | **Moyen.** Plomberie réutilisable, mais scope + sémantique à redéfinir (pool livreur ≠ pool acquisition). Décider du sort du solde courant. |
| 4 | **Attribution exclusive first-touch** | ❌ Par commande via `orders.qr_code_id` ; `users.first_qr_source` (first-touch) capturé mais **inutilisé pour l'argent** | `lib/orders.ts:112‑127` (résolution partenaire), création de commande (`app/api/orders/route.ts`) | **Moyen‑élevé.** Basculer la source d'attribution + verrouiller le first-touch ; réviser la règle de rattachement commission. |
| 5 | **Plancher owner incompressible** | ❌ Aucun ; `ownerNet`/`ownerTakeHome` peuvent être négatifs | `lib/calculations.ts:98` (+ propagation partout) | **Moyen.** Ajouter un clamp/priorité dans `calculatePayout` ripple sur tous les lecteurs et les settlements. |
| 6 | **Crédit parrainage débloqué tardivement** | ❌ Crédité **à l'approbation admin** (immédiat), pas après 1ʳᵉ commande livrée du filleul | `lib/referrals.ts` (`approveReferral` → `adjustCreditBalance`) | **Faible‑moyen.** Localisé à `referrals.ts` + un hook dans `markDelivered` (déblocage à la 1ʳᵉ livraison du filleul). |

### Contradictions structurelles annexes

- **Collision de nommage « pool »** : le libellé Settings parle de bonus commercial dans certaines versions du texte, mais le code = pool **livreur**. À clarifier avant d'introduire un pool d'acquisition.
- **Pas de tables `Pool` / `Wallet` / `Ledger`** : tout tient dans `settings` (k/v mutable) et `users.credit_balance`. Un modèle de monétisation plus riche (mouvements auditables, plusieurs pools) demandera probablement de **vraies tables de ledger**.
- **Quirk `delivery_fee` double-compté** côté livreur (`calculations.ts:89‑91`) — à trancher pendant la refonte des parts.
- **Taux de parts (38/62) en dur** dans `calculations.ts`, pas dans `settings` — les rendre configurables si la refonte veut les piloter.
- **`bonus_pool_rate` = % de l'`ownerNet`** (post-commission), donc l'ordre des prélèvements (commission puis pool) est déjà « en cascade sur la part owner » — cohérent avec la cible, à conserver explicitement.

---

*Fin de l'audit. Aucun fichier applicatif modifié — seul `AUDIT_FINANCE.md` a été créé.*
