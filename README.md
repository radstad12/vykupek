# POINTO Pawnshop

Verze napojená na Supabase.

## Spuštění

1. Otevři tuto složku ve VS Code.
2. V Terminalu spusť:

```bash
npm install
npm run dev
```

Projekt už obsahuje `.env` s nastavením Supabase. Pro GitHub používej `.env.example`; skutečný `.env` je v `.gitignore`.

## Supabase

Databáze používá tabulky `categories`, `products` a `bonuses`. Synchronizace probíhá přes Supabase Realtime.

Admin přihlášení zůstává součástí aplikace. Supabase se používá jako centrální úložiště dat.
