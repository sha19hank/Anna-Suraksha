#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-south-1',  // Mumbai
};

const tags = {
  Project: 'AnnaSuraksha',
  Environment: 'mvp',
  Region: 'Mumbai',
};

// ── Core infra ────────────────────────────────────────────────────────────
const infra = new InfraStack(app, 'AnnaSurakshaMvpStack', {
  env,
  description: 'Anna Suraksha — AI food freshness & surplus redistribution backend',
  tags,
});

// ── Monitoring (optional — set ALERT_EMAIL env var before deploying) ──────
const alertEmail = process.env.ALERT_EMAIL;

if (alertEmail) {
  new MonitoringStack(app, 'AnnaSurakshaMonitoringStack', {
    env,
    description: 'Anna Suraksha — CloudWatch alarms and operational dashboard',
    tags,

    alertEmail,

    // Wire up Lambda function names from infra stack outputs
    lambdaNames: {
      detect:       cdk.Fn.importValue('AnnaSuraksha-DetectFoodFnName'),
      predict:      cdk.Fn.importValue('AnnaSuraksha-PredictExpiryFnName'),
      presign:      cdk.Fn.importValue('AnnaSuraksha-PresignUploadFnName'),
      createSurplus:cdk.Fn.importValue('AnnaSuraksha-CreateSurplusFnName'),
      claimSurplus: cdk.Fn.importValue('AnnaSuraksha-ClaimSurplusFnName'),
      sendReminder: cdk.Fn.importValue('AnnaSuraksha-SendReminderFnName'),
      getAnalysis:  cdk.Fn.importValue('AnnaSuraksha-GetAnalysisFnName'),
      listAnalyses: cdk.Fn.importValue('AnnaSuraksha-ListAnalysesFnName'),
      listSurplus:  cdk.Fn.importValue('AnnaSuraksha-ListSurplusFnName'),
      health:       cdk.Fn.importValue('AnnaSuraksha-HealthFnName'),
    },
    apiId:             cdk.Fn.importValue('AnnaSuraksha-HttpApiId'),
    analysesTableName: cdk.Fn.importValue('AnnaSuraksha-AnalysesTableName'),
    surplusTableName:  cdk.Fn.importValue('AnnaSuraksha-SurplusTableName'),
    reminderDlqUrl:    cdk.Fn.importValue('AnnaSuraksha-ReminderDlqUrl'),
    reminderDlqArn:    cdk.Fn.importValue('AnnaSuraksha-ReminderDlqArn'),
  });
}
