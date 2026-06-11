# DivvyUp

A clean, minimal cost-splitter web app for trips, meals, and shared expenses. No accounts, no logins — just a shareable link.

## Features

- **Flexible split types** — even split (check who's included) or custom amounts per person
- **Multi-event trips** — manage a hotel stay, dinners, activities, and more from one page
- **Diagonal grid** — visualize who owes what at every intersection with color-coded statuses
- **Transpose** — flip rows and columns to see the data the way that works for you
- **Hide/show filter** — hide people or events you don't need to see (great on mobile)
- **Tax handling** — set a tax rate per event; mark whether entered amounts include tax
- **Payment tracking** — mark individual shares as paid/unpaid in Payment mode
- **Settlement engine** — see minimized transfer list (who pays who and how much)
- **Three share levels** — Owner link (full access), Edit link (amounts only), View-only link
- **Fork a copy** — view-only users can fork a trip to make their own editable copy
- **Duplicate events** — quickly clone a hotel night to build out a multi-night stay
- **No database server needed** — runs on a single SQLite file

## Tech Stack

- **[SvelteKit](https://kit.svelte.dev/)** — full-stack framework (Svelte 5)
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** — fast, synchronous SQLite driver
- **[Tailwind CSS v4](https://tailwindcss.com/)** — utility-first styling
- **[@sveltejs/adapter-node](https://kit.svelte.dev/docs/adapter-node)** — production Node.js deployment

## Getting Started

### Requirements

- Node.js 20+ (or Bun 1.x)
- npm / pnpm / bun

### Install & run

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

### Production build

```bash
npm run build
node build/index.js
```

The server listens on port `3000` by default. Set `PORT=XXXX` to change it.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `./divvyup.db` | Path to the SQLite database file |
| `PORT` | `3000` | Port for the production server |
| `HOST` | `0.0.0.0` | Host to bind to |

## Deployment (Nginx reverse proxy)

1. Build and start the server (e.g., via `systemd` or `pm2`):
   ```bash
   npm run build
   DATABASE_PATH=/var/data/divvyup.db PORT=3000 node build/index.js
   ```

2. Add an Nginx site config:
   ```nginx
   server {
       listen 80;
       server_name divvyup.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Add HTTPS via Certbot/Let's Encrypt.

## How It Works

### Access levels & links

Each trip generates three tokens at creation:

| Link | Access |
|---|---|
| **Owner link** | Add/remove people and events, change all amounts, mark payments |
| **Edit link** | Update amounts and mark payments — cannot restructure the trip |
| **View-only link** | Read-only; can fork a copy to start their own editable version |

There are no accounts. **Keep your owner link safe** — it's the only way to regain access to your trip.

### Split types

**Even split** — Check a box for each person who participated. The event's total is divided equally among all checked participants. Great for hotel nights, shared Ubers, etc.

**Custom amounts** — Enter each person's individual share. Supports a tax percentage that can be applied automatically if an amount doesn't include tax. Use "Auto-fill remaining" to split whatever's left after entering the known amounts.

### Settlement

The Settlement tab shows:
- Each person's net balance (how much they're owed or owe)
- A minimized list of transfers to settle all debts in as few transactions as possible
- A per-event breakdown showing each person's share and paid/unpaid status

Only **unpaid** cell statuses count toward the outstanding settlement — mark cells as paid as people Venmo/transfer funds to the person who fronted the bill.

## Contributing

PRs and issues welcome. This project is intentionally minimal — new features should fit the "no-accounts, shareable link" model.

## License

MIT
