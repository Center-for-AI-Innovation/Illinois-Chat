# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the AI TA Backend project.

## 📁 Available Workflows

### `build-and-push-on-tag.yml` - Build and Push Images

Builds the backend and worker images and pushes them to Amazon ECR. It only
publishes images — deployment is handled separately.

## 🚀 How It Works

The workflow triggers on any pushed git tag and runs two independent jobs:

| Job                     | Dockerfile                  | ECR repository      |
| ----------------------- | --------------------------- | ------------------- |
| `build-and-push`        | `Self-Hosted-Dockerfile`    | `uiuc-chat-backend` |
| `build-and-push-worker` | `ai_ta_backend/rabbitmq/`   | `uiuc-chat-worker`  |

Both images are tagged with the git tag that triggered the run.

## ⚙️ Configuration

Update these environment variables in `build-and-push-on-tag.yml` to match your
AWS setup:

```yaml
env:
  AWS_REGION: us-east-2
  ECR_REPOSITORY: uiuc-chat-backend
  ECR_REPOSITORY_WORKER: uiuc-chat-worker
```

## 🔑 Required Secrets

Add these secrets in GitHub repository settings:

- `AWS_ACCESS_KEY_ID` - AWS access key with ECR push permissions
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key

## 📋 Process

1. **Checkout** - Fetches the tagged commit
2. **Authenticate** - Configures AWS credentials and logs in to ECR
3. **Tag** - Derives the image tag from the git tag
4. **Build & Push** - Builds the image and pushes it to ECR

## 🔍 Troubleshooting

### Common Issues:

- **Missing secrets**: Add AWS credentials to repository secrets
- **Permission errors**: Ensure the IAM user has ECR push permissions
- **Wrong tag**: The image tag is taken verbatim from the git tag, so re-tagging
  requires a new tag or a manual ECR cleanup

### Quick Commands:

```bash
# List pushed backend image tags
aws ecr list-images --repository-name uiuc-chat-backend --region us-east-2

# List pushed worker image tags
aws ecr list-images --repository-name uiuc-chat-worker --region us-east-2
```
