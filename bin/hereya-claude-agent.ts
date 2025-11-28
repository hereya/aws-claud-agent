#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HereyaClaudeAgentStack } from '../lib/hereya-claude-agent-stack';

const app = new cdk.App();
new HereyaClaudeAgentStack(app, process.env.STACK_NAME!, {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  });
