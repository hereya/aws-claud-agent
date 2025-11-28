# hereya/claude-agent

A Hereya CDK package that provisions AWS infrastructure for a Claude Agent worker pattern.

## Architecture

```
                                    ┌──────────────┐
                                    │   Your App   │
                                    └──┬────────┬──┘
                                       │        │
                          upload file  │        │  send job message
                               ┌───────┘        └────────┐
                               │                         │
                               ▼                         ▼
                          ┌──────────┐            ┌──────────┐
                          │  Input   │            │  Input   │
                          │   S3     │            │   SQS    │
                          │  Bucket  │            │  Queue   │
                          └────┬─────┘            └────┬─────┘
                               ▲                       │
                               │  read file    trigger │
                               │                       │
                               │      ┌────────────────┘
                               │      │
                               │      ▼
                          ┌─────────────────────────────┐
                          │      Lambda Function        │
                          │  ┌─────────────────────┐    │
                          │  │   Claude Agent SDK  │    │
                          │  └─────────────────────┘    │
                          └─────────────┬───────────────┘
                                        │
                               write result & send status
                                        │
                               ┌────────┴────────┐
                               ▼                 ▼
                          ┌──────────┐    ┌──────────┐
                          │  Output  │    │  Output  │
                          │   S3     │    │   SQS    │
                          │  Bucket  │    │  Queue   │
                          └──────────┘    └────┬─────┘
                                               │
                                               │  read status
                                               ▼
                                       ┌───────────────┐
                                       │   Your App    │
                                       └───────────────┘
```

## Usage

```bash
# Deploy with Hereya
hereya add hereya/claude-agent -p "imageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest"

# Or deploy directly with CDK
STACK_NAME=my-agent imageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest npx cdk deploy
```

## Inputs (Environment Variables)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STACK_NAME` | Yes | - | Stack name (provided by Hereya) |
| `imageUri` | Yes | - | ECR Docker image URL |
| `namePrefix` | No | `agent` | Prefix for resource names |
| `memorySize` | No | `1024` | Lambda memory in MB |
| `timeout` | No | `900` | Lambda timeout in seconds |
| `autoDeleteObjects` | No | `false` | Auto-delete S3 objects on stack destruction |

## Outputs

| Output | Description |
|--------|-------------|
| `inputBucketName` | Name of the input S3 bucket |
| `inputQueueUrl` | URL of the input SQS queue |
| `outputBucketName` | Name of the output S3 bucket |
| `outputQueueUrl` | URL of the output SQS queue |
| `lambdaFunctionName` | Name of the Lambda function |
| `awsRegion` | AWS region |
| `iamPolicyClaudeAgentClient` | Combined IAM policy JSON for consumer apps |

## Lambda Environment Variables

The Lambda function receives these environment variables:

| Variable | Description |
|----------|-------------|
| `INPUT_BUCKET` | Name of the input S3 bucket |
| `OUTPUT_BUCKET` | Name of the output S3 bucket |
| `OUTPUT_SQS_QUEUE_URL` | URL of the output SQS queue |

## Consumer IAM Policy

The `iamPolicyClaudeAgentClient` output contains an IAM policy that grants:
- `s3:PutObject` on Input S3 bucket
- `sqs:SendMessage` on Input SQS queue
- `s3:GetObject`, `s3:ListBucket` on Output S3 bucket
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` on Output SQS queue

## Development

```bash
npm install      # Install dependencies
npm run build    # Compile TypeScript
npm run test     # Run tests
npm run watch    # Watch mode
```
