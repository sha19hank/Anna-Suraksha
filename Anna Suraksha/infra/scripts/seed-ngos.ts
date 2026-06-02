/**
 * Seed script: populates NgoContactsTable with NGOs across India.
 *
 * Usage:
 *   NGO_TABLE_NAME=<table> npx ts-node --project tsconfig.json scripts/seed-ngos.ts
 *
 * After deploying the CDK stack, get the table name from:
 *   aws cloudformation describe-stacks --stack-name AnnaSurakshaMvpStack \
 *     --query "Stacks[0].Outputs[?OutputKey=='NgoContactsTableName'].OutputValue" \
 *     --output text --region ap-south-1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const TABLE_NAME = process.env.NGO_TABLE_NAME;
if (!TABLE_NAME) {
  console.error('❌  Set NGO_TABLE_NAME environment variable first.');
  process.exit(1);
}

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
);

type NgoRecord = {
  region: string;
  contactId: string;
  ngoName: string;
  phoneNumber: string; // E.164, +91…
  email?: string;
  city: string;
  notes?: string;
};

// Real and representative NGOs across major Indian cities.
// Phone numbers use the E.164 +91 format required by the SMS layer.
// Replace with verified contacts before enabling live SMS.
const NGO_SEED: Omit<NgoRecord, 'contactId'>[] = [
  // ── Mumbai ────────────────────────────────────────────────────────────────
  {
    region: 'Mumbai',
    ngoName: 'Roti Bank Mumbai',
    phoneNumber: '+912222620000',
    email: 'contact@rotibank.in',
    city: 'Mumbai',
    notes: 'Collects surplus cooked food from restaurants and homes',
  },
  {
    region: 'Mumbai',
    ngoName: 'Feeding India – Mumbai Chapter',
    phoneNumber: '+919820000001',
    city: 'Mumbai',
    notes: 'Zomato Foundation initiative, large network',
  },

  // ── Delhi ─────────────────────────────────────────────────────────────────
  {
    region: 'Delhi',
    ngoName: 'Robin Hood Army – Delhi',
    phoneNumber: '+911123381234',
    email: 'delhi@robinhoodarmy.com',
    city: 'New Delhi',
    notes: 'Weekend surplus food redistribution',
  },
  {
    region: 'Delhi',
    ngoName: 'Feeding India – Delhi Chapter',
    phoneNumber: '+919810000002',
    city: 'New Delhi',
  },

  // ── Bangalore ─────────────────────────────────────────────────────────────
  {
    region: 'Bangalore',
    ngoName: 'Akshaya Patra Foundation – Bangalore',
    phoneNumber: '+918028370376',
    email: 'info@akshayapatra.org',
    city: 'Bengaluru',
    notes: 'Largest mid-day meal NGO in India',
  },
  {
    region: 'Bangalore',
    ngoName: 'Robin Hood Army – Bangalore',
    phoneNumber: '+919900000003',
    city: 'Bengaluru',
  },

  // ── Chennai ───────────────────────────────────────────────────────────────
  {
    region: 'Chennai',
    ngoName: 'Feeding India – Chennai Chapter',
    phoneNumber: '+914423456789',
    city: 'Chennai',
  },
  {
    region: 'Chennai',
    ngoName: 'Robin Hood Army – Chennai',
    phoneNumber: '+919841000004',
    city: 'Chennai',
  },

  // ── Hyderabad ─────────────────────────────────────────────────────────────
  {
    region: 'Hyderabad',
    ngoName: 'No Food Waste – Hyderabad',
    phoneNumber: '+914023456780',
    email: 'hyderabad@nofoodwaste.in',
    city: 'Hyderabad',
    notes: 'Same-day surplus pickup across the city',
  },

  // ── Pune ──────────────────────────────────────────────────────────────────
  {
    region: 'Pune',
    ngoName: 'Feeding India – Pune Chapter',
    phoneNumber: '+912023456781',
    city: 'Pune',
  },

  // ── Kolkata ───────────────────────────────────────────────────────────────
  {
    region: 'Kolkata',
    ngoName: 'Robin Hood Army – Kolkata',
    phoneNumber: '+913323456782',
    city: 'Kolkata',
  },

  // ── Bhubaneswar ───────────────────────────────────────────────────────────
  {
    region: 'Bhubaneswar',
    ngoName: 'Feeding India – Bhubaneswar Chapter',
    phoneNumber: '+916742345678',
    city: 'Bhubaneswar',
  },

  // ── Patna ─────────────────────────────────────────────────────────────────
  {
    region: 'Patna',
    ngoName: 'Bihar Hunger Relief NGO',
    phoneNumber: '+916122345679',
    city: 'Patna',
    notes: 'Operates across Bihar, especially during festivals',
  },
];

async function seed() {
  console.log(`Seeding ${NGO_SEED.length} NGOs into ${TABLE_NAME}…\n`);
  let ok = 0;
  let fail = 0;

  for (const ngo of NGO_SEED) {
    const item: NgoRecord = { ...ngo, contactId: uuidv4() };
    try {
      await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      console.log(`  ✅  ${item.region} — ${item.ngoName}`);
      ok++;
    } catch (e) {
      console.error(`  ❌  ${item.region} — ${item.ngoName}: ${(e as Error).message}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} inserted, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

seed();
