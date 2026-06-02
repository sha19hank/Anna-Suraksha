# Anna Suraksha — Complete Project

> **अन्न सुरक्षा** · AI-driven food freshness intelligence + surplus redistribution for India  
> Built for the AWS 10000 AIdeas challenge

---

## Repository structure

```
Anna Suraksha/
├── infra/              ← AWS CDK v2 backend (TypeScript)
│   ├── bin/infra.ts    ← CDK app entry — deploys both stacks
│   ├── lib/
│   │   ├── infra-stack.ts       ← Core: Lambda, API GW, DynamoDB, Cognito, S3
│   │   └── monitoring-stack.ts  ← Phase 4: CloudWatch alarms + dashboard
│   ├── src/
│   │   ├── lambdas/    ← 10 Lambda handlers
│   │   ├── shared/     ← Reusable utils (bedrock, dynamo, http, sms, logger…)
│   │   └── domain/     ← Food categorisation + adaptive questions engine
│   ├── scripts/
│   │   └── seed-ngos.ts   ← Seeds DynamoDB with 11 NGOs across India
│   └── test/lambdas/   ← Unit tests (hybrid, validate, sms)
│
├── web/                ← Next.js 14 web app (React + Tailwind)
│   └── src/app/
│       ├── auth/       ← Login + signup with email verification
│       ├── dashboard/  ← Overview, stats, recent scans
│       ├── scan/       ← Full scan flow: upload → detect → questions → predict
│       ├── history/    ← Paginated analysis history with expandable rows
│       └── surplus/    ← Surplus board: browse, filter, list, claim
│
├── mobile/             ← Expo (React Native) mobile app — iOS + Android
│   └── src/app/
│       ├── (auth)/     ← Login + signup screens
│       └── (tabs)/     ← Home, Scan, History, Surplus tab screens
│
└── .github/workflows/
    ├── ci.yml          ← Lint + type-check + test + build (all 3 workspaces)
    └── deploy.yml      ← CDK deploy via OIDC + optional Vercel web deploy
```

---

## AWS architecture

```
Browser / Mobile App
       │  JWT Bearer token (Cognito)
       ▼
API Gateway HTTP API  ──── GET /v1/health (public)
       │
       ├── POST /v1/upload-url    → presign-upload  → S3 presigned PUT
       ├── POST /v1/detect        → detect-food     → Rekognition + Bedrock Vision
       ├── POST /v1/predict       → predict-expiry  → Bedrock Claude 3.5 Sonnet
       │                                             → DynamoDB write
       │                                             → EventBridge Scheduler (SMS reminder)
       ├── GET  /v1/analyses      → list-analyses   → DynamoDB GSI query
       ├── GET  /v1/analyses/{id} → get-analysis    → DynamoDB GetItem
       ├── POST /v1/surplus       → create-surplus  → DynamoDB + SNS → NGO SMS
       ├── GET  /v1/surplus       → list-surplus    → DynamoDB GSI / Scan
       └── PATCH /v1/surplus/{id}/claim → claim-surplus → DynamoDB conditional update

EventBridge Scheduler ──→ send-reminder → SNS SMS (DLQ: SQS)

CloudWatch (Phase 4)
  ├── Alarms: Lambda errors, p99 duration, API 5xx, API latency, DLQ depth, Bedrock failures
  └── Dashboard: AnnaSuraksha-Operations
```

---

## Full user flow

1. **Sign up / login** via Cognito (email + password)
2. **Scan food** — upload photo (presigned S3 PUT)
3. **Detect** — Rekognition labels + Bedrock Vision visual freshness score (0-100)
4. **Adaptive questions** — if confidence < 90%, Claude asks 2-4 targeted questions
5. **Predict** — Claude 3.5 Sonnet estimates exact expiry + schedules SMS reminder
6. **Results** — expiry countdown, AI explanation, confidence bar, reminder timestamp
7. **Surplus** — if food is expiring, list it; NGOs in the region get SMS notification
8. **NGOs** — browse surplus board, filter by city, claim listings in one tap

---

## Quickstart

### 1 — Deploy backend (AWS)

```bash
# Prerequisites: AWS CLI configured, CDK bootstrapped
cd infra
npm install

# Deploy core stack
npx cdk deploy AnnaSurakshaMvpStack

# Deploy monitoring stack (set your email first)
ALERT_EMAIL=you@example.com npx cdk deploy AnnaSurakshaMonitoringStack

# Note the outputs — you need these for web + mobile .env files:
#   HttpApiUrl, UserPoolId, WebClientId, MobileClientId
```

Before deploying, enable **Bedrock model access** for `anthropic.claude-3-5-sonnet-20240620-v1:0` in ap-south-1 via the AWS Console → Amazon Bedrock → Model access.

### 2 — Seed NGOs

```bash
export NGO_TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name AnnaSurakshaMvpStack \
  --query "Stacks[0].Outputs[?OutputKey=='NgoContactsTableName'].OutputValue" \
  --output text --region ap-south-1)

npx ts-node --project tsconfig.json scripts/seed-ngos.ts
```

### 3 — Run web app

```bash
cd web
cp .env.example .env.local
# Fill in API URL, UserPoolId, WebClientId from CDK outputs
npm install
npm run dev   # http://localhost:3000
```

### 4 — Run mobile app

```bash
cd mobile
cp .env.example .env
# Fill in API URL, UserPoolId, MobileClientId from CDK outputs
npm install
npx expo start
# Press 'i' for iOS simulator, 'a' for Android emulator
```

### 5 — Run tests

```bash
cd infra
npm test              # unit tests
npm run test:coverage # with coverage report
```

---

## Environment variables

### Backend (Lambda — set in CDK, not manually)

| Variable | Default | Description |
|----------|---------|-------------|
| `DRY_RUN_SMS` | `true` | Set `false` to send real SMS via SNS |
| `LEAD_TIME_HOURS` | `2` | Hours before expiry to send reminder |
| `WEATHER_API_KEY` | *(empty)* | OpenWeatherMap key — skip for now |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-5-sonnet-20240620-v1:0` | Bedrock model |

### Web (`web/.env.local`)

```env
NEXT_PUBLIC_API_URL=https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com
NEXT_PUBLIC_USER_POOL_ID=ap-south-1_XXXXXXXXX
NEXT_PUBLIC_WEB_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Mobile (`mobile/.env`)

```env
EXPO_PUBLIC_API_URL=https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com
EXPO_PUBLIC_USER_POOL_ID=ap-south-1_XXXXXXXXX
EXPO_PUBLIC_MOBILE_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## CI/CD

GitHub Actions runs on every push to `main` or `develop`:

- **`ci.yml`** — type-check + test + CDK synth + Next.js build + Expo type-check
- **`deploy.yml`** — CDK deploy via OIDC (no long-lived credentials) + optional Vercel

Required GitHub secrets:
- `AWS_DEPLOY_ROLE_ARN` — IAM role ARN with CDK deploy permissions (OIDC)
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — if deploying web to Vercel

---

## API quick reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/health` | None | Health check |
| POST | `/v1/upload-url` | JWT | Get presigned S3 PUT URL |
| POST | `/v1/detect` | JWT | Rekognition + Bedrock Vision |
| POST | `/v1/predict` | JWT | Bedrock expiry prediction |
| GET | `/v1/analyses` | JWT | Paginated history |
| GET | `/v1/analyses/{id}` | JWT | Single analysis |
| POST | `/v1/surplus` | JWT | Create listing + notify NGOs |
| GET | `/v1/surplus` | JWT | Browse listings (`?region=Mumbai`) |
| PATCH | `/v1/surplus/{id}/claim` | JWT | Claim listing (race-safe) |

---

## Phases completed

| Phase | Status | What was built |
|-------|--------|----------------|
| 1 — Backend hardening | ✅ Done | Cognito auth, 4 new GET/PATCH endpoints, NGO seed, unit tests, DLQ |
| 2 — Web frontend | ✅ Done | Next.js app: login, scan, dashboard, history, surplus board |
| 3 — AI uplift + mobile | ✅ Done | Bedrock Vision freshness scoring; Expo mobile app (iOS + Android) |
| 4 — Production-ready | ✅ Done | GitHub Actions CI/CD, CloudWatch alarms + dashboard, monitoring stack |
