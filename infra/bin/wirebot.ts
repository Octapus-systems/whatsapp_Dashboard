#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WirebotStack } from '../lib/wirebot-stack';

const app = new cdk.App();

const sshAllowedCidr = app.node.tryGetContext('sshAllowedCidr') ?? '127.0.0.1/32';
const repoUrl =
  app.node.tryGetContext('repoUrl') ?? 'https://github.com/Octapus-systems/whatsapp_Dashboard.git';

new WirebotStack(app, 'OpenwaStack', {
  sshAllowedCidr,
  repoUrl,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: app.node.tryGetContext('region') ?? 'ap-south-1',
  },
});
