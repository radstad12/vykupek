# POINTO LLC — Pawnshop

GitHub Pages-ready POINTO LLC pawnshop MVP.

## GitHub Pages

1. Push/Upload **all files and folders** in this repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push to `main` (or run the workflow manually in **Actions**).
5. The site will be available at:
   `https://radstad12.github.io/pawnshop/`

## Important

The public calculator works in demo mode without Supabase.
For real admin login, database products, hidden prices and bonus rules, connect Supabase and add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

to the GitHub Actions environment/secrets.
