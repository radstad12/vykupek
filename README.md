# POINTO LLC — Firebase

Tahle verze už nepoužívá Supabase ani starý `localStorage` katalog jako hlavní databázi.

## Co používá

- Firebase Authentication — přihlášení administrátora
- Cloud Firestore — produkty, kategorie, bonusy
- Firebase Storage — fotografie produktů
- Firestore realtime listeners — změny se zobrazí ostatním bez ručního importu

## Důležitá věc

Soubor `src/initial-products.json` obsahuje všech **46 původních produktů** včetně původních obrázků.
`src/initial-categories.json` obsahuje původních **7 kategorií**.

Při prvním přihlášení administrátora:

1. aplikace zkontroluje, jestli je Firestore kolekce `products` prázdná,
2. pokud ano, vezme 46 produktů z `src/initial-products.json`,
3. base64 fotografie nahraje do Firebase Storage,
4. vytvoří plný admin záznam v `products`,
5. vytvoří veřejný záznam v `products_public`,
6. veřejný záznam neobsahuje `sale_price`,
7. od té chvíle je Firebase hlavní zdroj dat.

Pokud jsou v prohlížeči ještě starší data v `localStorage` (`pointo_products_v2` / `pointo_categories_v1`), použijí se před zabudovaným importem. Tím se zachovají data z původního webu.

## Firebase Console

V projektu `p-key-a3w68ys6itda` je potřeba:

### 1. Authentication

Authentication → Sign-in method → **Email/Password → Enable**

Potom Authentication → Users → vytvoř admin účet.

### 2. Firestore

Vytvoř Cloud Firestore Database.

Potom publikuj pravidla z:

`firebase/firestore.rules`

### 3. Storage

Vytvoř Firebase Storage.

Potom publikuj pravidla z:

`firebase/storage.rules`

### 4. Lokální spuštění

```bash
npm install
npm run dev
```

### 5. Build pro GitHub Pages

```bash
npm run build
```

Vite je nastavený na:

`/pawnshop/`

## GitHub Pages

Do repozitáře nahraj celý obsah projektu a používej GitHub Pages přes GitHub Actions/Vite build.

## Jak se chová katalog

Admin:
- přidá produkt → uloží se do Firebase,
- změní cenu → uloží se do Firebase,
- změní obrázek → uloží se do Firebase Storage,
- skryje produkt → `active=false`,
- označí `admin_item` → veřejný katalog ho nezobrazí,
- upraví kategorii → uloží se do Firebase.

Zákazníci:
- načítají `products_public`,
- změny dostávají realtime,
- nečtou `products`, kde je interní `sale_price`,
- `sale_price` se do `products_public` vůbec nekopíruje.

## Firebase konfigurace

Konfigurace je už vložená v `src/firebase.js` podle údajů dodaných pro projekt:

`p-key-a3w68ys6itda`
