# 🚀 ProFaceApp - Guide d'Action Rapide

## État Actuel ✅

Vous avez maintenant :
- ✅ Base de données Supabase complète avec migration
- ✅ 4 produits Stripe créés avec tarification
- ✅ Webhooks Stripe configurables
- ✅ Système de crédits fonctionnel
- ✅ Documentation complète

## 3 Étapes Critiques pour Tester

### 1️⃣ Configurer les Clés Stripe (5 min)

**Allez sur:** https://dashboard.stripe.com/apikeys

Vous verrez deux sections:
- **PUBLISHABLE KEY** (commence par `pk_test_`)
- **SECRET KEY** (commence par `sk_test_`)

Copie les deux.

**Puis dans Vercel:**
1. Allez à: https://vercel.com/dashboard
2. Selectionnez: `profaceapp-2026-u2zi`
3. Allez à: **Settings** → **Environment Variables**
4. Ajoutez (ce sont les SEULES clés secrètes manquantes):

```
STRIPE_SECRET_KEY = sk_test_VOTRE_CLÉ
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_test_VOTRE_CLÉ
```

Sauvegardez. Vercel redéploiera automatiquement.

### 2️⃣ Configurer le Webhook Stripe (3 min)

**Allez sur:** https://dashboard.stripe.com/webhooks

Cliquez **Add endpoint**

Remplissez:
- **URL:** `https://profaceapp-2026.vercel.app/api/webhooks/stripe`
- **Events:** Cochez ✅ `checkout.session.completed` et ✅ `invoice.payment_succeeded`

Cliquez **Add endpoint**

Vous verrez une nouvelle entrée. Cliquez dessus. Sous **Signing secret**, vous verrez quelque chose comme `whsec_test_...`

Copiez cette clé. Retournez à Vercel et ajoutez:

```
STRIPE_WEBHOOK_SECRET = whsec_test_VOTRE_CLÉ
```

### 3️⃣ Tester le Flux (5 min)

1. Allez à: https://profaceapp-2026.vercel.app
2. **Sign Up** avec email test
3. Connectez-vous au dashboard
4. Cliquez **Buy credits**
5. Choisissez **Starter** ($19) - vous obtiendrez 100 crédits
6. Utilisez la carte de test:
   - **Numéro:** `4242 4242 4242 4242`
   - **Expiration:** N'importe quelle date future (ex: 12/25)
   - **CVC:** N'importe quel 3 chiffres (ex: 123)

7. Complétez le paiement

### ✨ Résultat Attendu

Après le paiement:
- 🟢 Page s'affichera "Payment successful"
- 🟢 Vous verrez **100 crédits** sur votre dashboard
- 🟢 Vous pouvez générer du contenu (10 crédits = 1 photo)

Si les crédits n'apparaissent pas:
- Vérifiez les logs Vercel (Deployments → Logs)
- Cherchez `[stripe-webhook]`
- Vérifiez le webhook dans Stripe Dashboard → Events

---

## 📚 Documentation Complète

- **SETUP_GUIDE.md** - Configuration détaillée
- **STRIPE_WEBHOOK_SETUP.md** - Détails du webhook
- **setup_vercel.py** - Script Python pour configuration automatique
- **scripts/test-stripe-config.js** - Vérifier la configuration

## 🎯 Configuration Déjà Faite

Vous n'avez PAS besoin de faire cela:
- ✅ Produits Stripe créés
- ✅ Plans de prix configurés
- ✅ Supabase migré
- ✅ Code du webhook en place
- ✅ Système de crédits implémenté

---

## 💡 Points Clés

| Élément | Statut | Notes |
|---------|--------|-------|
| Supabase | ✅ Prêt | Migration appliquée |
| Stripe Products | ✅ Prêt | 4 produits créés |
| Stripe Prices | ✅ Prêt | Tous les prix configurés |
| Webhook Code | ✅ Prêt | `/api/webhooks/stripe` |
| Clés Stripe | ❌ À faire | Copier depuis Stripe Dashboard |
| Webhook Stripe | ❌ À faire | Créer endpoint dans Stripe |
| Variables Vercel | ❌ À faire | Ajouter 3 clés manquantes |

---

## 🧪 Exemple de Flux de Paiement

```
User clicks "Buy credits"
         ↓
Goes to Stripe Checkout
         ↓
Enters test card 4242 4242 4242 4242
         ↓
Stripe processes payment ✅
         ↓
Webhook triggered
         ↓
Webhook verifies signature using STRIPE_WEBHOOK_SECRET
         ↓
Webhook adds 100 credits to user in Supabase
         ↓
User sees 100 credits in dashboard ✅
```

---

## 🆘 Dépannage Rapide

**"Impossible d'ajouter les variables Vercel"**
→ Assurez-vous d'être connecté au bon compte

**"Payment échoue"**
→ Vérifiez les clés Stripe sont en mode TEST

**"Crédits n'apparaissent pas"**
→ Vérifiez le webhook dans Stripe Dashboard → Events

**"Webhook 404"**
→ Attendez 2-3 min que Vercel redéploie après ajout des variables

---

## 📞 Besoin de Aide?

1. Vérifiez les logs Vercel
2. Vérifiez les events Stripe
3. Consultez SETUP_GUIDE.md pour détails complets

---

**C'est tout ! Vous êtes maintenant prêt pour tester le système de paiement et de crédits. 🎉**

