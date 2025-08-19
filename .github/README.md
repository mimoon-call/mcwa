# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD of the Node.js TypeScript application.

## Workflows

### 1. `deploy.yml` - Main Deployment Workflow

This workflow handles the complete CI/CD pipeline for deploying to AWS.

**Triggers:**

- Push to `main` or `develop` branches
- Manual workflow dispatch with environment selection
- Pull requests (runs tests only)

**Jobs:**

1. **Test and Lint** - Runs linting, tests, and builds the application
2. **Security Scan** - Runs Trivy vulnerability scanner
3. **Build and Push** - Builds and pushes Docker image to ECR
4. **Terraform Plan** - Creates Terraform plan for infrastructure changes
5. **Deploy to Staging** - Deploys to staging environment (develop branch)
6. **Deploy to Production** - Deploys to production environment (main branch)
7. **Notify** - Sends deployment notifications

**Triggers:**

- Pull requests to `main` or `develop` branches

**Jobs:**

1. **Test and Lint** - Runs linting, tests, and builds
2. **Security Scan** - Runs Trivy vulnerability scanner
3. **Docker Build Test** - Tests Docker image build (no push)

## Required GitHub Secrets

You need to configure the following secrets in your GitHub repository:

### AWS Credentials

- `AWS_ACCESS_KEY_ID` - AWS access key ID
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key

### Optional Notifications

- `SLACK_WEBHOOK_URL` - Slack webhook URL for deployment notifications

## Environment Protection Rules

The workflow uses GitHub Environments for staging and production deployments:

### Staging Environment

- **Protection Rules:** None (auto-deploy from develop branch)
- **Required Reviewers:** None

### Production Environment

- **Protection Rules:**
  - Required reviewers: 1
  - Wait timer: 0 minutes
  - Deployment branches: main branch only

## Setup Instructions

### 1. Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following secrets:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `SLACK_WEBHOOK_URL` (optional)

### 2. Configure AWS IAM User

Create an IAM user with the following permissions:

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
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["ecs:UpdateService", "ecs:DescribeServices", "ecs:DescribeTasks", "ecs:ListTasks"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": ["arn:aws:s3:::terraform-state-bucket-*", "arn:aws:s3:::terraform-state-bucket-*/*"]
    }
  ]
}
```

### 3. Configure Terraform Backend

Ensure your Terraform backend is configured correctly in `terraform/main.tf`:

```hcl
backend "s3" {
  bucket = "your-terraform-state-bucket"
  key    = "react-ssr-app/terraform.tfstate"
  region = "us-east-1"
}
```

### 4. Environment Variables

The workflow uses these environment variables (can be customized):

- `AWS_REGION`: us-east-1
- `ECR_REPOSITORY_NAME`: react-ssr-app
- `ECS_CLUSTER_NAME`: react-ssr-app-cluster
- `ECS_SERVICE_NAME`: react-ssr-app-service
- `ECS_TASK_DEFINITION_NAME`: react-ssr-app-task

## Deployment Flow

### Automatic Deployments

1. **Push to `develop` branch** → Deploy to staging
2. **Push to `main` branch** → Deploy to production
3. **Pull Request** → Run tests and security scans only

### Manual Deployments

1. Go to Actions tab in GitHub
2. Select "Deploy to AWS" workflow
3. Click "Run workflow"
4. Choose environment (staging/production)
5. Optionally specify image tag
6. Click "Run workflow"

## Monitoring and Notifications

### Deployment Status

- Check the Actions tab for workflow status
- Review logs for any deployment issues
- Monitor ECS service health in AWS Console

### Notifications

- GitHub release is created for production deployments
- PR comments with deployment URLs for staging
- Optional Slack notifications (if configured)

## Troubleshooting

### Common Issues

1. **AWS Credentials Error**
   - Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY secrets
   - Check IAM user permissions

2. **ECR Login Failed**
   - Ensure ECR repository exists
   - Check AWS region configuration

3. **Terraform Plan Failed**
   - Verify Terraform backend configuration
   - Check Terraform state file permissions

4. **ECS Service Update Failed**
   - Check ECS cluster and service names
   - Verify task definition compatibility

### Debug Steps

1. Check workflow logs in GitHub Actions
2. Verify AWS resources in AWS Console
3. Test Terraform commands locally
4. Check ECR repository for pushed images

## Security Considerations

1. **Secrets Management**
   - Use GitHub Secrets for sensitive data
   - Rotate AWS credentials regularly
   - Use least privilege IAM policies

2. **Image Security**
   - Trivy scans for vulnerabilities
   - Use multi-stage Docker builds
   - Scan base images regularly

3. **Infrastructure Security**
   - Terraform state stored in S3 with encryption
   - Use private subnets for ECS tasks
   - Configure security groups properly
