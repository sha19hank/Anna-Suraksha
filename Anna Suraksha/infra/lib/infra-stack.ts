import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, CorsHttpMethod, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';

const BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
const bundling = { minify: true, sourceMap: true };

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Cognito User Pool ────────────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'anna-suraksha-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const webClient = userPool.addClient('WebClient', {
      userPoolClientName: 'anna-suraksha-web',
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    const mobileClient = userPool.addClient('MobileClient', {
      userPoolClientName: 'anna-suraksha-mobile',
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(60),
      preventUserExistenceErrors: true,
    });

    const cognitoAuthorizer = new HttpUserPoolAuthorizer(
      'CognitoAuthorizer',
      userPool,
      { userPoolClients: [webClient, mobileClient] }
    );

    // ── S3 ───────────────────────────────────────────────────────────────────
    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ enabled: true, expiration: cdk.Duration.days(7) }],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['content-type'],
          maxAge: 300,
        },
      ],
    });

    uploadsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowRekognitionRead',
        principals: [new iam.ServicePrincipal('rekognition.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [uploadsBucket.arnForObjects('*')],
      })
    );

    // ── DynamoDB ─────────────────────────────────────────────────────────────
    const analysesTable = new dynamodb.Table(this, 'FoodAnalysesTable', {
      partitionKey: { name: 'analysisId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,
    });
    analysesTable.addGlobalSecondaryIndex({
      indexName: 'userId-createdAt-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAtIso', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const metricsTable = new dynamodb.Table(this, 'MetricsTable', {
      partitionKey: { name: 'metricName', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const ngoTable = new dynamodb.Table(this, 'NgoContactsTable', {
      partitionKey: { name: 'region', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'contactId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const surplusTable = new dynamodb.Table(this, 'SurplusListingsTable', {
      partitionKey: { name: 'listingId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });
    surplusTable.addGlobalSecondaryIndex({
      indexName: 'region-status-index',
      partitionKey: { name: 'region', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── SNS + Scheduler ──────────────────────────────────────────────────────
    new sns.Topic(this, 'NotificationsTopic');

    const scheduleGroup = new scheduler.CfnScheduleGroup(this, 'ExpiryScheduleGroup', {
      name: 'anna-suraksha-expiry-reminders',
    });

    // ── Reminder Lambda ──────────────────────────────────────────────────────
    const reminderFn = new NodejsFunction(this, 'SendReminderFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/send-reminder.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        ANALYSES_TABLE_NAME: analysesTable.tableName,
        METRICS_TABLE_NAME: metricsTable.tableName,
        DRY_RUN_SMS: 'true',
      },
      bundling,
    });
    analysesTable.grantWriteData(reminderFn);
    metricsTable.grantReadWriteData(reminderFn);
    reminderFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['sns:Publish'], resources: ['*'] })
    );

    const schedulerInvokeRole = new iam.Role(this, 'SchedulerInvokeRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    reminderFn.grantInvoke(schedulerInvokeRole);

    // Dead-letter queue so failed reminder invocations are not silently lost
    const reminderDlq = new sqs.Queue(this, 'ReminderDlq', {
      queueName: 'anna-suraksha-reminder-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });
    schedulerInvokeRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [reminderDlq.queueArn],
      })
    );

    // ── Presign Upload ───────────────────────────────────────────────────────
    const presignFn = new NodejsFunction(this, 'PresignUploadFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/presign-upload.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { UPLOAD_BUCKET_NAME: uploadsBucket.bucketName },
      bundling,
    });
    uploadsBucket.grantPut(presignFn, 'uploads/*');

    // ── ARN constants (used by both detectFn and predictFn) ─────────────────
    const bedrockModelArn = `arn:${cdk.Aws.PARTITION}:bedrock:${cdk.Aws.REGION}::foundation-model/${BEDROCK_MODEL_ID}`;
    const scheduleGroupName = scheduleGroup.name as string;
    const scheduleGroupArn = `arn:${cdk.Aws.PARTITION}:scheduler:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:schedule-group/${scheduleGroupName}`;
    const scheduleArnPrefix = `arn:${cdk.Aws.PARTITION}:scheduler:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:schedule/${scheduleGroupName}/`;

    // ── Detect Food ──────────────────────────────────────────────────────────
    const detectFn = new NodejsFunction(this, 'DetectFoodFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/detect-food.ts',
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOAD_BUCKET_NAME: uploadsBucket.bucketName,
        METRICS_TABLE_NAME: metricsTable.tableName,
        BEDROCK_MODEL_ID,
      },
      bundling,
    });
    metricsTable.grantReadWriteData(detectFn);
    // BUG FIX: Grant S3 read so Bedrock Vision can fetch the uploaded image
    uploadsBucket.grantRead(detectFn);
    detectFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['rekognition:DetectLabels'], resources: ['*'] })
    );
    // BUG FIX: Grant Bedrock InvokeModel so vision freshness scoring works
    detectFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [bedrockModelArn] })
    );

    // ── Predict Expiry ───────────────────────────────────────────────────────

    const predictFn = new NodejsFunction(this, 'PredictExpiryFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/predict-expiry.ts',
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        ANALYSES_TABLE_NAME: analysesTable.tableName,
        METRICS_TABLE_NAME: metricsTable.tableName,
        REMINDER_LAMBDA_ARN: reminderFn.functionArn,
        SCHEDULER_INVOKE_ROLE_ARN: schedulerInvokeRole.roleArn,
        SCHEDULE_GROUP_NAME: scheduleGroupName,
        BEDROCK_MODEL_ID,
        DRY_RUN_SMS: 'true',
        LEAD_TIME_HOURS: '2',
        WEATHER_API_KEY: '',
      },
      bundling,
    });
    analysesTable.grantWriteData(predictFn);
    metricsTable.grantReadWriteData(predictFn);
    predictFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [bedrockModelArn] })
    );
    predictFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule'],
        resources: [scheduleGroupArn, `${scheduleArnPrefix}*`],
      })
    );
    predictFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [schedulerInvokeRole.roleArn] })
    );
    predictFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['sns:Publish'], resources: ['*'] })
    );

    // ── Create Surplus ───────────────────────────────────────────────────────
    const surplusFn = new NodejsFunction(this, 'CreateSurplusFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/create-surplus.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(20),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        SURPLUS_TABLE_NAME: surplusTable.tableName,
        NGO_TABLE_NAME: ngoTable.tableName,
        DRY_RUN_SMS: 'true',
      },
      bundling,
    });
    surplusTable.grantWriteData(surplusFn);
    ngoTable.grantReadData(surplusFn);
    surplusFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['sns:Publish'], resources: ['*'] })
    );

    // ── NEW: Get single analysis ─────────────────────────────────────────────
    const getAnalysisFn = new NodejsFunction(this, 'GetAnalysisFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/get-analysis.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { ANALYSES_TABLE_NAME: analysesTable.tableName },
      bundling,
    });
    analysesTable.grantReadData(getAnalysisFn);

    // ── NEW: List user analyses ──────────────────────────────────────────────
    const listAnalysesFn = new NodejsFunction(this, 'ListAnalysesFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/list-analyses.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { ANALYSES_TABLE_NAME: analysesTable.tableName },
      bundling,
    });
    analysesTable.grantReadData(listAnalysesFn);

    // ── NEW: List surplus (with region filter) ───────────────────────────────
    const listSurplusFn = new NodejsFunction(this, 'ListSurplusFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/list-surplus.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { SURPLUS_TABLE_NAME: surplusTable.tableName },
      bundling,
    });
    surplusTable.grantReadData(listSurplusFn);

    // ── NEW: Claim surplus listing ───────────────────────────────────────────
    const claimSurplusFn = new NodejsFunction(this, 'ClaimSurplusFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/claim-surplus.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: { SURPLUS_TABLE_NAME: surplusTable.tableName },
      bundling,
    });
    surplusTable.grantReadWriteData(claimSurplusFn);

    // ── Health (public — no auth) ────────────────────────────────────────────
    const healthFn = new NodejsFunction(this, 'HealthFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/health.ts',
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling,
    });

    // ── API Gateway HTTP API ─────────────────────────────────────────────────
    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'anna-suraksha-api',
      corsPreflight: {
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const auth = { authorizer: cognitoAuthorizer };

    // Public
    httpApi.addRoutes({
      path: '/v1/health',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('HealthIntegration', healthFn),
    });

    // Protected — upload + AI flow
    httpApi.addRoutes({
      path: '/v1/upload-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UploadUrlIntegration', presignFn),
      ...auth,
    });
    httpApi.addRoutes({
      path: '/v1/detect',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('DetectIntegration', detectFn),
      ...auth,
    });
    httpApi.addRoutes({
      path: '/v1/predict',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PredictIntegration', predictFn),
      ...auth,
    });

    // Protected — analyses
    httpApi.addRoutes({
      path: '/v1/analyses',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListAnalysesIntegration', listAnalysesFn),
      ...auth,
    });
    httpApi.addRoutes({
      path: '/v1/analyses/{analysisId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetAnalysisIntegration', getAnalysisFn),
      ...auth,
    });

    // Protected — surplus
    httpApi.addRoutes({
      path: '/v1/surplus',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateSurplusIntegration', surplusFn),
      ...auth,
    });
    httpApi.addRoutes({
      path: '/v1/surplus',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListSurplusIntegration', listSurplusFn),
      ...auth,
    });
    httpApi.addRoutes({
      path: '/v1/surplus/{listingId}/claim',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('ClaimSurplusIntegration', claimSurplusFn),
      ...auth,
    });


    // ── Cross-stack exports (consumed by MonitoringStack) ────────────────────
    const exp = (id: string, val: string, exportName: string) =>
      new cdk.CfnOutput(this, id, { value: val, exportName: `AnnaSuraksha-${exportName}` });

    exp('HttpApiIdExport',         httpApi.apiId,                'HttpApiId');
    exp('DetectFnNameExport',      detectFn.functionName,        'DetectFoodFnName');
    exp('PredictFnNameExport',     predictFn.functionName,       'PredictExpiryFnName');
    exp('PresignFnNameExport',     presignFn.functionName,       'PresignUploadFnName');
    exp('CreateSurplusFnExport',   surplusFn.functionName,       'CreateSurplusFnName');
    exp('ClaimSurplusFnExport',    claimSurplusFn.functionName,  'ClaimSurplusFnName');
    exp('ReminderFnNameExport',    reminderFn.functionName,      'SendReminderFnName');
    exp('GetAnalysisFnExport',     getAnalysisFn.functionName,   'GetAnalysisFnName');
    exp('ListAnalysesFnExport',    listAnalysesFn.functionName,  'ListAnalysesFnName');
    exp('ListSurplusFnExport',     listSurplusFn.functionName,   'ListSurplusFnName');
    exp('HealthFnNameExport',      healthFn.functionName,        'HealthFnName');
    exp('AnalysesTableExport',     analysesTable.tableName,      'AnalysesTableName');
    exp('SurplusTableExport',      surplusTable.tableName,       'SurplusTableName');
    exp('ReminderDlqUrlExport',    reminderDlq.queueUrl,         'ReminderDlqUrl');
    exp('ReminderDlqArnExport',    reminderDlq.queueArn,         'ReminderDlqArn');

    // ── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'Region', { value: cdk.Aws.REGION });
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'WebClientId', { value: webClient.userPoolClientId });
    new cdk.CfnOutput(this, 'MobileClientId', { value: mobileClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UploadsBucketName', { value: uploadsBucket.bucketName });
    new cdk.CfnOutput(this, 'AnalysesTableName', { value: analysesTable.tableName });
    new cdk.CfnOutput(this, 'SurplusTableName', { value: surplusTable.tableName });
    new cdk.CfnOutput(this, 'NgoContactsTableName', { value: ngoTable.tableName });
    new cdk.CfnOutput(this, 'ReminderDlqUrl', { value: reminderDlq.queueUrl });
    new cdk.CfnOutput(this, 'SchedulerGroupName', { value: scheduleGroupName });
  }
}
