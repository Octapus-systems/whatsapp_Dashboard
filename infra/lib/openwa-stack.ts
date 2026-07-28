import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface OpenwaStackProps extends cdk.StackProps {
  /** CIDR allowed to reach SSH (port 22). Restrict this to your own IP. */
  sshAllowedCidr: string;
  /** GitHub repo to clone on boot. */
  repoUrl: string;
}

export class OpenwaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OpenwaStackProps) {
    super(scope, id, props);

    // Default VPC — no NAT gateway, avoids hourly NAT charges.
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    const sg = new ec2.SecurityGroup(this, 'OpenwaSg', {
      vpc,
      description: 'OpenWA host - HTTP/HTTPS public, SSH restricted',
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    sg.addIngressRule(ec2.Peer.ipv4(props.sshAllowedCidr), ec2.Port.tcp(22), 'SSH (restricted)');

    const role = new iam.Role(this, 'OpenwaRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -eux',
      'dnf update -y',
      'dnf install -y docker git',
      'systemctl enable --now docker',
      'usermod -aG docker ec2-user',

      // 1GB of RAM is not enough to build the API image (npm ci + nest build +
      // vite build). Swap keeps the build from being OOM-killed.
      'fallocate -l 4G /swapfile',
      'chmod 600 /swapfile',
      'mkswap /swapfile',
      'swapon /swapfile',
      "grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab",

      // compose v2 shells out to buildx, so both go in as docker CLI plugins.
      'mkdir -p /usr/libexec/docker/cli-plugins',
      'curl -SL https://github.com/docker/buildx/releases/download/v0.19.3/buildx-v0.19.3.linux-amd64 -o /usr/libexec/docker/cli-plugins/docker-buildx',
      'curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/libexec/docker/cli-plugins/docker-compose',
      'chmod +x /usr/libexec/docker/cli-plugins/docker-buildx /usr/libexec/docker/cli-plugins/docker-compose',
      'ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose',

      'mkdir -p /opt/openwa',
      `git clone ${props.repoUrl} /opt/openwa/app || (cd /opt/openwa/app && git pull)`,
      'cd /opt/openwa/app',
      'cp .env.minimal .env',

      // The committed compose file binds every port to 127.0.0.1, which is right
      // for laptops and wrong for a host meant to serve the internet. Publish
      // Traefik's entrypoint instead; it fronts both the API and the dashboard.
      'cat > docker-compose.aws.yml <<\'EOF\'',
      'services:',
      '  traefik:',
      '    ports:',
      "      - '80:80'",
      'EOF',

      'docker compose -f docker-compose.yml -f docker-compose.aws.yml --profile full up -d --build',
    );

    const instance = new ec2.Instance(this, 'OpenwaHost', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: sg,
      role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    const eip = new ec2.CfnEIP(this, 'OpenwaEip', {
      instanceId: instance.instanceId,
      domain: 'vpc',
    });

    new cdk.CfnOutput(this, 'PublicIp', { value: eip.ref });
    new cdk.CfnOutput(this, 'InstanceId', { value: instance.instanceId });
    new cdk.CfnOutput(this, 'SsmConnect', {
      value: `aws ssm start-session --target ${instance.instanceId}`,
    });
  }
}
