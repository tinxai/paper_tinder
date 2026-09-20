# PaperSwipe

Swipe through academic papers matched to your research interests. Swipe right to
save a paper, left to dismiss it.

A React Native (Expo) app with a FastAPI + PostgreSQL backend. Paper metadata
comes from the [Semantic Scholar Academic Graph API](https://api.semanticscholar.org/api-docs/graph).

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Technology choices](#technology-choices)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Running the backend](#running-the-backend)
- [Running the Expo app](#running-the-expo-app)
- [Testing on an iOS simulator](#testing-on-an-ios-simulator)
- [Testing on a physical iPhone](#testing-on-a-physical-iphone)
- [Test commands](#test-commands)
- [CI/CD](#cicd)
- [EAS Build](#eas-build)
- [Deploying the backend](#deploying-the-backend)
- [Concepts explained](#concepts-explained)
- [Known limitations](#known-limitations)
- [Version 2 ideas](#version-2-ideas)

---

## What it does

1. **Sign up** with an email and password.
2. **Choose research interests** — pick from suggestions or type your own.
3. **Swipe** through a ranked feed of papers, one card at a time.
   Right saves, left dismisses, tap opens the full detail view.
4. **Review saved papers** with search, year filtering and sorting.
5. **Change interests**, switch theme, or delete your account in Settings.

A paper you have swiped on never appears in your feed again.

---

## Architecture

```mermaid
graph TB
    subgraph Device["📱 iOS / Android (Expo)"]
        UI["Screens<br/>expo-router"]
        RQ["TanStack Query<br/>cache + optimistic swipes"]
        API["API client<br/>services/apiClient.ts"]
        SS["SecureStore<br/>JWT"]
        AS["AsyncStorage<br/>theme preference"]

        UI --> RQ --> API
        API --> SS
        UI --> AS
    end

    subgraph Backend["☁️ FastAPI"]
        R["/api/v1 routers<br/>auth · interests · papers · swipes"]
        DEP["Dependencies<br/>JWT auth · pagination"]
        FEED["feed service<br/>fetch → cache → filter → rank"]
        RANK["ranking service<br/>pure, no I/O"]
        SCH["semantic_scholar client<br/>timeouts · retries · normalization"]

        R --> DEP
        R --> FEED
        FEED --> RANK
        FEED --> SCH
    end

    subgraph Data["🗄️ PostgreSQL"]
        T["users · interests · user_interests<br/>papers · swipes"]
    end

    S2["🌐 Semantic Scholar<br/>Academic Graph API"]

    API -->|HTTPS + Bearer JWT| R
    FEED -->|SQLAlchemy 2.x async| T
    DEP --> T
    SCH -->|httpx| S2

    classDef device fill:#EDF1FE,stroke:#2F5BEA,color:#14161A
    classDef backend fill:#E6F4EE,stroke:#0F8A5F,color:#14161A
    classDef data fill:#FDF0E8,stroke:#C2410C,color:#14161A
    classDef ext fill:#F4F5F7,stroke:#6B7280,color:#14161A

    class UI,RQ,API,SS,AS device
    class R,DEP,FEED,RANK,SCH backend
    class T data
    class S2 ext
```

### How a swipe flows

1. The gesture ends past the threshold; the card animates off-screen.
2. TanStack Query **optimistically** removes it from the feed cache, so the next
   card is interactive immediately.
3. `POST /api/v1/swipes` records it.
4. On failure the cache is rolled back and the card returns — a swipe is never
   silently lost.
5. On a right swipe the saved-papers cache is invalidated.

### How the feed is built

`backend/app/services/feed.py`:

1. Read the user's interests (capped at 5 queries per request).
2. Search Semantic Scholar once per interest, concurrently but bounded.
3. Merge and de-duplicate.
4. **Upsert into PostgreSQL** — so saved papers and detail views never depend on
   the upstream being reachable.
5. Drop papers the user already swiped on.
6. Rank (see below).
7. Return a paginated page.

If every upstream query fails, the feed falls back to ranking **cached** papers
and flags the response `source: "cache"`, which the app surfaces as a banner.
This matters in practice: the unauthenticated Semantic Scholar endpoint is rate
limited to roughly one request per second across *all* anonymous callers, so a
429 is a normal condition rather than an outage.

### Ranking

`backend/app/services/ranking.py` is a pure function — no database, no network —
which is what makes it testable and replaceable.

```
score = 0.50 × interest_match     (token overlap; title hits weigh more)
      + 0.20 × recency            (1.0 this year → 0.0 at 12 years old)
      + 0.30 × citation_impact    (log10(1 + citations) / 4, clamped to 1.0)
```

The **log transform on citations is the important part.** Citation counts are
power-law distributed; without it a single 200,000-citation classic would
outrank every recent, relevant paper forever. With it, a 10,000-citation paper
scores about 1.3× a 100-citation one rather than 100×.

Papers with no year score a neutral 0.5 for recency, so missing metadata neither
promotes nor buries a paper.

---

## Technology choices

| Choice | Why |
|---|---|
| **Expo** over bare React Native | Managed native modules, OTA updates, and EAS Build. No Xcode project to maintain for an MVP. |
| **Expo Router** | File-based routing; the `(auth)` / `(tabs)` groups map directly to the navigation shape. |
| **Gesture Handler + Reanimated** (not a swiper package) | The card gesture is the product. Owning ~200 readable lines beats depending on an abandoned library for the core interaction. Animations run on the UI thread, so the drag stays smooth regardless of JS work. |
| **TanStack Query** | Server-state caching, pagination and optimistic updates without hand-rolling a reducer. |
| **FastAPI** | Pydantic validation and generated OpenAPI docs from the same type annotations. |
| **SQLAlchemy 2.x async + asyncpg** | The backend's slow path is an outbound HTTP call, so async avoids blocking a worker per request. |
| **JSONB for authors / fields_of_study** | These are only ever read back whole and rendered. Normalizing would add two tables and two joins for no query we run. See the note in `models/paper.py`. |
| **Argon2 via `pwdlib`** | The current OWASP default. `passlib` is effectively unmaintained. |
| **Semantic Scholar paper ID as the primary key** | It is already a stable natural key; a surrogate UUID would add a lookup for nothing. |

---

## Repository structure

```text
paperswipe/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py              # DB session, current user, pagination
│   │   │   └── v1/                  # auth · interests · papers · swipes
│   │   ├── core/
│   │   │   ├── config.py            # settings from the environment
│   │   │   ├── errors.py            # error envelope + handlers
│   │   │   └── security.py          # Argon2 hashing, JWT
│   │   ├── db/                      # declarative base, async session
│   │   ├── models/                  # SQLAlchemy models
│   │   ├── schemas/                 # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── semantic_scholar.py  # upstream client + normalization
│   │   │   ├── ranking.py           # pure scoring (swappable in v2)
│   │   │   ├── feed.py              # the feed pipeline
│   │   │   ├── papers.py            # upsert cache
│   │   │   └── interests.py
│   │   ├── scripts/seed.py          # idempotent interest seeding
│   │   └── main.py
│   ├── alembic/versions/            # 0001_initial_schema.py
│   ├── tests/                       # 159 tests
│   ├── requirements.txt             # pinned runtime deps
│   ├── requirements-dev.txt
│   ├── pyproject.toml
│   └── Dockerfile
├── mobile/
│   ├── app/                         # expo-router routes
│   │   ├── (auth)/                  # welcome · sign-in · sign-up
│   │   ├── (tabs)/                  # discover · saved · settings
│   │   ├── paper/[id].tsx
│   │   └── onboarding.tsx
│   ├── components/                  # design system + cards
│   ├── hooks/                       # auth, theme, queries
│   ├── services/                    # API client, storage, formatting
│   ├── constants/                   # theme tokens, config
│   ├── types/api.ts
│   ├── tests/                       # 74 tests
│   ├── app.json
│   └── eas.json
├── .github/workflows/               # ci.yml, deploy-backend.yml
├── docs/version-2.md
├── docker-compose.yml
├── docker-compose.override.yml      # dev-only live reload
├── render.yaml
└── .env.example
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker Desktop | 24+ | Runs PostgreSQL and the API |
| Node.js | 20 LTS+ | For the Expo app |
| Python | 3.12+ | Only if running the backend outside Docker |
| Xcode | 15+ | Only for the iOS simulator (macOS) |

A Semantic Scholar API key is **optional** — see
[Environment variables](#environment-variables).

---

## Local setup

```bash
git clone <your-repo-url> paperswipe
cd paperswipe

# 1. Backend environment
cp .env.example .env
# Generate a real secret and put it in .env as SECRET_KEY:
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# 2. Start PostgreSQL + the API (migrations and seeding run automatically)
docker compose up -d --build

# 3. Confirm it is healthy
curl http://localhost:8000/health
# {"status":"ok","environment":"development","database":"ok","version":"0.1.0"}

# 4. Mobile app
cd mobile
cp .env.example .env
npm install
npm start
```

Interactive API docs: <http://localhost:8000/docs>

---

## Environment variables

### Backend — root `.env` (see `.env.example`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | local Postgres | A plain `postgresql://` URL is rewritten to `+asyncpg` automatically, so a Render/Railway URL works as pasted. |
| `SECRET_KEY` | **yes in production** | insecure dev value | Signs JWTs. The app refuses to boot with `ENVIRONMENT=production` and the default value. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `10080` (7 days) | |
| `CORS_ORIGINS` | no | `*` | Comma-separated. `*` is for local development only. |
| `ENVIRONMENT` | no | `development` | `production` enables the secret-key check. |
| `SEMANTIC_SCHOLAR_API_KEY` | no | unset | Works without one. Without a key you share a ~1 req/s pool with every other anonymous caller and will often see the cached-results banner. Request one [here](https://www.semanticscholar.org/product/api#api-key). |
| `SEMANTIC_SCHOLAR_TIMEOUT_SECONDS` | no | `12` | |
| `SEMANTIC_SCHOLAR_MAX_RETRIES` | no | `2` | Timeouts and 5xx only. A 429 is never retried in-request. |

### Mobile — `mobile/.env`

| Variable | Notes |
|---|---|
| `EXPO_PUBLIC_API_URL` | Backend base URL. **Anything `EXPO_PUBLIC_*` is embedded in the JS bundle and readable by anyone with the app — never put a secret here.** |

If unset, the app infers the host from the Metro bundler address in development,
which makes a physical iPhone work with no manual configuration.

> **No secret is committed to this repository.** `.env` is gitignored;
> `.env.example` contains names only.

---

## Database migrations

Migrations run automatically on `docker compose up`. To run them by hand:

```bash
# Inside the running container
docker compose exec api alembic upgrade head

# Or from the host, against the exposed database
cd backend
export DATABASE_URL="postgresql+asyncpg://paperswipe:paperswipe@localhost:5432/paperswipe"
alembic upgrade head

# Create a new migration after changing a model
alembic revision --autogenerate -m "add collections table"

# Roll back one
alembic downgrade -1
```

### Seeding interests

```bash
docker compose exec api python -m app.scripts.seed
```

Idempotent — safe on every deploy.

### Resetting the development database

`docker compose down` **keeps** your data; the volume is named and is never
removed by a normal start or stop. Destroying data is always explicit:

```bash
# Drop every table and re-apply migrations — keeps the volume
docker compose exec api alembic downgrade base
docker compose exec api alembic upgrade head
docker compose exec api python -m app.scripts.seed

# Nuclear option: delete the volume and all data
docker compose down -v
docker compose up -d --build
```

---

## Running the backend

### With Docker (recommended)

```bash
docker compose up -d --build     # start
docker compose logs -f api       # follow logs
docker compose ps                # status
docker compose down              # stop (data is preserved)
```

`docker-compose.override.yml` is applied automatically in development and
bind-mounts `backend/app`, so edits reload without a rebuild. To ignore it:

```bash
docker compose -f docker-compose.yml up -d
```

### Without Docker

```bash
docker compose up -d db          # still need PostgreSQL

cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt && pip install -e . --no-deps

export DATABASE_URL="postgresql+asyncpg://paperswipe:paperswipe@localhost:5432/paperswipe"
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"

alembic upgrade head
python -m app.scripts.seed
uvicorn app.main:app --reload --port 8000
```

---

## Running the Expo app

```bash
cd mobile
npm install
npm start          # then press i for iOS, a for Android, w for web
npm run ios        # or go straight to the simulator
npm run start:clear  # clear the Metro cache if bundling misbehaves
```

---

## Testing on an iOS simulator

The simulator shares your Mac's network, so `localhost` works:

```bash
# mobile/.env
EXPO_PUBLIC_API_URL=http://localhost:8000
```

```bash
cd mobile && npm run ios
```

> **If Expo Go crashes on launch** (`EXC_BAD_ACCESS` at startup), the installed
> copy is bad. Reinstall it:
> ```bash
> xcrun simctl uninstall booted host.exp.Exponent
> rm -rf ~/.expo/ios-simulator-app-cache
> npm run ios
> ```

---

## Testing on a physical iPhone

**A phone cannot reach your computer at `localhost`** — that resolves to the
phone itself. Use your Mac's LAN IP.

1. Put the phone and the Mac on the **same Wi-Fi network**.

2. Find your Mac's IP:

   ```bash
   ipconfig getifaddr en0      # Wi-Fi
   ipconfig getifaddr en1      # Ethernet, if en0 is empty
   # e.g. 192.168.1.42
   ```

3. Point the app at it:

   ```bash
   # mobile/.env
   EXPO_PUBLIC_API_URL=http://192.168.1.42:8000
   ```

4. Restart Metro so the new value is picked up — `.env` is read at bundle time:

   ```bash
   npm run start:clear
   ```

5. Install **Expo Go** from the App Store and scan the QR code from the terminal.

The backend already listens on `0.0.0.0` inside Docker and is published on port
8000, so no backend change is needed.

**If the app cannot reach the backend:**

```bash
# From the Mac — confirm the API answers on the LAN IP, not just localhost
curl http://192.168.1.42:8000/health
```

- Open the same URL in Safari **on the phone**. If that fails, it is a network
  problem, not an app problem.
- macOS firewall: System Settings → Network → Firewall may be blocking
  incoming connections.
- Some corporate and guest Wi-Fi networks enable *client isolation*, which
  blocks device-to-device traffic entirely. Use a personal hotspot instead.
- Skipping step 4 is the most common cause — Expo inlines `EXPO_PUBLIC_*` at
  bundle time, so a running Metro will keep serving the old value.

---

## Test commands

```bash
# Backend — needs the `paperswipe_test` database, which `docker compose up -d db` creates
cd backend
pytest                       # 159 tests
pytest -v                    # verbose
pytest tests/test_ranking.py # one file
pytest -k "swipe"            # by name
pytest --cov=app             # with coverage

ruff check .                 # lint
ruff format --check .        # formatting

# Mobile
cd mobile
npm test                     # 74 tests
npm run test:watch
npm run test:ci              # with coverage
npm run lint
npm run typecheck
npm run format:check
```

Semantic Scholar is mocked in every backend test — the suite never touches the
live API and passes with no network access.

---

## CI/CD

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`:

**Backend job** — spins up a PostgreSQL 16 service container, installs from the
pinned `requirements-dev.txt`, runs Ruff (lint + format), applies migrations,
seeds interests, and runs pytest.

**Mobile job** — `npm ci` from the lockfile, ESLint, Prettier, `tsc --noEmit`,
and Jest with coverage.

**Docker job** — builds the backend image to prove the Dockerfile is valid.
Nothing is pushed and no credentials are needed.

`deploy-backend.yml` is optional and **does nothing until you configure it**. It
triggers a Render deploy after CI passes on `main`, and skips itself when the
`RENDER_DEPLOY_HOOK_URL` secret is absent. Nothing is ever published to the App
Store automatically.

---

## EAS Build

[EAS Build](https://docs.expo.dev/build/introduction/) compiles the native iOS
and Android binaries in the cloud, so you do not need Xcode or Android Studio
locally.

`mobile/eas.json` defines three profiles:

| Profile | Output | Use |
|---|---|---|
| `development` | Dev client, iOS simulator build | Debugging with custom native modules |
| `preview` | Internal `.ipa` / `.apk` | TestFlight or direct install for testers |
| `production` | App Store build / Android App Bundle | Store submission |

```bash
npm install -g eas-cli
eas login
cd mobile
eas init          # creates the EAS project and writes extra.eas.projectId

eas build --profile development --platform ios
eas build --profile preview --platform all
eas build --profile production --platform ios
```

Set the API URL per profile in `eas.json` (`build.<profile>.env.EXPO_PUBLIC_API_URL`),
or as EAS secrets:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://your-api.onrender.com
```

### Manual steps that need your credentials

These cannot be completed without your accounts, and no placeholder is invented
for them:

1. **`eas init`** — creates the project and writes the real `projectId` into
   `app.json`. It is deliberately absent from the committed file; a fake value
   makes Expo attempt real code-signing lookups and breaks `expo start`.
2. **Apple Developer Program membership** ($99/yr) for device and store builds.
3. **`eas submit --platform ios`** — needs App Store Connect credentials.
4. **Bundle identifiers** — `app.json` uses `com.paperswipe.app` for both
   platforms. Change these to identifiers you own before building.

---

## Deploying the backend

### Render (blueprint included)

`render.yaml` provisions the web service and a managed PostgreSQL instance.

1. Push the repository to GitHub.
2. Render dashboard → **New** → **Blueprint** → select the repo.
3. Render reads `render.yaml` and creates both services.
4. In the service's **Environment** tab set:
   - `SEMANTIC_SCHOLAR_API_KEY` (optional)
   - `CORS_ORIGINS` (if you serve a web build)

`SECRET_KEY` is generated by Render. `DATABASE_URL` is wired from the database
automatically. The `preDeployCommand` runs migrations and seeding before the new
instance takes traffic.

### Railway

`backend/railway.json` is included.

```bash
npm install -g @railway/cli
railway login
railway init
railway add --database postgres     # sets DATABASE_URL automatically
railway variables --set "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
railway variables --set "ENVIRONMENT=production"
railway variables --set "CORS_ORIGINS=https://your-app-domain.com"
railway up
```

Railway injects `$PORT`; the start command in `railway.json` uses it.

### Production checklist

- [ ] `SECRET_KEY` is a generated random value, not the default
- [ ] `ENVIRONMENT=production` (enables the startup secret check)
- [ ] `CORS_ORIGINS` names real origins, not `*`
- [ ] `DATABASE_URL` points at managed PostgreSQL with backups on
- [ ] `SEMANTIC_SCHOLAR_API_KEY` set, to avoid the shared anonymous rate limit
- [ ] `/health` is wired to the platform's health check
- [ ] Mobile `EXPO_PUBLIC_API_URL` points at the deployed HTTPS URL

---

## Concepts explained

**Expo vs. React Native.** React Native is the framework that renders your
JavaScript as real native views. Expo is a toolchain on top: preconfigured
native modules (`expo-secure-store`, `expo-router`), a dev client you can run
without Xcode, and over-the-air updates. This project is *managed* Expo — there
is no committed `ios/` or `android/` directory, because EAS generates them at
build time. If you later need a native module Expo does not support, you can
`expo prebuild` and keep everything else.

**EAS Build.** Compiles the native binaries on Expo's servers. Without it you
would need a Mac with Xcode for every iOS build and a working Android SDK for
every Android one. It also manages signing credentials, which is the part that
usually breaks on a local setup. See [EAS Build](#eas-build).

**PostgreSQL's role.** The source of truth for users, interests, swipes, and a
**cache of paper metadata**. Caching papers is not an optimization detail — it
is what lets the Saved screen and paper details work when Semantic Scholar is
rate limited or down, and it gives the `swipes.paper_id` foreign key something
to point at. JSONB stores authors and fields of study, which is why Postgres
rather than a document store: relational integrity where it matters, document
flexibility where it does not.

**FastAPI's role.** The HTTP layer, and the reason the mobile app never talks to
Semantic Scholar directly. It owns authentication, ranking, the swipe-exclusion
rule, and the upstream API key — none of which can live safely in a client
bundle. Pydantic models validate input and generate the OpenAPI docs at `/docs`
from the same annotations.

**SQLAlchemy ORM's role.** Maps Python classes to tables, and — importantly —
builds every query as a parameterized statement. There is no string
interpolation into SQL anywhere in this codebase, which is what makes SQL
injection a non-issue. The async engine means a request waiting on Semantic
Scholar does not hold a worker thread.

**AsyncStorage vs. SecureStore.** AsyncStorage is unencrypted key-value storage
in plain files — fine for a theme preference, wrong for a credential. SecureStore
uses the iOS Keychain and Android EncryptedSharedPreferences. **The JWT goes in
SecureStore; only the theme preference goes in AsyncStorage.** Putting a token
in AsyncStorage would leave it readable in a device backup or on a rooted phone.

**Why no Redis or RabbitMQ.** Both would be ceremony without payoff here:

- *Redis for caching* — PostgreSQL already caches paper metadata, and the query
  is a single indexed lookup. Adding Redis would mean a second store to run,
  monitor and invalidate, to save a query that is not slow.
- *RabbitMQ/Celery for background work* — there is no background work. The one
  slow call (Semantic Scholar) happens inside a request the user is actively
  waiting on; deferring it to a queue would mean the user waits *and* you
  operate a broker. `async`/`await` already keeps the worker free during that
  call.
- *Kafka, Kubernetes, microservices, a vector database* — all solve problems of
  scale or team boundaries that a single-process MVP does not have.

The point where this changes is real and identified: v2's embedding recomputation
and notification jobs are genuine background work. Even then, pgvector lives
inside the PostgreSQL you already run — see [docs/version-2.md](docs/version-2.md).

---

## Known limitations

**Semantic Scholar rate limiting is the dominant constraint.** Without an API
key you share roughly one request per second with every other anonymous caller,
so the feed frequently falls back to cached results and shows the banner. This
is handled gracefully, but a key makes the experience markedly better.

**The feed's `total` is always null.** The upstream result set is not
enumerable, so a total would be a guess. The app paginates on `has_more`.

**Ranking is keyword-based.** It cannot tell that "vision-language models" and
"multimodal LLMs" are the same subject, and it does not learn from what you
save. This is the main thing v2 addresses.

**Interests are queried, capped at five per request.** A user with twenty
interests sees results from the first five alphabetically. Rotating the queried
subset would be a small, worthwhile improvement.

**No refresh tokens.** The access token lasts seven days, after which the user
signs in again. A refresh-token flow is the natural next step, and the
rotation/revocation machinery it needs was not worth it for v1.

**No password reset.** It needs an email provider, which is a deployment
dependency v1 avoids.

**Account deletion keeps cached papers.** `users`, `swipes` and interest links
cascade-delete. Rows in `papers` remain, because they are shared, non-personal
bibliographic metadata with no link back to the deleted user.

**No rate limiting on the API itself.** Fine behind a platform that provides it
(Render and Railway both do); add `slowapi` before exposing it more widely.

**Jest mocks two Reanimated primitives.** `withTiming` and `runOnJS` are stubbed
in `tests/SwipeActions.test.tsx`, because Jest has no UI thread or frame loop.
The gesture itself is therefore verified by the button path and by manual
testing, not by a simulated drag.

**`react-hooks/immutability` is disabled for one file.** Reanimated's API *is*
mutating `sharedValue.value`; the React Compiler rule does not model that and
flags every correct use. The override in `eslint.config.js` is scoped to
`components/SwipeableCard.tsx` alone.

---

## Version 2 ideas

Full design in **[docs/version-2.md](docs/version-2.md)**, which covers how
pgvector would rank papers using embeddings of what you swipe right on —
including the schema changes, the cold-start path, and why the v1 ranker stays.

- pgvector + SPECTER2 embeddings for semantic recommendations
- Generated paper summaries
- Daily notifications for new papers matching your interests
- Offline saved-paper reading with SQLite
- Social sharing
- Multiple saved-paper collections

---

## License

MIT
