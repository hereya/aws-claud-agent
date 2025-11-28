# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and compile automatically
- `npm run test` - Run Jest unit tests
- `npx cdk synth` - Synthesize CloudFormation template (requires `STACK_NAME` and `imageUri`)
- `npx cdk diff` - Compare deployed stack with current state
- `npx cdk deploy` - Deploy stack to AWS

## Example Usage

```bash
# Synthesize template
STACK_NAME=my-agent imageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest npx cdk synth

# Deploy with custom settings
STACK_NAME=my-agent imageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/my-agent:latest memorySize=2048 timeout=600 npx cdk deploy
```

## Architecture

This is a Hereya CDK package (`hereya/claude-agent`) that provisions AWS infrastructure for a Claude Agent worker pattern.

**Resources created:**
- Input S3 bucket - for file uploads
- Input SQS queue - triggers Lambda (visibility timeout = 6x Lambda timeout)
- Lambda function - from ECR Docker image
- Output S3 bucket - for results
- Output SQS queue - for status messages

**Flow:**
1. Producer uploads file to Input S3
2. Producer sends job message to Input SQS
3. Lambda reads file, processes with Claude Agent SDK
4. Lambda writes result to Output S3
5. Lambda sends status to Output SQS
6. Consumer reads status from Output SQS

## Environment Variables (Inputs)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STACK_NAME` | Yes | - | Stack name (provided by Hereya) |
| `imageUri` | Yes | - | ECR Docker image URL |
| `namePrefix` | No | `agent` | Prefix for resource names |
| `memorySize` | No | `1024` | Lambda memory in MB |
| `timeout` | No | `900` | Lambda timeout in seconds |
| `autoDeleteObjects` | No | `false` | Auto-delete S3 objects on stack destruction |

## CfnOutputs (Exports)

| Output | Description |
|--------|-------------|
| `inputBucketName` | Name of the input S3 bucket |
| `inputQueueUrl` | URL of the input SQS queue |
| `outputBucketName` | Name of the output S3 bucket |
| `outputQueueUrl` | URL of the output SQS queue |
| `lambdaFunctionName` | Name of the Lambda function |
| `awsRegion` | AWS region |
| `iamPolicyClaudeAgentClient` | Combined IAM policy JSON for consumers |

## Project Structure

- `bin/hereya-claude-agent.ts` - CDK app entry point
- `lib/hereya-claude-agent-stack.ts` - Main stack definition
- `hereyarc.yaml` - Hereya package manifest
- `test/` - Jest tests using `aws-cdk-lib/assertions`
