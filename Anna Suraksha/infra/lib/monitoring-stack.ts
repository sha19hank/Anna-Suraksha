import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface MonitoringStackProps extends cdk.StackProps {
  alertEmail: string;
  lambdaNames: {
    detect: string;
    predict: string;
    presign: string;
    createSurplus: string;
    claimSurplus: string;
    sendReminder: string;
    getAnalysis: string;
    listAnalyses: string;
    listSurplus: string;
    health: string;
  };
  apiId: string;
  analysesTableName: string;
  surplusTableName: string;
  reminderDlqUrl: string;
  reminderDlqArn: string;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // ── Ops alert topic ───────────────────────────────────────────────────
    const alertTopic = new sns.Topic(this, 'OpsAlertTopic', {
      topicName: 'anna-suraksha-ops-alerts',
      displayName: 'Anna Suraksha Ops',
    });
    alertTopic.addSubscription(new sns_subscriptions.EmailSubscription(props.alertEmail));
    const alarmAction = new cloudwatch_actions.SnsAction(alertTopic);

    // ── Helper: lambda error-rate alarm ──────────────────────────────────
    const lambdaErrorAlarm = (id: string, fnName: string, threshold = 5) => {
      const errors = new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: { FunctionName: fnName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      });
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName: `anna-suraksha-${fnName}-errors`,
        alarmDescription: `Lambda ${fnName} > ${threshold} errors in 5 min`,
        metric: errors,
        threshold,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
      alarm.addOkAction(alarmAction);
      return alarm;
    };

    // ── Helper: lambda p99 duration alarm ────────────────────────────────
    const durationAlarm = (id: string, fnName: string, thresholdMs: number) => {
      const metric = new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Duration',
        dimensionsMap: { FunctionName: fnName },
        statistic: 'p99',
        period: cdk.Duration.minutes(5),
      });
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName: `anna-suraksha-${fnName}-duration-p99`,
        alarmDescription: `Lambda ${fnName} p99 duration > ${thresholdMs}ms`,
        metric,
        threshold: thresholdMs,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
      return alarm;
    };

    // ── Lambda error alarms ───────────────────────────────────────────────
    const { lambdaNames: fn } = props;
    lambdaErrorAlarm('DetectErrors',       fn.detect,       3);
    lambdaErrorAlarm('PredictErrors',      fn.predict,      3);
    lambdaErrorAlarm('PresignErrors',      fn.presign,      5);
    lambdaErrorAlarm('SurplusErrors',      fn.createSurplus,3);
    lambdaErrorAlarm('ClaimErrors',        fn.claimSurplus, 3);
    lambdaErrorAlarm('ReminderErrors',     fn.sendReminder, 2);

    // ── Duration alarms (critical path) ──────────────────────────────────
    durationAlarm('DetectDuration',  fn.detect,  12_000);   // 12s (timeout 15s)
    durationAlarm('PredictDuration', fn.predict, 25_000);   // 25s (timeout 30s)

    // ── API Gateway 5xx alarm ────────────────────────────────────────────
    const api5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: { ApiId: props.apiId },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: 'anna-suraksha-api-5xx',
      alarmDescription: 'API Gateway 5xx errors',
      metric: api5xx,
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    api5xxAlarm.addAlarmAction(alarmAction);

    // ── API Gateway p99 latency alarm ────────────────────────────────────
    const apiLatency = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'IntegrationLatency',
      dimensionsMap: { ApiId: props.apiId },
      statistic: 'p99',
      period: cdk.Duration.minutes(5),
    });
    const latencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: 'anna-suraksha-api-latency-p99',
      alarmDescription: 'API p99 latency > 10s',
      metric: apiLatency,
      threshold: 10_000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    latencyAlarm.addAlarmAction(alarmAction);

    // ── Reminder DLQ depth alarm ─────────────────────────────────────────
    const dlqDepth = new cloudwatch.Metric({
      namespace: 'AWS/SQS',
      metricName: 'ApproximateNumberOfMessagesVisible',
      dimensionsMap: { QueueName: 'anna-suraksha-reminder-dlq' },
      statistic: 'Maximum',
      period: cdk.Duration.minutes(5),
    });
    const dlqAlarm = new cloudwatch.Alarm(this, 'ReminderDlqAlarm', {
      alarmName: 'anna-suraksha-reminder-dlq-depth',
      alarmDescription: 'Failed reminders in DLQ — investigate EventBridge scheduler',
      metric: dlqDepth,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(alarmAction);

    // ── Log-based metric filter: Bedrock failures ─────────────────────────
    const bedrockFailFilter = new logs.MetricFilter(this, 'BedrockFailFilter', {
      logGroup: logs.LogGroup.fromLogGroupName(this, 'PredictLog', `/aws/lambda/${fn.predict}`),
      metricNamespace: 'AnnaSuraksha',
      metricName: 'BedrockFailures',
      filterPattern: logs.FilterPattern.anyTerm('bedrock.error', 'InvokeModel failed', 'ThrottlingException'),
      metricValue: '1',
    });
    const bedrockAlarm = new cloudwatch.Alarm(this, 'BedrockFailAlarm', {
      alarmName: 'anna-suraksha-bedrock-failures',
      alarmDescription: 'Bedrock InvokeModel failures in predict lambda',
      metric: bedrockFailFilter.metric({ statistic: 'Sum', period: cdk.Duration.minutes(10) }),
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    bedrockAlarm.addAlarmAction(alarmAction);

    // ── CloudWatch Dashboard ──────────────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'MainDashboard', {
      dashboardName: 'AnnaSuraksha-Operations',
    });

    const invocations = (fnName: string) => new cloudwatch.Metric({
      namespace: 'AWS/Lambda', metricName: 'Invocations',
      dimensionsMap: { FunctionName: fnName },
      statistic: 'Sum', period: cdk.Duration.minutes(5),
    });
    const errors = (fnName: string) => new cloudwatch.Metric({
      namespace: 'AWS/Lambda', metricName: 'Errors',
      dimensionsMap: { FunctionName: fnName },
      statistic: 'Sum', period: cdk.Duration.minutes(5),
    });
    const duration = (fnName: string, stat = 'p99') => new cloudwatch.Metric({
      namespace: 'AWS/Lambda', metricName: 'Duration',
      dimensionsMap: { FunctionName: fnName },
      statistic: stat, period: cdk.Duration.minutes(5),
    });

    dashboard.addWidgets(
      // Row 1: API overview
      new cloudwatch.TextWidget({ markdown: '## API Gateway', width: 24, height: 1 }),
      new cloudwatch.GraphWidget({
        title: 'API requests / 5 min',
        width: 8, height: 6,
        left: [new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: 'Count', dimensionsMap: { ApiId: props.apiId }, statistic: 'Sum', period: cdk.Duration.minutes(5) })],
      }),
      new cloudwatch.GraphWidget({
        title: 'API 4xx / 5xx errors',
        width: 8, height: 6,
        left: [
          new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: '4XXError', dimensionsMap: { ApiId: props.apiId }, statistic: 'Sum', period: cdk.Duration.minutes(5) }),
          new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: '5XXError', dimensionsMap: { ApiId: props.apiId }, statistic: 'Sum', period: cdk.Duration.minutes(5) }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'API latency p50 / p99 (ms)',
        width: 8, height: 6,
        left: [
          new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: 'Latency', dimensionsMap: { ApiId: props.apiId }, statistic: 'p50', period: cdk.Duration.minutes(5) }),
          new cloudwatch.Metric({ namespace: 'AWS/ApiGateway', metricName: 'Latency', dimensionsMap: { ApiId: props.apiId }, statistic: 'p99', period: cdk.Duration.minutes(5) }),
        ],
      }),

      // Row 2: Core Lambda invocations
      new cloudwatch.TextWidget({ markdown: '## Lambda — invocations', width: 24, height: 1 }),
      new cloudwatch.GraphWidget({
        title: 'detect-food + predict-expiry invocations',
        width: 12, height: 6,
        left: [invocations(fn.detect), invocations(fn.predict)],
      }),
      new cloudwatch.GraphWidget({
        title: 'detect-food + predict-expiry errors',
        width: 12, height: 6,
        left: [errors(fn.detect), errors(fn.predict)],
      }),

      // Row 3: Duration
      new cloudwatch.TextWidget({ markdown: '## Lambda — duration (p99)', width: 24, height: 1 }),
      new cloudwatch.GraphWidget({
        title: 'detect-food p99 duration (ms)',
        width: 8, height: 6,
        left: [duration(fn.detect)],
      }),
      new cloudwatch.GraphWidget({
        title: 'predict-expiry p99 duration (ms)',
        width: 8, height: 6,
        left: [duration(fn.predict)],
      }),
      new cloudwatch.GraphWidget({
        title: 'send-reminder p99 duration (ms)',
        width: 8, height: 6,
        left: [duration(fn.sendReminder)],
      }),

      // Row 4: Surplus + Reminder DLQ
      new cloudwatch.TextWidget({ markdown: '## Surplus + Reminders', width: 24, height: 1 }),
      new cloudwatch.GraphWidget({
        title: 'create-surplus + claim-surplus invocations',
        width: 12, height: 6,
        left: [invocations(fn.createSurplus), invocations(fn.claimSurplus)],
      }),
      new cloudwatch.GraphWidget({
        title: 'Reminder DLQ depth',
        width: 12, height: 6,
        left: [dlqDepth],
      }),

      // Row 5: Alarm status panel
      new cloudwatch.TextWidget({ markdown: '## Active alarm states', width: 24, height: 1 }),
      new cloudwatch.AlarmStatusWidget({
        title: 'All alarms',
        alarms: [api5xxAlarm, latencyAlarm, dlqAlarm, bedrockAlarm],
        width: 24, height: 4,
      }),
    );

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=ap-south-1#dashboards:name=AnnaSuraksha-Operations`,
      description: 'CloudWatch dashboard URL',
    });
    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
  }
}
