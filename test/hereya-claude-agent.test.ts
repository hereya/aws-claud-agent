import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as HereyaClaudeAgent from '../lib/hereya-claude-agent-stack';

describe('HereyaClaudeAgentStack', () => {
  const TEST_IMAGE_URI = '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest';

  beforeEach(() => {
    // Set required env vars
    process.env.imageUri = TEST_IMAGE_URI;
    delete process.env.namePrefix;
    delete process.env.memorySize;
    delete process.env.timeout;
    delete process.env.autoDeleteObjects;
  });

  afterEach(() => {
    delete process.env.imageUri;
    delete process.env.namePrefix;
    delete process.env.memorySize;
    delete process.env.timeout;
    delete process.env.autoDeleteObjects;
  });

  test('Creates two S3 buckets with proper configuration', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Should create exactly 2 S3 buckets
    template.resourceCountIs('AWS::S3::Bucket', 2);

    // Both should have proper security config
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled'
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [{
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: 'AES256'
          }
        }]
      }
    });
  });

  test('Creates two SQS queues', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Should create exactly 2 SQS queues
    template.resourceCountIs('AWS::SQS::Queue', 2);
  });

  test('Input queue visibility timeout is 6x Lambda timeout', () => {
    process.env.timeout = '300';
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Input queue should have visibility timeout = 300 * 6 = 1800 seconds
    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 1800,
      QueueName: 'agent-input-teststack'
    });
  });

  test('Creates Lambda function from ECR image', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Should create Lambda function
    template.resourceCountIs('AWS::Lambda::Function', 1);

    // Lambda should have Docker package type
    template.hasResourceProperties('AWS::Lambda::Function', {
      PackageType: 'Image'
    });
  });

  test('Lambda uses default memory and timeout', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 1024,
      Timeout: 900
    });
  });

  test('Lambda uses custom memory and timeout when set', () => {
    process.env.memorySize = '2048';
    process.env.timeout = '600';

    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 2048,
      Timeout: 600
    });
  });

  test('Lambda has environment variables for bucket and queue', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);
    const json = template.toJSON();

    // Find Lambda function
    const lambdaResource = Object.values(json.Resources).find(
      (r: any) => r.Type === 'AWS::Lambda::Function'
    ) as any;

    expect(lambdaResource.Properties.Environment.Variables).toHaveProperty('INPUT_BUCKET');
    expect(lambdaResource.Properties.Environment.Variables).toHaveProperty('OUTPUT_BUCKET');
    expect(lambdaResource.Properties.Environment.Variables).toHaveProperty('OUTPUT_SQS_QUEUE_URL');
  });

  test('Creates SQS event source mapping for Lambda', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Should have event source mapping
    template.resourceCountIs('AWS::Lambda::EventSourceMapping', 1);

    // Batch size should be 1
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: 1
    });
  });

  test('Stack creates all required CloudFormation outputs', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);
    const json = template.toJSON();

    expect(json.Outputs).toBeDefined();
    expect(json.Outputs).toHaveProperty('inputBucketName');
    expect(json.Outputs).toHaveProperty('inputQueueUrl');
    expect(json.Outputs).toHaveProperty('outputBucketName');
    expect(json.Outputs).toHaveProperty('outputQueueUrl');
    expect(json.Outputs).toHaveProperty('lambdaFunctionName');
    expect(json.Outputs).toHaveProperty('awsRegion');
    expect(json.Outputs).toHaveProperty('iamPolicyClaudeAgentClient');
  });

  test('Consumer IAM policy contains correct actions', () => {
    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);
    const json = template.toJSON();

    const policyOutput = json.Outputs.iamPolicyClaudeAgentClient.Value;
    expect(policyOutput).toHaveProperty('Fn::Join');

    const policyParts = policyOutput['Fn::Join'][1];
    const policyString = policyParts.join('');

    // Input S3 write
    expect(policyString).toContain('s3:PutObject');
    // Input SQS send
    expect(policyString).toContain('sqs:SendMessage');
    // Output S3 read
    expect(policyString).toContain('s3:GetObject');
    expect(policyString).toContain('s3:ListBucket');
    // Output SQS receive
    expect(policyString).toContain('sqs:ReceiveMessage');
    expect(policyString).toContain('sqs:DeleteMessage');
  });

  test('Uses default namePrefix when not set', () => {
    delete process.env.namePrefix;

    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Check that input bucket uses default prefix
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'agent-input-teststack'
    });
  });

  test('Uses custom namePrefix when set', () => {
    process.env.namePrefix = 'myapp';

    const app = new cdk.App();
    const stack = new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Check that input bucket uses custom prefix
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'myapp-input-teststack'
    });
  });

  test('Throws error when imageUri is not set', () => {
    delete process.env.imageUri;

    const app = new cdk.App();
    expect(() => {
      new HereyaClaudeAgent.HereyaClaudeAgentStack(app, 'TestStack');
    }).toThrow('imageUri environment variable is required');
  });

  test('Respects autoDeleteObjects parameter', () => {
    // Test with autoDeleteObjects = true
    process.env.autoDeleteObjects = 'true';
    const app1 = new cdk.App();
    const stack1 = new HereyaClaudeAgent.HereyaClaudeAgentStack(app1, 'TestStack');
    const template1 = Template.fromStack(stack1);
    const json1 = template1.toJSON();

    const bucket1 = Object.values(json1.Resources).find(
      (r: any) => r.Type === 'AWS::S3::Bucket'
    ) as any;
    expect(bucket1.DeletionPolicy).toBe('Delete');

    // Test with autoDeleteObjects = false (default)
    delete process.env.autoDeleteObjects;
    const app2 = new cdk.App();
    const stack2 = new HereyaClaudeAgent.HereyaClaudeAgentStack(app2, 'TestStack');
    const template2 = Template.fromStack(stack2);
    const json2 = template2.toJSON();

    const bucket2 = Object.values(json2.Resources).find(
      (r: any) => r.Type === 'AWS::S3::Bucket'
    ) as any;
    expect(bucket2.DeletionPolicy).toBe('Retain');
  });
});
