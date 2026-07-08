# DivvyUp

A clean, minimal cost-splitter web app for trips, meals, and shared expenses. No accounts, no logins — just a shareable link.

**Live demo:** [divvy.chibbluffy.fyi](https://divvy.chibbluffy.fyi)

## Features

- **Flexible split types** — even split (check who's included) or custom amounts per person
- **Custom expressions** — enter amounts as `7.99+17.99+3.25` and the app evaluates them; expressions are preserved and shown in the settlement breakdown
- **Multi-event trips** — manage a hotel stay, dinners, activities, and more from one page
- **Sub-items** — split an event into grouped sub-items (e.g. hotel nights), each with their own cost
- **Drag-and-drop reordering** — reorder events in the grid to match any grouping you like
- **Receipt images** — attach photo receipts to any event; viewable from both the grid and the settlement page
- **Assign remaining tip** — after assigning custom amounts, distribute the remaining balance (e.g. tip) among selected people with one button; appends to existing expressions
- **Tax handling** — set a tax rate per event; mark whether entered amounts already include tax
- **Diagonal grid** — visualize who owes what at every intersection
- **Transpose** — flip rows and columns to see the data the way that works for you
- **Hide/show filter** — hide people or events you don't need to see (great on mobile)
- **Dark mode** — toggle between light and dark themes
- **Payment tracking** — mark individual shares as paid/unpaid in Planner mode
- **Settlement engine** — minimized transfer list (who pays who and how much), with per-event expression breakdowns and receipt thumbnails
- **Group payments** — mark one person as the lead for a group; their shares are combined in settlement
- **Direct payment log** — record cash/Venmo payments on the Settlement tab to track what's been settled
- **Three access levels** — Owner (full access), Edit (amounts only), View-only (read + fork)
- **Fork a copy** — view-only users can fork the trip to make their own editable copy
- **Duplicate events** — quickly clone an event or entire sub-item group
- **No database server needed** — runs on a single SQLite file

## Tech Stack

- **[SvelteKit](https://kit.svelte.dev/)** — full-stack framework (Svelte 5 with runes)
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** — fast, synchronous SQLite driver
- **[sharp](https://sharp.pixelplumbing.com/)** — image resizing and compression for receipt uploads
- **[Tailwind CSS v4](https://tailwindcss.com/)** — utility-first styling
- **[@sveltejs/adapter-node](https://kit.svelte.dev/docs/adapter-node)** — production Node.js deployment

## Getting Started

### Requirements

- Node.js 20+
- npm

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

The server listens on port `3000` by default.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `./divvyup.db` | Path to the SQLite database file |
| `UPLOADS_DIR` | `./uploads/receipts` | Directory where receipt images are stored |
| `BODY_SIZE_LIMIT` | `524288` (512 KB) | Max request body size in bytes — set to `20971520` (20 MB) to allow image uploads |
| `PORT` | `3000` | Port for the production server |
| `HOST` | `0.0.0.0` | Host to bind to |

## Deployment

> **Note:** `better-sqlite3` and `sharp` include native C++ bindings compiled at `npm ci` time. Always run `npm ci` and `npm run build` on the target server — do not copy `node_modules` across architectures (e.g. from an x86 CI runner to an ARM server).

### systemd service

Create `/etc/systemd/system/divvy-up.service`:

```ini
[Unit]
Description=DivvyUp
After=network.target

[Service]
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/divvy-up
ExecStart=/usr/bin/node /home/YOUR_USER/divvy-up/build/index.js
Restart=always
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT=3002
Environment=HOST=127.0.0.1
Environment=DATABASE_PATH=/home/YOUR_USER/divvy-up/divvyup.db
Environment=UPLOADS_DIR=/home/YOUR_USER/divvy-up/uploads/receipts
Environment=BODY_SIZE_LIMIT=20971520

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now divvy-up
```

### Nginx

Create `/etc/nginx/sites-available/divvy-up`:

```nginx
server {
    listen 80;
    server_name divvy.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 25M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/divvy-up /etc/nginx/sites-enabled/divvy-up
sudo nginx -t && sudo systemctl reload nginx
```

Add HTTPS via Certbot:

```bash
sudo certbot --nginx -d divvy.yourdomain.com
```

### Automated deploys via GitHub Actions

Add secrets in GitHub → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SSH_HOST` | Server IP or hostname |
| `SSH_USER` | Linux username on the server |
| `SSH_KEY` | Private SSH key (full contents, passphrase-free) |

The included `.github/workflows/deploy.yml` deploys on every push to `main`. It uses `git reset --hard origin/main` (rather than `git pull`) to handle any server-side file drift, and fails loudly if any step errors.

To allow the deploy user to restart the service without a password:

```bash
echo "YOUR_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart divvy-up" | sudo tee /etc/sudoers.d/divvy-up
```

## How It Works

### Access levels & links

Each trip generates three tokens at creation:

| Link | Default landing tab | Access |
|---|---|---|
| **Owner link** | Grid (Edit) | Add/remove people and events, change all amounts, mark payments, upload receipts |
| **Edit link** | Settlement | Update amounts and mark payments — cannot restructure the trip |
| **View-only link** | Settlement | Read-only; can fork a copy to start their own editable version |

There are no accounts. **Keep your owner link safe** — it's the only way to regain full access to your trip.

### Split types

**Even split** — check a box for each person who participated. The total is divided equally among all checked participants.

**Custom amounts** — enter each person's individual share directly. Supports:
- Expressions like `7.99+17.99+3.25` that are evaluated and stored with the original expression intact
- A tax percentage applied automatically when amounts don't include tax
- "Assign remaining tip" to distribute any unallocated balance among selected people, appending to existing expressions

### Sub-items

When creating an event, check "Split into sub-items" to break it into numbered items grouped under a parent (e.g. "Hotel → Hotel 1, Hotel 2, Hotel 3"). Sub-items are shown as individual rows in the grid but grouped together in the Settlement breakdown. Editing, deleting, or duplicating any item in the group affects the whole group.

### Receipt images

Attach photo receipts to any event via the edit modal. Supported formats: JPEG, PNG, WebP, HEIC/HEIF. Images are resized to max 2000×2000 and stored as JPEG. Receipts are visible as thumbnails in the Settlement breakdown and can be opened full-size in a lightbox.

### Settlement

The Settlement tab shows:
- Each person's net balance (how much they're owed or owe overall)
- A minimized list of transfers to settle all debts in as few transactions as possible
- A per-event breakdown with each person's share — shown as `$7.99 + $14.99 + tax = $25.10` for custom amounts
- Receipt thumbnails for any event that has attached images
- A direct payment log to record cash/Venmo transfers as they happen

## Contributing

PRs and issues welcome. This project is intentionally minimal — new features should fit the "no-accounts, shareable link" model.

## License

MIT
