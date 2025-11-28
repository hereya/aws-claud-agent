import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export class HereyaClaudeAgentStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ============================================
    // INPUT CONFIGURATION
    // ============================================
    const prefix = process.env.namePrefix || 'agent';
    const imageUri = process.env.imageUri;
    if (!imageUri) {
      throw new Error('imageUri environment variable is required');
    }
    const memorySize = parseInt(process.env.memorySize || '1024', 10);
    const timeout = parseInt(process.env.timeout || '900', 10);
    const autoDeleteObjects = process.env.autoDeleteObjects === 'true';

    // Parse ECR image URI: {account}.dkr.ecr.{region}.amazonaws.com/{repo}:{tag}
    const uriParts = imageUri.split('/');
    const repoAndTag = uriParts.slice(1).join('/');
    const [repoName, imageTag = 'latest'] = repoAndTag.split(':');

    // ============================================
    // S3 BUCKETS
    // ============================================
    const inputBucket = new s3.Bucket(this, 'InputBucket', {
      bucketName: `${prefix}-input-${this.stackName}`.toLowerCase(),
      versioned: true,
      removalPolicy: autoDeleteObjects ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED
    });

    const outputBucket = new s3.Bucket(this, 'OutputBucket', {
      bucketName: `${prefix}-output-${this.stackName}`.toLowerCase(),
      versioned: true,
      removalPolicy: autoDeleteObjects ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED
    });

    // ============================================
    // SQS QUEUES
    // ============================================
    const inputQueue = new sqs.Queue(this, 'InputQueue', {
      queueName: `${prefix}-input-${this.stackName}`.toLowerCase(),
      visibilityTimeout: Duration.seconds(timeout * 6), // AWS best practice: 6x Lambda timeout
      retentionPeriod: Duration.days(14)
    });

    const outputQueue = new sqs.Queue(this, 'OutputQueue', {
      queueName: `${prefix}-output-${this.stackName}`.toLowerCase(),
      visibilityTimeout: Duration.seconds(30),
      retentionPeriod: Duration.days(14)
    });

    // ============================================
    // LAMBDA FUNCTION
    // ============================================
    const repository = ecr.Repository.fromRepositoryName(
      this, 'EcrRepo', repoName
    );

    const fn = new lambda.DockerImageFunction(this, 'AgentFunction', {
      functionName: `${prefix}-${this.stackName}`.toLowerCase(),
      code: lambda.DockerImageCode.fromEcr(repository, {
        tagOrDigest: imageTag
      }),
      memorySize,
      timeout: Duration.seconds(timeout),
      environment: {
        INPUT_BUCKET: inputBucket.bucketName,
        OUTPUT_BUCKET: outputBucket.bucketName,
        OUTPUT_SQS_QUEUE_URL: outputQueue.queueUrl,
      }
    });

    // Grant Lambda permissions
    inputBucket.grantRead(fn);
    outputBucket.grantWrite(fn);
    outputQueue.grantSendMessages(fn);

    // Add SQS trigger
    fn.addEventSource(new SqsEventSource(inputQueue, {
      batchSize: 1,
    }));

    // ============================================
    // CONSUMER IAM POLICY
    // ============================================
    const consumerPolicy = new iam.PolicyDocument({
      statements: [
        // Write to Input S3 (upload files for processing)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject'],
          resources: [`${inputBucket.bucketArn}/*`]
        }),
        // Send to Input SQS (trigger processing)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sqs:SendMessage'],
          resources: [inputQueue.queueArn]
        }),
        // Read from Output S3 (download results)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [`${outputBucket.bucketArn}/*`]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [outputBucket.bucketArn]
        }),
        // Receive from Output SQS (get status updates)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'sqs:ReceiveMessage',
            'sqs:DeleteMessage',
            'sqs:GetQueueAttributes'
          ],
          resources: [outputQueue.queueArn]
        })
      ]
    });

    // ============================================
    // OUTPUTS
    // ============================================
    new CfnOutput(this, 'inputBucketName', {
      value: inputBucket.bucketName,
      description: 'Name of the input S3 bucket'
    });

    new CfnOutput(this, 'inputQueueUrl', {
      value: inputQueue.queueUrl,
      description: 'URL of the input SQS queue'
    });

    new CfnOutput(this, 'outputBucketName', {
      value: outputBucket.bucketName,
      description: 'Name of the output S3 bucket'
    });

    new CfnOutput(this, 'outputQueueUrl', {
      value: outputQueue.queueUrl,
      description: 'URL of the output SQS queue'
    });

    new CfnOutput(this, 'lambdaFunctionName', {
      value: fn.functionName,
      description: 'Name of the Lambda function'
    });

    new CfnOutput(this, 'awsRegion', {
      value: this.region,
      description: 'AWS region'
    });

    new CfnOutput(this, 'iamPolicyClaudeAgentClient', {
      value: JSON.stringify(consumerPolicy.toJSON()),
      description: 'IAM policy document for consumer applications'
    });
  }
}
