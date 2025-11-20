import { Client } from "minio"

let minioClient: Client | null = null

function buildClient(): Client {
  const endPoint = process.env.MINIO_ENDPOINT || "localhost"
  const port = Number(process.env.MINIO_PORT || 9000)
  const useSSL = (process.env.MINIO_USE_SSL || "false").toLowerCase() === "true"
  const accessKey = process.env.MINIO_ACCESS_KEY || "minioadmin"
  const secretKey = process.env.MINIO_SECRET_KEY || "minioadmin123"

  return new Client({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
  })
}

export function getMinioClient(): Client {
  if (!minioClient) {
    minioClient = buildClient()
  }
  return minioClient
}

export async function ensureBucket(bucket: string): Promise<void> {
  const client = getMinioClient()
  const exists = await client.bucketExists(bucket).catch((err) => {
    if ((err as any)?.code === "NoSuchBucket") return false
    throw err
  })

  if (!exists) {
    await client.makeBucket(bucket, "")
  }
}

export async function uploadToMinio(
  bucket: string,
  objectName: string,
  buffer: Buffer,
  contentType = "application/pdf",
): Promise<void> {
  const client = getMinioClient()
  await ensureBucket(bucket)

  await client.putObject(bucket, objectName, buffer, buffer.length, {
    "Content-Type": contentType,
  })
}

export async function deleteFromMinio(bucket: string, objectName: string): Promise<void> {
  const client = getMinioClient()
  await client.removeObject(bucket, objectName)
}

export async function getPresignedUrl(
  bucket: string,
  objectName: string,
  expirySeconds = 7 * 24 * 60 * 60,
  options?: { external?: boolean },
) {
  const client = getMinioClient()
  const url = await client.presignedGetObject(bucket, objectName, expirySeconds)

  if (options?.external === false) {
    return url
  }

  const publicUrl = process.env.MINIO_PUBLIC_URL
  if (!publicUrl) {
    return url
  }

  try {
    const presigned = new URL(url)
    const external = new URL(publicUrl)

    presigned.protocol = external.protocol
    presigned.hostname = external.hostname
    presigned.port = external.port

    return presigned.toString()
  } catch (error) {
    console.error("[Minio] Failed to transform presigned URL:", error)
    return url
  }
}

