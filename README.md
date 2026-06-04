# SERPVault — Private SEO Research Database

A private SEO command center for uploading, cleaning, deduplicating, tagging, and exporting SEO research data from tools like SEMrush, Ahrefs, Moz, and more.

---

## 1. How to Run Locally

```bash
cd serpvault
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 2. How to Upload CSVs

1. Click **Upload CSVs** in the sidebar.
2. Drag and drop one or more `.csv` files, or click to browse.
3. The report type is auto-detected from the filename and column headers.
4. A dedupe report is created automatically for each file.
5. Cleaned rows are stored in your browser's `localStorage`.

**Supported report types:**
- Keyword Report (SEMrush/Ahrefs keyword exports)
- Keyword Gap Report
- Competitor Top Pages
- Backlink Report
- Referring Domains
- Anchor Text Report
- Organic Positions

---

## 3. How Dedupe Works

Each report type uses a specific key to identify duplicates:

| Report Type       | Dedupe Key                                     |
|-------------------|------------------------------------------------|
| Keywords          | keyword + database/country + intent            |
| Keyword Gap       | keyword + competitor domain + your domain      |
| Competitor Pages  | domain + URL                                   |
| Backlinks         | source URL + target URL + anchor text          |
| Referring Domains | referring domain + target domain               |
| Anchor Text       | anchor text                                    |

- If required columns are missing, a fallback to all columns is used, and a warning is logged in the dedupe report.
- **Raw files are never deleted.** Only cleaned (deduped) rows are stored.
- View all dedupe reports in the **Dedupe Reports** page.

---

## 4. How to Deploy on Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo.
3. Set the root directory to `serpvault` (if not at repo root).
4. Add environment variables (see below).
5. Click Deploy.

The app builds and runs fully without any environment variables.

---

## 5. How to Add Supabase Later

1. Create a project at [supabase.com](https://supabase.com).
2. Go to the SQL Editor and run the contents of `supabase/schema.sql`.
3. Copy your project URL and anon key from Project Settings → API.
4. Add them to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

5. Restart your dev server.

The Supabase client is in `lib/supabase/client.ts`. The app gracefully falls back to localStorage if Supabase is not configured.

---

## 6. Environment Variables

Copy `.env.example` to `.env.local` and fill in values:

```bash
cp .env.example .env.local
```

| Variable                        | Required | Description                     |
|---------------------------------|----------|---------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | No       | Your Supabase project URL       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No       | Your Supabase anon (public) key |

The app builds and runs fully without these variables.

---

## 7. Raw Files Are Never Deleted

SERPVault only stores parsed row data in localStorage — not the original CSV file content. This keeps storage usage low. The original files remain on your computer. You can re-upload any file at any time.

---

## Tech Stack

- **Next.js** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **PapaParse** (CSV parsing)
- **localStorage** (browser storage, no server needed)
- **Supabase** (optional cloud storage)
