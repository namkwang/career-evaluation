# career-evaluation-backend (FastAPI)

Backend for the career-evaluation Next.js app. Ports `src/app/api/**` route handlers to Python.
Consumed by the Next.js frontend via `next.config.ts` rewrites.

## Local development

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Then in another terminal:

```bash
cd ..
npm run dev
```

Frontend hits `http://localhost:3000/api/*` which Next rewrites to `http://localhost:8000/api/*`.

## Environment

Set these in `.env.local` at the repo root (shared with Next.js):

- `CAREER_GEMINI_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET` (new — Supabase project JWT secret, distinct from service-role key)
- `BACKEND_URL=http://localhost:8000`

## Tests

```bash
pytest tests -v
```

## Migration status

See `/home/hyerin/.claude/plans/ulw-fast-quizzical-sonnet.md` for phased plan.
