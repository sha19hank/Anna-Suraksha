import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, CorsHttpMethod, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          enabled: true,
          expiration: cdk.Duration.days(7),
        },
      ],
    });

    // Allow Rekognition service to read uploaded images by S3 object reference.
    uploadsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowRekognitionRead',
        principals: [new iam.ServicePrincipal('rekognition.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [uploadsBucket.arnForObjects('*')],
      })
    );

    const analysesTable = new dynamodb.Table(this, 'FoodAnalysesTable', {
      partitionKey: { name: 'analysisId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
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
    });

    const notificationsTopic = new sns.Topic(this, 'NotificationsTopic');

    const scheduleGroup = new scheduler.CfnScheduleGroup(this, 'ExpiryScheduleGroup', {
      name: 'anna-suraksha-expiry-reminders',
    });

    const reminderFn = new NodejsFunction(this, 'SendReminderFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/send-reminder.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        ANALYSES_TABLE_NAME: analysesTable.tableName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    analysesTable.grantWriteData(reminderFn);
    reminderFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: ['*'],
      })
    );

    // Scheduler needs an IAM role to invoke the reminder lambda.
    const schedulerInvokeRole = new iam.Role(this, 'SchedulerInvokeRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    reminderFn.grantInvoke(schedulerInvokeRole);

    const presignFn = new NodejsFunction(this, 'PresignUploadFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/presign-upload.ts',
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOAD_BUCKET_NAME: uploadsBucket.bucketName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    uploadsBucket.grantPut(presignFn, 'uploads/*');

    const detectFn = new NodejsFunction(this, 'DetectFoodFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/detect-food.ts',
      handler: 'handler',
      memorySize: 384,
      timeout: cdk.Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        UPLOAD_BUCKET_NAME: uploadsBucket.bucketName,
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    detectFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['rekognition:DetectLabels'],
        resources: ['*'],
      })
    );

    const predictFn = new NodejsFunction(this, 'PredictExpiryFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: 'src/lambdas/predict-expiry.ts',
      handler: 'handler',
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        ANALYSES_TABLE_NAME: analysesTable.tableName,
        REMINDER_LAMBDA_ARN: reminderFn.functionArn,
        SCHEDULER_INVOKE_ROLE_ARN: schedulerInvokeRole.roleArn,
        SCHEDULE_GROUP_NAME: scheduleGroup.name as string,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        DRY_RUN_SMS: 'true',
        LEAD_TIME_HOURS: '2',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    analysesTable.grantWriteData(predictFn);

    const bedrockModelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
    const bedrockModelArn = `arn:${cdk.Aws.PARTITION}:bedrock:${cdk.Aws.REGION}::foundation-model/${bedrockModelId}`;
    const scheduleGroupName = scheduleGroup.name as string;
    const scheduleGroupArn = `arn:${cdk.Aws.PARTITION}:scheduler:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:schedule-group/${scheduleGroupName}`;
    const scheduleArnPrefix = `arn:${cdk.Aws.PARTITION}:scheduler:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:schedule/${scheduleGroupName}/`;

    predictFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [bedrockModelArn],
      })
    );
    predictFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['scheduler:CreateSchedule'],
        resources: [scheduleGroupArn, `${scheduleArnPrefix}*`],
      })
    );
    predictFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [schedulerInvokeRole.roleArn],
      })
    );
    predictFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: ['*'],
      })
    );

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
        NOTIFICATIONS_TOPIC_ARN: notificationsTopic.topicArn,
        DRY_RUN_SMS: 'true',
      },
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });
    surplusTable.grantWriteData(surplusFn);
    ngoTable.grantReadData(surplusFn);
    surplusFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: ['*'],
      })
    );

    const httpApi = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowOrigins: ['*'],
      },
    });

    httpApi.addRoutes({
      path: '/v1/upload-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('UploadUrlIntegration', presignFn),
    });
    httpApi.addRoutes({
      path: '/v1/detect',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('DetectIntegration', detectFn),
    });
    httpApi.addRoutes({
      path: '/v1/predict',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PredictIntegration', predictFn),
    });
    httpApi.addRoutes({
      path: '/v1/surplus',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SurplusIntegration', surplusFn),
    });

    new cdk.CfnOutput(this, 'UploadsBucketName', { value: uploadsBucket.bucketName });
    new cdk.CfnOutput(this, 'AnalysesTableName', { value: analysesTable.tableName });
    new cdk.CfnOutput(this, 'NgoContactsTableName', { value: ngoTable.tableName });
    new cdk.CfnOutput(this, 'SurplusTableName', { value: surplusTable.tableName });
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'SchedulerGroupName', { value: scheduleGroup.name as string });
  }
}
