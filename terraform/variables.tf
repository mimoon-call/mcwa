variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "react-ssr-app"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "task_cpu" {
  description = "CPU units for the ECS task"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Memory for the ECS task"
  type        = number
  default     = 512
}

variable "app_port" {
  description = "Port the application runs on"
  type        = number
  default     = 3000
}

variable "service_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "example.com"
}

variable "cloudfront_domain_name" {
  description = "Domain name for CloudFront distribution"
  type        = string
  default     = "cdn.example.com"
}

variable "app_image_tag" {
  description = "Docker image tag for the application"
  type        = string
  default     = "latest"
}

variable "access_token_key" {
  description = "Secret key for access tokens (JWT, etc.)"
  type        = string
  default     = "your_access_token_key_here"
}

variable "webhook_secret" {
  description = "Secret for securing webhook endpoint"
  type        = string
  default     = "your_webhook_secret_here"
}

variable "client_origin" {
  description = "The allowed CORS origin for the app (CloudFront domain, e.g. https://dxxxxxxx.cloudfront.net)"
  type        = string
  default     = ""
}
