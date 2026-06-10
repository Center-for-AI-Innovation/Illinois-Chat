import { S3Client } from '@aws-sdk/client-s3'

const region = process.env.AWS_REGION

// Since AWS SDK 3.729.0, uploads default to CRC32 checksums and downloads to
// checksum validation, which MinIO and other S3-compatible stores may reject.
// 'WHEN_REQUIRED' restores the pre-3.729 behavior for custom-endpoint clients.
const s3CompatibleChecksumConfig = {
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
} as const

// S3 Client configuration
let s3Client: S3Client | null = null
if (region && process.env.AWS_KEY && process.env.AWS_SECRET) {
  const baseConfig: any = {
    region,
    credentials: {
      accessKeyId: process.env.AWS_KEY!,
      secretAccessKey: process.env.AWS_SECRET!,
    },
  }

  if (process.env.LOCAL_MINIO === 'true' && process.env.MINIO_ENDPOINT) {
    baseConfig.endpoint = process.env.MINIO_ENDPOINT
    baseConfig.forcePathStyle = true // required for MinIO / LocalStack
    Object.assign(baseConfig, s3CompatibleChecksumConfig)
  }

  s3Client = new S3Client(baseConfig)
} else if (region) {
  s3Client = new S3Client({ region })
}

// MinIO Client configuration
let vyriadMinioClient: S3Client | null = null
if (
  process.env.MINIO_KEY &&
  process.env.MINIO_SECRET &&
  process.env.MINIO_ENDPOINT
) {
  vyriadMinioClient = new S3Client({
    region: process.env.MINIO_REGION || 'us-east-1', // MinIO requires a region, but it can be arbitrary
    credentials: {
      accessKeyId: process.env.MINIO_KEY,
      secretAccessKey: process.env.MINIO_SECRET,
    },
    endpoint: process.env.MINIO_ENDPOINT,
    forcePathStyle: true, // Required for MinIO
    ...s3CompatibleChecksumConfig,
  })
}

function getPresignedUrlClient(): S3Client | null {
  const publicEndpoint =
    process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT
  const region = process.env.AWS_REGION || 'us-east-1'

  if (process.env.AWS_KEY && process.env.AWS_SECRET) {
    const baseConfig: any = {
      region,
      credentials: {
        accessKeyId: process.env.AWS_KEY,
        secretAccessKey: process.env.AWS_SECRET,
      },
    }

    if (process.env.LOCAL_MINIO === 'true' && publicEndpoint) {
      baseConfig.endpoint = publicEndpoint
      baseConfig.forcePathStyle = true
      Object.assign(baseConfig, s3CompatibleChecksumConfig)
    }

    return new S3Client(baseConfig)
  }

  return new S3Client({ region })
}

function getPresignedUrlVyriadClient(): S3Client | null {
  const publicEndpoint =
    process.env.VYRIAD_MINIO_PUBLIC_ENDPOINT ||
    process.env.VYRIAD_MINIO_ENDPOINT

  if (
    process.env.VYRIAD_MINIO_KEY &&
    process.env.VYRIAD_MINIO_SECRET &&
    publicEndpoint
  ) {
    return new S3Client({
      region: process.env.VYRIAD_MINIO_REGION || 'us-east-1',
      endpoint: publicEndpoint,
      credentials: {
        accessKeyId: process.env.VYRIAD_MINIO_KEY,
        secretAccessKey: process.env.VYRIAD_MINIO_SECRET,
      },
      forcePathStyle: true,
      ...s3CompatibleChecksumConfig,
    })
  }

  return vyriadMinioClient
}

export {
  s3Client,
  vyriadMinioClient,
  getPresignedUrlClient,
  getPresignedUrlVyriadClient,
}
