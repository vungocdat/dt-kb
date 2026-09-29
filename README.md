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
- **To-do** — a simple task list: add, tick off, rename and delete tasks; finished tasks collect in a collapsible Completed section with a one-click "Clear completed"
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

`SESSION_SECRET` must be exactly 32 characters. Generate one independently with:

```sh
openssl rand -base64 24 | cut -c1-32
```

### Run migrations and start

```sh
npm run db:migrate
npm run dev
```

The API starts on `http://localhost:3333` and the Vite dev server on `http://localhost:5173`.

## Production Deployment

Build the app (Vite output is bundled into the server package):

```sh
npm run build
npm run db:migrate
npm start           # serves everything on the configured PORT
```

### systemd

```ini
[Unit]
Description=dt-kb
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/dt-kb
EnvironmentFile=/opt/dt-kb/.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
User=kb

[Install]
WantedBy=multi-user.target
```

### Reverse proxy (nginx)

```nginx
location / {
    proxy_pass http://localhost:3333;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

`X-Forwarded-For` is used by the login rate limiter (5 attempts / 60 s per IP), so set it when running behind a proxy.

## Updating

```sh
cd /opt/dt-kb
git pull origin main
npm install            # only needed if dependencies changed
npm run build
npm run db:migrate     # only needed if there are new migrations
sudo systemctl restart dt-kb
```

The database (`data/kb.db`) is untouched by these steps. All four commands are idempotent — safe to run every time without checking what changed.

## Data

All data lives in a single SQLite file (`data/kb.db` by default, controlled by `DB_PATH`). Back this file up — it is the only stateful component of the application.

Knowledge base pages, calendar notes (`calendar_notes`) and to-do tasks (`todos`) all live in that same file; the calendar and to-do tables are created automatically on startup, so no migration is needed for them. Tab order and the default page are browser preferences (`localStorage`), not stored in the database.

Markdown source is stored in `pages.content`; rendered HTML is cached in `pages.content_html` and regenerated on every save. Deleting a page re-parents its children to the deleted page's parent rather than cascading.
