# Cloud deployment (ECS)

How the hosted instance is deployed, and a starting point for deploying your own. For a single machine, the [Docker Compose stack](index.md) is much simpler; use this page when you need managed cloud infrastructure.

## Architecture

```
GitHub → GitHub Actions → AWS ECR → AWS ECS Fargate
```

1. **GitHub Actions** builds the four application images and pushes them to ECR.
2. **ECR** stores the images.
3. **ECS Fargate** runs them as four services.
4. **CloudWatch** collects logs and metrics.

The repository contains no ECS task definitions and no infrastructure code for the cluster: the services, task definitions, load balancer and the infrastructure services (Postgres, Redis, RabbitMQ, object storage, Keycloak, Sim) are managed outside the repository. The workflows only build images and force a new deployment of existing services.

## Workflows

Four workflows live in `.github/workflows/`:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `illinois-chat-dev.yml` | push to `main` touching `apps/**`, `infra/**` or `.github/workflows/**` | Runs Trunk on the pushed commits, then builds and pushes `uiuc-chat-backend` (from `Self-Hosted-Dockerfile`), `uiuc-chat-worker` (from `ai_ta_backend/rabbitmq/`), `uiuc-chat-frontend` and `uiuc-chat-crawlee`, each tagged with the commit SHA, `latest` and `main`, then runs `aws ecs update-service --force-new-deployment` on the four services. |
| `release-images.yml` | a GitHub release is published | Builds and pushes the same four images tagged with the release tag. Trunk runs on the full tree but cannot fail the build. No ECS update. |
| `pr-checks.yml` | pull requests to `main` | Lint and frontend tests; see [Testing & CI](../contributing/testing-ci.md). |
| `docs.yml` | push to `main` touching `docs/**`, `mkdocs.yml` or the workflow; or manual run | Strict MkDocs build and GitHub Pages deploy of this site. |

The frontend build fails on purpose when `NEXT_PUBLIC_KEYCLOAK_URL` is empty or lacks a trailing slash, because `NEXT_PUBLIC_*` values are inlined at build time and cannot be corrected by runtime environment variables.

### Secrets and variables

Set these under **Settings → Secrets and variables → Actions** in the repository:

| Secret | Used by |
| --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | both image workflows |
| `ECS_CLUSTER_NAME`, `ECS_FRONTEND_SERVICE_NAME`, `ECS_BACKEND_SERVICE_NAME`, `ECS_WORKER_SERVICE_NAME`, `ECS_CRAWLEE_SERVICE_NAME` | `illinois-chat-dev.yml` |
| `NEXT_PUBLIC_KEYCLOAK_URL`, `NEXT_PUBLIC_KEYCLOAK_REALM`, `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID` | frontend image (`PROD_NEXT_PUBLIC_KEYCLOAK_URL` for releases) |
| `POSTHOG_API_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | frontend image (`PROD_*` variants for releases) |

Repository variables (not secrets): `NEXT_PUBLIC_USE_ILLINOIS_CHAT_CONFIG` (default `True`) and `NEXT_PUBLIC_ILLINOIS_CHAT_BANNER_CONTENT`.

### IAM permissions

The AWS user whose keys the workflows use needs to push to ECR and redeploy the services:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
        "arn:aws:iam::<account-id>:role/ecsTaskRole"
      ]
    }
  ]
}
```

## Health checks

The backend answers `GET /health` on port 8001:

```json
{"status": "healthy", "service": "ai-ta-backend", "timestamp": 1643723400.123}
```

`apps/backend/Dockerfile.ecs` declares a Docker `HEALTHCHECK` against that route (30 s interval, 60 s start period, 3 retries), but the workflows build the backend from `Self-Hosted-Dockerfile`, which has none. Configure the health check on the ECS service or load balancer instead.

Environment variables for each service are set in its task definition; keep secrets in AWS Secrets Manager. The [Configuration reference](configuration.md) lists what each service reads, including the SMTP variables the backend needs to email export links.

## Deploying and rolling back

Every push to `main` that touches the application paths deploys. `update-service --force-new-deployment` is a rolling deployment: new tasks start with the new image, pass their health checks, and the old tasks are stopped. Expect two to five minutes.

`illinois-chat-dev.yml` is the only pipeline that deploys to the cluster. A deployment registers no new task definition: the service keeps its current definition and pulls the image tag it names (`main` on the hosted instance) again. This is deliberate. Every deploy ships the same tag, so a new revision per deploy would only add identical copies. A new revision appears only when someone changes the definition itself (environment variables, CPU and memory, log settings), and the revision history then records configuration changes, not deploys.

The cost is that the tag is mutable: any task that starts later, for example after a crash or when the service scales out, also pulls whatever `main` points to at that moment. Rolling back to an earlier revision does not roll back the code either, because that revision names the same `main` tag. To roll back, move the tag back to a known-good image. Every image is also pushed under its commit SHA, so the target is always in ECR:

```bash
# point `main` at a known-good commit's image
REPO=uiuc-chat-backend
GOOD=<good-sha>
MANIFEST=$(aws ecr batch-get-image --repository-name "$REPO" \
  --image-ids imageTag="$GOOD" --query 'images[0].imageManifest' --output text)
MEDIA_TYPE=$(aws ecr batch-get-image --repository-name "$REPO" \
  --image-ids imageTag="$GOOD" --query 'images[0].imageManifestMediaType' --output text)
aws ecr put-image --repository-name "$REPO" --image-tag main \
  --image-manifest "$MANIFEST" --image-manifest-media-type "$MEDIA_TYPE"

# restart the service so it pulls the retagged image
aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
```

Repeat for each image you need to roll back (the backend and worker are built from the same commit, so roll them back together). The next push to `main` moves the tag forward again. Use an earlier task-definition revision only to undo a configuration change:

```bash
# which task definition is the service running?
aws ecs describe-services --cluster <cluster> --services <service> \
  --query 'services[0].taskDefinition'

# undo a configuration change
aws ecs update-service --cluster <cluster> --service <service> \
  --task-definition <family>:<previous-revision>
```

## Monitoring

```bash
# service status and recent events
aws ecs describe-services --cluster <cluster> --services <service>

# tail logs
aws logs tail /ecs/<service> --follow

# redeploy by hand
aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment
```

- **Logs** — CloudWatch, one log group per ECS service. Set `LOG_LEVEL` (default `INFO`) per container in the task definition. In each container's `logConfiguration.options`, `"mode": "non-blocking"` with `"max-buffer-size": "25m"` keeps a slow log stream from blocking the app, and `"awslogs-datetime-format": "%Y-%m-%dT%H:%M:%S"` keeps a traceback in one event with its line. Set the datetime format only on the services whose log lines start with the time in this form (the backend, the worker and the frontend). Do not set it on the web crawler: its lines start with a different form. How to read the lines: "Reading the logs" on [Troubleshooting](troubleshooting.md#reading-the-logs).
- **Service events** — ECS console › Cluster › Service › Events.
- **Workflow runs** — the Actions tab.

## Cost and security practices

- Use Fargate Spot for non-production environments; configure auto-scaling; set CloudWatch cost alarms.
- Store sensitive values in AWS Secrets Manager; use minimal IAM roles; enable CloudTrail; run production tasks in private subnets.

## Troubleshooting

- **Workflow fails at "Login to Amazon ECR"** — check the AWS secrets and the ECR permissions above.
- **Service won't start** — check CloudWatch logs, verify the task definition, confirm the image tag exists in ECR.
- **New tasks fail health checks** — check CloudWatch logs; confirm the health check targets `/health` on port 8001 for the backend.
- **Image pull errors** — verify the task execution role can pull from ECR and that the image was pushed.
- **Network connectivity** — check security-group rules, subnet configuration and public-IP assignment.
