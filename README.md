# POINTO LLC — Pawnshop

Vite project for POINTO LLC pawnshop. The visible application is `index.html`.

## Local run

1. Copy `.env.example` to `.env` and fill in the Supabase URL and publishable key.
2. Run `npm install`.
3. Run `npm run dev`.

## Supabase

Run `supabase_setup.sql` in Supabase SQL Editor once. The app synchronizes categories, products, prices, sale prices and bonus tiers through Supabase Realtime.

The admin login is the existing frontend login from the original app and does not create a separate Supabase admin account.
