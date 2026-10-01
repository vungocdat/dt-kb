# DT Workspace

> **Warning:** This project is fully vibe coded. No formal testing, no security audit, no production hardening. Use at your own risk.

A self-hosted, single-user workspace where every page is stored as raw Markdown. Built for sysadmins and developers who want a fast, private place to keep code snippets, tech notes, and learning journals — with no database overhead beyond a single SQLite file.

Inspired by Docmost and One Markdown

## Features

The app has three top-level tabs in the sidebar — **Knowledge base**, **Calendar** and **To-do** — each a separate feature with its own storage.

- **Spaces** — top-level containers to organise pages by topic or project; drag to reorder, click a space's icon to pick a custom emoji
- **Nested pages** — tree structure with unlimited depth; drag to reorder siblings or move across spaces
- **Dual view per page** — Read mode (rendered HTML with syntax highlighting) and Edit mode (CodeMirror raw Markdown editor)
- **Auto-save** — edits are saved 800 ms after you stop typing
- **Full-text search** — SQLite FTS5 with snippet extraction, triggered with `Ctrl/Cmd+K`
- **Calendar** — a separate month view focused on today, where each day can hold one Markdown note, written and read without leaving the calendar; calendar notes are independent of spaces and pages
- **Vietnamese lunar calendar (âm lịch)** — every day in the calendar shows its lunar date, with Vietnamese holidays (Tết, Giỗ Tổ, Trung Thu, …), the 24 solar terms (tiết khí) and Can Chi names; computed for UTC+7, so dates match Vietnamese calendars even in years where they differ from the Chinese one
- **To-do** — a simple task list: add, tick off, rename and delete tasks; pin important ones so they stay at the top; finished tasks collect in a collapsible Completed section with a one-click "Clear completed"
- **Adjustable tabs** — drag the sidebar tabs (or use `Alt+↑/↓`) to put them in any order, and choose which tab the app opens on under **Settings → Default page** (Calendar by default); both preferences are saved per browser
- **GFM + emoji** — GitHub Flavored Markdown, `:smile:` syntax, and emoticon shortcodes
- **Syntax highlighting** — Atom One Dark theme via `rehype-highlight`; code blocks have a one-click copy-to-clipboard button
- **Table of contents** — sticky right sidebar in Read mode listing all headings with active-section highlighting and click-to-scroll; auto-hidden when fewer than 2 headings
- **Keyboard shortcuts** — `Ctrl/Cmd+E` toggles Edit/Read mode, `Ctrl/Cmd+K` opens search
- **Export** — download any page as a `.md` file, or export a whole space as a `.zip` archive (includes all pages and hierarchy metadata for re-import)
- **Import** — import a `.md` file as a new page into any space, or restore a space from a previously exported `.zip`
- **Login-protected** — single credential set in `.env`, no users table, session cookies via `iron-session`
- **Account settings** — change your username or password from the settings page without restarting the server
- **Dark mode** — single soft, low-contrast dark theme (Docmost/Mantine-inspired neutrals); no light mode or toggle

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Hono v4 + `@hono/node-server` |
| Database | SQLite via `better-sqlite3` + Drizzle ORM |
| Auth | `iron-session` v8 (encrypted cookie) + `bcryptjs` |
| Markdown | `unified` → `remark-gfm` → `remark-emoji` → `rehype-highlight` |
| Search | SQLite FTS5 with trigger-based sync |
| Frontend | React 19 + Vite 6 + TanStack Router |
| State | Zustand v5 |
| Styling | Tailwind CSS v4 + `@tailwindcss/typography` |
| Editor | CodeMirror 6 with Markdown language support |

## Getting Started

### Prerequisites

- Node.js 22 (the production server runs v22.23.x)
- npm 10+

> `better-sqlite3` ships a native module built for one Node major version. If the server fails with *"Could not locate the bindings file"*, you are on a different Node major — switch to Node 22 and run `npm rebuild better-sqlite3`. Never copy `node_modules` between machines; run `npm install` on each.

### Installation

```sh
git clone https://github.com/vungocdat/dt-kb.git
cd dt-kb
npm install
```

### Configuration

Copy the example env file and fill in your credentials:

```sh
cp .env.example .env
```

Generate a password hash and a session secret:

```sh
npm run setup -- --username admin --password yourpassword
```

Paste the printed values into `.env`. Your `.env` should look like (note the port 3333):

```env
KB_USERNAME=admin
KB_PASSWORD_HASH=$2b$12$...
SESSION_SECRET=<32-char random string>
PORT=3333
DB_PATH=./data/kb.db
NODE_ENV=development
```

`DB_PATH` is resolved relative to the `server/` directory (the server switches into it on startup, wherever you launch it from), so `./data/kb.db` means `server/data/kb.db`. The file and its folder are created on first start.

`SESSION_SECRET` must be exactly 32 characters. Generate one independently with:

```sh
openssl rand -base64 24 | cut -c1-32
```

### Start

```sh
npm run dev
```

The API starts on `http://localhost:3333` and the Vite dev server on `http://localhost:5173`. There is no separate migration step: on startup the server creates `server/data/kb.db` if it is missing and applies any pending migrations itself.

> Don't run `npm run db:migrate` (`drizzle-kit push`) against a database the app uses — it creates the tables without recording them in the migration ledger, and the server then skips its own migrations, which breaks future schema upgrades. It is only for local schema experiments.

## Production Deployment

A step-by-step setup for a fresh Ubuntu server, ending with an empty database. The app runs as your normal login user (`youruser` below) from `/opt/dt-kb`.

### 1. Clone and install

```sh
sudo mkdir /opt/dt-kb && sudo chown $USER:$USER /opt/dt-kb
git clone https://github.com/vungocdat/dt-kb.git /opt/dt-kb
cd /opt/dt-kb
node -v          # must be v22.x
npm install      # includes the build tools needed below
```

A fresh clone has no `server/data/` folder — the app creates it, with an empty database, on first start.

### 2. Create `.env`

```sh
npm run setup -- --username admin --password 'your-strong-password'
```

Quote the password so the shell leaves special characters alone. Put the printed values in `/opt/dt-kb/.env`, changing the last three lines for production:

```env
KB_USERNAME=admin
KB_PASSWORD_HASH=$2b$12$...        # from setup output
SESSION_SECRET=...                 # from setup output (32 chars)
PORT=3000
DB_PATH=./data/kb.db               # = /opt/dt-kb/server/data/kb.db
NODE_ENV=production
```

```sh
chmod 600 .env
```

`.env` must stay writable by the app's user: changing the username or password in Settings rewrites it. `NODE_ENV=production` is required — without it the server only serves the API, not the web UI.

### 3. Build and test-start

```sh
npm run build
node server/dist/index.js
```

You should see `dt-kb API listening on http://0.0.0.0:3000`, and `server/data/kb.db` now exists. Stop it with Ctrl+C. (No `db:migrate` — the server migrates its own database on startup.)

### 4. systemd

Create `/etc/systemd/system/dt-kb.service`:

```ini
[Unit]
Description=dt-kb
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/opt/dt-kb
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

No `EnvironmentFile=` is needed — the app loads `.env` itself. Use the path from `which node` if it isn't `/usr/bin/node`.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now dt-kb
systemctl status dt-kb             # active (running)
```

### 5. HTTPS reverse proxy (nginx)

In production the session cookie is `Secure`, so the browser only keeps it over HTTPS — on plain `http://<ip>:3000` login appears to succeed and then drops you back at the login page. Put nginx in front of the app and terminate TLS there. Pick **A** if you have a domain name pointing at the server, **B** for LAN / IP-only access.

Two details in both configs below matter:

- `client_max_body_size 50m` — space import uploads a ZIP, and nginx rejects bodies over 1 MB by default (413).
- `X-Forwarded-For $remote_addr` — the login rate limiter (5 attempts / 60 s per IP) trusts the first address in that header, and `$remote_addr` replaces whatever the client sent. Don't use `$proxy_add_x_forwarded_for`: it *appends* to a client-supplied value, so anyone could dodge the limit by sending a fake header.

#### A. With a domain (Let's Encrypt)

```sh
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/dt-kb`:

```nginx
server {
    listen 80;
    server_name kb.example.com;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it, then let certbot add the certificate, the HTTPS `server` block and the HTTP→HTTPS redirect (port 80 must be reachable from the internet for the challenge — open the firewall in step 6 first):

```sh
sudo ln -s /etc/nginx/sites-available/dt-kb /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kb.example.com
```

Certbot installs a timer that renews the certificate automatically (`sudo certbot renew --dry-run` to check).

#### B. LAN / IP only (self-signed certificate)

```sh
sudo apt install -y nginx
sudo openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout /etc/ssl/private/dt-kb.key -out /etc/ssl/certs/dt-kb.crt \
  -subj "/CN=192.168.1.50" -addext "subjectAltName=IP:192.168.1.50"
```

Replace `192.168.1.50` with the server's IP. Create `/etc/nginx/sites-available/dt-kb`:

```nginx
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/ssl/certs/dt-kb.crt;
    ssl_certificate_key /etc/ssl/private/dt-kb.key;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/dt-kb /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

The browser warns about the self-signed certificate once; accept it (or import `dt-kb.crt` into your OS/browser trust store to silence it).

### 6. Firewall

The app listens on all interfaces, so keep port 3000 closed and expose only SSH and HTTPS:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

Then open your `https://` address and log in with the credentials from step 2.

### 7. Backups

See [Data](#data) below — back up `server/data/kb.db` and `.env`. For a nightly consistent copy (`sudo apt install -y sqlite3`, create `~/kb-backups` first), add to `crontab -e`:

```
0 3 * * * sqlite3 /opt/dt-kb/server/data/kb.db ".backup '/home/youruser/kb-backups/kb-$(date +\%F).db'"
```

## Updating

```sh
cd /opt/dt-kb
git pull origin main
npm install            # only needed if dependencies changed
npm run build
sudo systemctl restart dt-kb
```

The database (`server/data/kb.db`) is untouched by these steps — it is git-ignored, so `git pull` never overwrites it — and any new migrations are applied by the server when it restarts. All four commands are idempotent — safe to run every time without checking what changed.

## Data

All data lives in a single SQLite file: **`server/data/kb.db`** by default (on a server cloned to `/opt/dt-kb`, that is `/opt/dt-kb/server/data/kb.db`). Set `DB_PATH` in `.env` to put it elsewhere — an absolute path is used as-is, a relative one is resolved against `server/`. Back this file up — it is the only stateful component of the application. Together with `.env` (credentials and session secret) it is everything you need to restore an install.

SQLite runs in WAL mode, so next to `kb.db` you may see `kb.db-wal` and `kb.db-shm`; recent writes can still be sitting in the `-wal` file. To take a consistent copy while the app is running, use SQLite's online backup instead of `cp`:

```sh
sqlite3 /opt/dt-kb/server/data/kb.db ".backup '/path/to/backup/kb-$(date +%F).db'"
```

(Or stop the service and copy all three files.)

Knowledge base pages, calendar notes (`calendar_notes`) and to-do tasks (`todos`) all live in that same file; the calendar and to-do tables are created automatically on startup, so no migration is needed for them. Tab order and the default page are browser preferences (`localStorage`), not stored in the database.

Markdown source is stored in `pages.content`; rendered HTML is cached in `pages.content_html` and regenerated on every save. Deleting a page re-parents its children to the deleted page's parent rather than cascading.
