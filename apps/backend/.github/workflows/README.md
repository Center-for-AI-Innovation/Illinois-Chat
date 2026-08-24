# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the AI TA Backend project.

## 📁 Available Workflows

### `deploy-to-ecs.yml` - ECS Deployment

Automatically deploys the application to AWS ECS Fargate on code changes.

## 🚀 ECS Deployment - How It Works

The `deploy-to-ecs.yml` workflow triggers on pushes to `illinois-chat` branch when these files change:

- `ai_ta_backend/**` - Application code
- `requirements.txt` - Python dependencies
- `Self-Hosted-Dockerfile` - Container configuration
- `.github/workflows/deploy-to-ecs.yml` - This workflow file

## ⚙️ ECS Deployment - Configuration

Update these environment variables in `deploy-to-ecs.yml` to match your AWS setup:

```yaml
env:
  AWS_REGION: us-east-2
  ECR_REPOSITORY: uiuc-chat-backend
  ECS_SERVICE: backend-service-358yl957
  ECS_CLUSTER: uiuc-chat-dev
  ECS_TASK_DEFINITION: backend
  CONTAINER_NAME: backend
```

## 🔑 ECS Deployment - Required Secrets

Add these secrets in GitHub repository settings for ECS deployment:

- `AWS_ACCESS_KEY_ID` - AWS access key with ECR and ECS permissions
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key

## 📋 ECS Deployment - Process

1. **Build** - Creates Docker image with latest code
2. **Push** - Uploads image to ECR repository
3. **Update** - Downloads current ECS task definition
4. **Deploy** - Updates ECS service with new image
5. **Wait** - Ensures deployment completes successfully

## ⏱️ Typical Timing

- **Total**: 6-12 minutes
- **Build & Push**: 3-5 minutes
- **ECS Deployment**: 2-5 minutes

## 🛡️ Safety Features

- **Zero downtime** - Rolling deployment keeps service running
- **Health checks** - New tasks must pass `/health` endpoint checks
- **Automatic rollback** - Failed deployments revert automatically
- **Previous versions preserved** - Manual rollback always possible

## 🔧 ECS Deployment - Manual Trigger

Trigger ECS deployment manually via GitHub Actions tab → "Run workflow" button on `deploy-to-ecs.yml`.

## 📊 Monitoring

- **GitHub Actions**: Watch workflow progress in Actions tab
- **ECS Console**: Monitor deployment in AWS ECS service console
- **CloudWatch**: View application logs in `/ecs/ai-ta-backend` log group

## 🚫 ECS Deployment - Skip Conditions

Changes to these files won't trigger ECS deployment:

- Documentation (`docs/**`, `*.md`)
- Scripts (`scripts/**`)
- Test files (`test-docs/**`)
- VS Code config (`.vscode/**`)
- Media files (`media/**`)

## 🔍 ECS Deployment - Troubleshooting

### Common Issues:

- **Missing secrets**: Add AWS credentials to repository secrets
- **Permission errors**: Ensure IAM user has ECR and ECS permissions
- **Health check failures**: Check `/health` endpoint and application logs
- **Task definition errors**: Verify ECS service configuration matches workflow

### Quick Commands:

```bash
# Check ECS service status
aws ecs describe-services --cluster uiuc-chat-dev --services backend-service-358yl957

# View recent logs
aws logs tail /ecs/ai-ta-backend --follow

# Force new deployment (if needed)
aws ecs update-service --cluster uiuc-chat-dev --service backend-service-358yl957 --force-new-deployment
```
