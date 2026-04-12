import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Region = "auto" | "eu" | "fedramp";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  region: R2Region;
  publicBaseUrl?: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

function asNonEmpty(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getRequiredEnv(name: string): string {
  const value = asNonEmpty(process.env[name]);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getRegion(): R2Region {
  const region = asNonEmpty(process.env.R2_REGION)?.toLowerCase();
  if (!region || region === "auto") return "auto";
  if (region === "eu") return "eu";
  if (region === "fedramp") return "fedramp";
  return "auto";
}

function resolveEndpoint(accountId: string, region: R2Region): string {
  const customEndpoint = asNonEmpty(process.env.R2_ENDPOINT);
  if (customEndpoint) return customEndpoint;

  if (region === "eu") {
    return `https://${accountId}.eu.r2.cloudflarestorage.com`;
  }

  if (region === "fedramp") {
    return `https://${accountId}.fedramp.r2.cloudflarestorage.com`;
  }

  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getConfig(): R2Config {
  if (cachedConfig) return cachedConfig;

  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const region = getRegion();
  const endpoint = resolveEndpoint(accountId, region);
  const publicBaseUrl = asNonEmpty(process.env.R2_PUBLIC_BASE_URL);

  cachedConfig = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
    region,
    publicBaseUrl,
  };

  return cachedConfig;
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const config = getConfig();

  cachedClient = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return cachedClient;
}

function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getR2BucketName(): string {
  return getConfig().bucketName;
}

export function getR2PublicUrl(key: string): string | null {
  const baseUrl = getConfig().publicBaseUrl;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/${encodeObjectKey(key)}`;
}

export async function putR2Object(
  input: Omit<PutObjectCommandInput, "Bucket" | "Key"> & { key: string }
) {
  const config = getConfig();
  const client = getClient();

  const response = await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: input.key,
      Body: input.Body,
      ContentType: input.ContentType,
      CacheControl: input.CacheControl,
      ContentDisposition: input.ContentDisposition,
      Metadata: input.Metadata,
    })
  );

  return {
    etag: response.ETag ?? null,
    versionId: response.VersionId ?? null,
  };
}

export async function deleteR2Object(key: string) {
  const config = getConfig();
  const client = getClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
  );
}

export async function getR2SignedGetUrl(input: {
  key: string;
  expiresInSeconds?: number;
  fileName?: string;
}) {
  const config = getConfig();
  const client = getClient();

  const rawExpires = input.expiresInSeconds ?? 900;
  const expiresInSeconds = Math.min(Math.max(rawExpires, 60), 3600);

  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: input.key,
    ...(input.fileName
      ? {
          ResponseContentDisposition: `attachment; filename="${input.fileName.replace(/"/g, "")}"`,
        }
      : {}),
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return {
    url,
    expiresInSeconds,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}
