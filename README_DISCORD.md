
# POINTO LLC — Pawnshop + Discord OAuth / Tickets

Tato verze přidává:

- povinné přihlášení přes Discord před použitím webu,
- načtení Discord rolí uživatele,
- produkty dostupné jen pro konkrétní Discord roli,
- bonus v % navázaný na Discord roli,
- tlačítko **Objednat výkup** pod orientační cenou,
- automatické vytvoření Discord ticketu,
- do ticketu se zapíšou produkty, počty, ceny, bonus a výsledná orientační částka.

## Důležitá věc

GitHub Pages neumí bezpečně držet Discord `CLIENT_SECRET` ani bot token.
Proto je přiložený `backend/worker.js`, který musí běžet na serveru, například jako Cloudflare Worker.

### 1. Supabase

Spusť:

- `supabase_setup.sql` pro nový projekt, nebo
- `supabase_discord_migration.sql` pro existující databázi.

Nová pole:

- `products.required_role_id`
- `bonuses.discord_role_id`

### 2. Discord Developer Portal

Vytvoř Discord application + bot.

OAuth2 redirect URL musí být přesně:

`https://TVUJ-WORKER.workers.dev/auth/callback`

OAuth scope potřebuje `identify`.

Bot musí být na serveru a mít minimálně oprávnění:

- View Channels
- Send Messages
- Read Message History
- Manage Channels

Doporučené je botovi dát tuto sadu oprávnění pouze v ticket kategorii / serveru, kde to potřebuje.

### 3. Cloudflare Worker variables

Nastav Worker secrets/variables:

```text
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_TICKET_CATEGORY_ID=
DISCORD_ADMIN_ROLE_ID=
DISCORD_REDIRECT_URI=https://TVUJ-WORKER.workers.dev/auth/callback
FRONTEND_URL=https://radstad12.github.io/vykupek/
SESSION_SECRET=
SUPABASE_URL=https://rhewjraklopujpssayzg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

`SESSION_SECRET` musí být dlouhý náhodný řetězec.

**Nikdy nedávej `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` ani Supabase service-role key do GitHub Pages nebo `index.html`.**

### 4. Frontend API URL

V `index.html` najdi:

```js
window.POINT0_DISCORD_API = 'https://YOUR-WORKER.workers.dev';
```

a nahraď adresou svého Workeru.

### 5. Role

U produktu je nové pole:

**Discord role ID pro zobrazení produktu**

- prázdné = produkt vidí každý přihlášený uživatel,
- vyplněné ID = produkt vidí jen uživatel s touto rolí.

U bonusové úrovně je nové pole:

**Discord role ID**

Pokud má uživatel tuto roli, backend mu použije nastavené procento bonusu.

Pokud má více rolí, vezme se nejvyšší odpovídající role bonus. Současně se porovnává i běžný bonus podle částky a použije se vyšší z obou.

### 6. Ticket

Po kliknutí na **Objednat výkup** backend znovu ověří:

- Discord uživatele,
- jeho role,
- zda jsou produkty aktivní,
- zda má na ně potřebné role,
- aktuální výkupní ceny,
- aktuální bonus.

Teprve potom vytvoří ticket v `DISCORD_TICKET_CATEGORY_ID`.

Tím se nedá jednoduše podvrhnout cena z prohlížeče.

## Poznámka k původnímu admin systému

Původní projekt obsahoval admin heslo přímo v `index.html` a veřejné Supabase write policies. To není bezpečný produkční admin systém.

Pro Discord zákaznické přihlášení to není potřeba, ale před veřejným provozem doporučuji admin část také převést na serverové ověření Discord admin role a odstranit veřejné write policies.
