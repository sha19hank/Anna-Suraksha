# Anna Suraksha (MVP)

AI-driven hybrid food freshness intelligence system for the AWS 10000 AIdeas challenge.

## What’s in this repo

- `infra/`: AWS CDK (TypeScript) that deploys the MVP backend (S3, DynamoDB, Lambda, API Gateway HTTP API, SNS, EventBridge Scheduler).

## MVP API

- `POST /v1/upload-url` → get a pre-signed S3 PUT URL
- `POST /v1/detect` → Rekognition label + confidence + adaptive questions
- `POST /v1/predict` → Bedrock expiry prediction + DynamoDB write + reminder schedule (+ optional SMS)
- `POST /v1/surplus` → store restaurant surplus listing + notify NGOs via SMS

## Deploy

```bash
cd infra
npm install
npx cdk bootstrap
npx cdk deploy
```

## Notes

- Bedrock, Rekognition, and SNS SMS can incur cost. Keep volume low for MVP testing.
