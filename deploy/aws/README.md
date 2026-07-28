# AWS EC2 Deployment

Use one Ubuntu EC2 instance with Docker and local PostgreSQL. Recommended minimum: `t3.small` or `t3.medium`; avoid `t2.micro`/free tier for Chromium.

1. Complete AWS account setup first.
2. Create an EC2 Ubuntu instance in `ap-south-1`.
3. Security group inbound rules: SSH `22` from your IP, HTTP `80` from anywhere.
4. SSH into the instance and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Octapus-systems/whatsapp_Dashboard/QrCodeandconnecting/deploy/aws/deploy-ec2.sh | bash
```

5. Edit `/opt/openwa/deploy/aws/.env` and set `DATABASE_PASSWORD` plus a strong `API_MASTER_KEY`.
6. Rerun:

```bash
/opt/openwa/deploy/aws/deploy-ec2.sh
```

Your URL will be:

```text
http://<ec2-public-ip>/
```

This setup stores WhatsApp session data and PostgreSQL data in Docker volumes on the EC2 instance. Rotate the old Render DB password because it was shared in chat.
