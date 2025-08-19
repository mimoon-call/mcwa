# Terraform Infrastructure for Node.js TypeScript Application

This directory contains Terraform configurations to deploy a Node.js TypeScript application on AWS using ECS Fargate, with S3 for static assets served through CloudFront, and HTTPS support.

## Architecture Overview

The infrastructure includes:

- **VPC** with public and private subnets across 2 availability zones
- **ECS Fargate** cluster running the Node.js application
- **Application Load Balancer (ALB)** with HTTPS termination
- **S3 Bucket** for static assets with versioning enabled
- **CloudFront Distribution** serving S3 content and proxying API requests to ALB
- **ACM Certificate** for HTTPS support
- **ECR Repository** for Docker images
- **CloudWatch Logs** for application logging

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** (version >= 1.0)
3. **Docker** for building and pushing images
4. **Domain name** registered in Route 53 (optional - AWS will provide default domains)

## Quick Start

### 1. Configure Variables

Copy the example variables file and customize it:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your specific values:

```hcl
# Update these values
project_name = "your-app-name"
aws_region = "us-east-1"

# Optional: Add custom domain names (leave empty for AWS default domains)
domain_name = ""
cloudfront_domain_name = ""
```

### 2. Initialize Terraform

```bash
cd terraform
terraform init
```

### 3. Plan the Deployment

```bash
terraform plan
```

### 4. Apply the Infrastructure

```bash
terraform apply
```

**Note**: If you provide a custom domain name, the first deployment will create an ACM certificate that requires DNS validation. You'll need to add the validation records to your DNS provider. If no custom domain is provided, AWS will use default domains.

### 5. Deploy Your Application

After the infrastructure is created, deploy your application:

```bash
# From the project root
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

## Infrastructure Components

### VPC and Networking

- **VPC CIDR**: 10.0.0.0/16
- **Public Subnets**: 10.0.101.0/24, 10.0.102.0/24
- **Private Subnets**: 10.0.1.0/24, 10.0.2.0/24
- **NAT Gateway**: Single NAT gateway for cost optimization

### ECS Configuration

- **Launch Type**: Fargate (serverless)
- **CPU**: 256 (.25 vCPU)
- **Memory**: 512 MB
- **Desired Count**: 2 tasks for high availability
- **Health Check**: `/health` endpoint

### Load Balancer

- **Type**: Application Load Balancer
- **Protocol**:
  - With custom domain: HTTPS (443) with HTTP to HTTPS redirect
  - Without custom domain: HTTP (80) only
- **SSL Policy**: ELBSecurityPolicy-TLS-1-2-2017-01 (when using custom domain)
- **Health Check Path**: `/health`

### S3 and CloudFront

- **S3 Bucket**: Private bucket with versioning enabled
- **CloudFront**:
  - Serves static assets from S3
  - Proxies `/api/*` requests to ALB
  - No caching for API requests
  - HTTPS with custom domain, HTTP with default domain

### Security

- **Security Groups**: Restrictive access between ALB and ECS tasks
- **IAM Roles**: Least privilege access for ECS tasks
- **S3 Bucket Policy**: Only CloudFront can access S3 content
- **HTTPS**: Enabled when custom domain is provided

## Variables

| Variable                 | Description          | Default                        |
| ------------------------ | -------------------- | ------------------------------ |
| `aws_region`             | AWS region           | `us-east-1`                    |
| `project_name`           | Project name         | `react-ssr-app`                |
| `environment`            | Environment          | `production`                   |
| `vpc_cidr`               | VPC CIDR block       | `10.0.0.0/16`                  |
| `availability_zones`     | AZs for subnets      | `["us-east-1a", "us-east-1b"]` |
| `task_cpu`               | ECS task CPU units   | `256`                          |
| `task_memory`            | ECS task memory (MB) | `512`                          |
| `app_port`               | Application port     | `3000`                         |
| `service_desired_count`  | Number of ECS tasks  | `2`                            |
| `domain_name`            | Domain name          | `example.com`                  |
| `cloudfront_domain_name` | CloudFront domain    | `cdn.example.com`              |

## Outputs

After successful deployment, Terraform will output:

- `alb_dns_name`: ALB DNS name
- `cloudfront_domain_name`: CloudFront distribution domain
- `ecr_repository_url`: ECR repository URL
- `s3_bucket_name`: S3 bucket name
- `acm_certificate_arn`: ACM certificate ARN

## DNS Configuration

### For Custom Domain

1. Create an A record pointing to the ALB DNS name
2. Create a CNAME record for CloudFront pointing to the CloudFront domain
3. Add ACM certificate validation records to your DNS

### Example DNS Records

```
# Main domain
your-domain.com.     A     <ALB_DNS_NAME>

# CloudFront subdomain
cdn.your-domain.com. CNAME <CLOUDFRONT_DOMAIN>

# ACM validation (temporary)
_validation_record.  CNAME <ACM_VALIDATION_RECORD>
```

### Without Custom Domain

When no custom domain is provided, AWS will generate default domains:

- **ALB Domain**: `your-alb-name.region.elb.amazonaws.com`
- **CloudFront Domain**: `random-string.cloudfront.net`

These domains are automatically provided by AWS and require no DNS configuration.

## Monitoring and Logging

- **CloudWatch Logs**: Application logs are sent to CloudWatch
- **ECS Service Events**: Monitor service deployment and health
- **ALB Access Logs**: Can be enabled for detailed request logging
- **CloudFront Logs**: Can be enabled for CDN analytics

## Cost Optimization

- **Single NAT Gateway**: Reduces costs compared to multiple NAT gateways
- **Fargate Spot**: Can be enabled for non-production workloads
- **CloudFront Price Class**: Uses PriceClass_100 (US, Canada, Europe)
- **S3 Lifecycle**: ECR lifecycle policy keeps only 5 recent images

## Security Best Practices

- **Private Subnets**: ECS tasks run in private subnets
- **Security Groups**: Minimal required access
- **IAM Roles**: Least privilege access
- **HTTPS**: All traffic encrypted when custom domain is provided
- **S3 Bucket Policy**: Restricts access to CloudFront only

## Troubleshooting

### Common Issues

1. **Certificate Validation**: Ensure DNS validation records are added
2. **ECS Service Not Starting**: Check CloudWatch logs for application errors
3. **Health Check Failures**: Verify `/health` endpoint is working
4. **S3 Access Denied**: Check bucket policy and IAM roles

### Useful Commands

```bash
# Check ECS service status
aws ecs describe-services --cluster react-ssr-app-cluster --services react-ssr-app-service

# View CloudWatch logs
aws logs tail /ecs/react-ssr-app --follow

# Check ALB target health
aws elbv2 describe-target-health --target-group-arn <TARGET_GROUP_ARN>
```

## Cleanup

To destroy the infrastructure:

```bash
cd terraform
terraform destroy
```

**Warning**: This will delete all resources including data in S3 buckets.

## Support

For issues or questions:

1. Check CloudWatch logs for application errors
2. Review ECS service events
3. Verify security group configurations
4. Check IAM role permissions
