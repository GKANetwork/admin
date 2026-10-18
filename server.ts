import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEAWEED_S3_ENDPOINT = process.env.GHA_SEAWEEDFS_S3_ENDPOINT || 'http://103.118.17.94:8333';
const SEAWEED_S3_ACCESS_KEY = process.env.GHA_SEAWEEDFS_S3_ACCESS_KEY || 'admin';
const SEAWEED_S3_SECRET_KEY = process.env.GHA_SEAWEEDFS_S3_SECRET_KEY || 'qapassw0rd';
const SEAWEED_S3_REGION = process.env.GHA_SEAWEEDFS_S3_REGION || 'us-east-1';
const SEAWEED_S3_BUCKET = 'gha-files';

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function buildAwsSigV4Headers(
  method: string,
  urlObj: URL,
  payload: Buffer,
  contentType?: string
): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);
  const hostHeader = urlObj.port ? `${urlObj.hostname}:${urlObj.port}` : urlObj.hostname;

  const canonicalHeadersMap: Record<string, string> = {
    host: hostHeader,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) {
    canonicalHeadersMap['content-type'] = contentType;
  }

  const sortedHeaderKeys = Object.keys(canonicalHeadersMap).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${canonicalHeadersMap[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const sortedQueryParams = Array.from(urlObj.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    method,
    urlObj.pathname,
    sortedQueryParams,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${SEAWEED_S3_REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${SEAWEED_S3_SECRET_KEY}`, dateStamp);
  const kRegion = hmacSha256(kDate, SEAWEED_S3_REGION);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${SEAWEED_S3_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    Authorization: authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

export interface LiveS3ObjectItem {
  key: string;
  lastModified: string;
  eTag: string;
  size: number;
  s3Uri: string;
  httpUrl: string;
}

async function putObjectToSeaweedS3(
  objectKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ ok: boolean; status: number; eTag: string; s3Uri: string; errorText?: string }> {
  const cleanKey = objectKey.replace(/^\/+/, '').replace(/^gha-files\/+/, '');
  const encodedKey = cleanKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const targetUrl = new URL(`${SEAWEED_S3_ENDPOINT}/${SEAWEED_S3_BUCKET}/${encodedKey}`);
  const headers = buildAwsSigV4Headers('PUT', targetUrl, buffer, mimeType);

  const response = await fetch(targetUrl.toString(), {
    method: 'PUT',
    headers,
    body: new Uint8Array(buffer),
  });
  const eTag = (response.headers.get('etag') || '').replace(/"/g, '');
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return {
      ok: false,
      status: response.status,
      eTag,
      s3Uri: `s3://${SEAWEED_S3_BUCKET}/${cleanKey}`,
      errorText: errText.slice(0, 300),
    };
  }
  return {
    ok: true,
    status: response.status,
    eTag,
    s3Uri: `s3://${SEAWEED_S3_BUCKET}/${cleanKey}`,
  };
}

async function listObjectsFromSeaweedS3(): Promise<LiveS3ObjectItem[]> {
  const targetUrl = new URL(`${SEAWEED_S3_ENDPOINT}/${SEAWEED_S3_BUCKET}/`);
  const emptyBuf = Buffer.alloc(0);
  const headers = buildAwsSigV4Headers('GET', targetUrl, emptyBuf);
  const response = await fetch(targetUrl.toString(), {
    method: 'GET',
    headers,
  });
  const xml = await response.text();
  if (!response.ok) {
    throw new Error(`S3 GET returned HTTP ${response.status}: ${xml.slice(0, 200)}`);
  }

  const items: LiveS3ObjectItem[] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[1];
    const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/);
    const modMatch = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/);
    const etagMatch = block.match(/<ETag>([\s\S]*?)<\/ETag>/);
    const sizeMatch = block.match(/<Size>([\s\S]*?)<\/Size>/);
    if (keyMatch) {
      const key = keyMatch[1];
      items.push({
        key,
        lastModified: modMatch ? modMatch[1] : '',
        eTag: etagMatch ? etagMatch[1].replace(/&quot;|"/g, '') : '',
        size: sizeMatch ? Number(sizeMatch[1]) : 0,
        s3Uri: `s3://${SEAWEED_S3_BUCKET}/${key}`,
        httpUrl: `/api/v1/events/blobs?path=${encodeURIComponent(`/${SEAWEED_S3_BUCKET}/${key}`)}`,
      });
    }
  }
  return items.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

async function getObjectFromSeaweedS3(
  objectKey: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const cleanKey = objectKey.replace(/^\/+/, '').replace(/^gha-files\/+/, '');
  const encodedKey = cleanKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const targetUrl = new URL(`${SEAWEED_S3_ENDPOINT}/${SEAWEED_S3_BUCKET}/${encodedKey}`);
  const headers = buildAwsSigV4Headers('GET', targetUrl, Buffer.alloc(0));
  const response = await fetch(targetUrl.toString(), {
    method: 'GET',
    headers,
  });
  if (!response.ok) return null;
  const arrayBuf = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  };
}

export type LandingCategory = 'CME' | 'GSI' | 'AHS' | 'Conference';
export type GhaProfile = 'dev' | 'qa' | 'prod';
export type BlobProviderType = 'local-fs' | 'seaweedfs';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type HistoryActionType = 'CREATED' | 'UPDATED' | 'PUBLISHED' | 'UNPUBLISHED';

export interface SectionImageAsset {
  blobPath: string;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SectionAuditHistoryEntry {
  id: string;
  action: HistoryActionType;
  publishedState: boolean;
  summary: string;
  timestamp: string;
}

export interface LandingSectionDocument {
  id: string;
  category: LandingCategory;
  eventYear: number;
  title: string;
  description: string;
  url: string;
  images: SectionImageAsset[];
  imageBlobPath: string;
  imagePreviewUrl: string;
  imageFileName: string;
  imageMimeType: string;
  imageSizeBytes: number;
  published: boolean;
  history: SectionAuditHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedLandingSectionsResponse {
  content: LandingSectionDocument[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  availableYears: number[];
}

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  profile: GhaProfile;
  correlationId: string;
  level: LogLevel;
  logger: string;
  message: string;
}

export interface ProfileConfiguration {
  profile: GhaProfile;
  blobProvider: BlobProviderType;
  blobStoreBasePath: string;
  seaweedFilerUrl: string;
  mongoDatabase: string;
  mongoUri: string;
  logLevel: LogLevel;
}

const PROFILE_PRESETS: Record<GhaProfile, ProfileConfiguration> = {
  dev: {
    profile: 'dev',
    blobProvider: 'seaweedfs',
    blobStoreBasePath: '/gha-files',
    seaweedFilerUrl: 'http://103.118.17.94:8333',
    mongoDatabase: 'event',
    mongoUri: 'mongodb://localhost:27017/event',
    logLevel: 'DEBUG',
  },
  qa: {
    profile: 'qa',
    blobProvider: 'seaweedfs',
    blobStoreBasePath: '/gha-files',
    seaweedFilerUrl: 'http://103.118.17.94:8333',
    mongoDatabase: 'event',
    mongoUri: 'mongodb://gha-mongodb-qa:27017/event',
    logLevel: 'DEBUG',
  },
  prod: {
    profile: 'prod',
    blobProvider: 'seaweedfs',
    blobStoreBasePath: process.env.GHA_BLOB_STORE_PATH || '/gha-files',
    seaweedFilerUrl: process.env.GHA_SEAWEEDFS_S3_ENDPOINT || 'http://103.118.17.94:8333',
    mongoDatabase: process.env.GHA_MONGO_DB || 'event',
    mongoUri: process.env.GHA_MONGO_URI || 'mongodb://mongodb:27017/event',
    logLevel: 'INFO',
  },
};

class GhaStructuredLogger {
  private logs: DebugLogEntry[] = [];
  private logFilePath: string;
  private maxEntries = 250;

  constructor() {
    const logDir = path.join(__dirname, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    this.logFilePath = path.join(logDir, 'gha-event-service.log');
  }

  log(
    profile: GhaProfile,
    correlationId: string,
    level: LogLevel,
    loggerName: string,
    message: string
  ) {
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      profile,
      correlationId,
      level,
      logger: loggerName,
      message,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxEntries) {
      this.logs.length = this.maxEntries;
    }

    const formattedLine = `${entry.timestamp} [http-nio-8082] [profile=${profile}] [corrId=${correlationId}] ${level.padEnd(5)} ${loggerName} - ${message}\n`;
    try {
      fs.appendFileSync(this.logFilePath, formattedLine, 'utf-8');
    } catch {
      // ignore disk write error
    }
    console.log(formattedLine.trim());
  }

  getLogs(levelFilter?: LogLevel, profileFilter?: GhaProfile): DebugLogEntry[] {
    return this.logs.filter((l) => {
      if (levelFilter && l.level !== levelFilter) return false;
      if (profileFilter && l.profile !== profileFilter) return false;
      return true;
    });
  }

  clearLogs() {
    this.logs = [];
  }
}

export interface BlobStoragePort {
  getActiveProfileConfig(): ProfileConfiguration;
  switchProfile(profile: GhaProfile): ProfileConfiguration;
  setCustomBasePath(newPath: string, provider?: BlobProviderType): void;
  storeBlob(
    category: LandingCategory,
    fileName: string,
    mimeType: string,
    base64Data: string,
    correlationId: string
  ): Promise<SectionImageAsset>;
  resolveBlobFile(blobPath: string): { filePath: string; mimeType: string } | null;
  getPhysicalStorageStats(): {
    physicalRootDir: string;
    totalStoredFiles: number;
    indexedBlobPaths: string[];
  };
}

class MultiProfileBlobStorageStrategy implements BlobStoragePort {
  private activeProfile: GhaProfile = 'dev';
  private profileConfigs: Record<GhaProfile, ProfileConfiguration>;
  private localPhysicalRoot: string;
  private blobIndexFile: string;
  private blobIndex: Record<string, { localFile: string; mimeType: string }> = {};
  private logger: GhaStructuredLogger;

  constructor(logger: GhaStructuredLogger) {
    this.logger = logger;
    this.profileConfigs = JSON.parse(JSON.stringify(PROFILE_PRESETS));
    this.localPhysicalRoot = path.join(__dirname, 'data', 'seaweedfs_blobs');
    this.blobIndexFile = path.join(this.localPhysicalRoot, 'blob_index.json');
    fs.mkdirSync(this.localPhysicalRoot, { recursive: true });
    this.loadIndex();
    this.logger.log(
      this.activeProfile,
      'gha-init',
      'INFO',
      'c.g.e.i.b.SeaweedFsBlobStorageAdapter',
      `[SEAWEEDFS-S3] Initialized profile='${this.activeProfile}' s3Endpoint='${SEAWEED_S3_ENDPOINT}' bucket='${SEAWEED_S3_BUCKET}'`
    );
  }

  private loadIndex() {
    try {
      if (fs.existsSync(this.blobIndexFile)) {
        this.blobIndex = JSON.parse(fs.readFileSync(this.blobIndexFile, 'utf-8'));
      }
    } catch {
      this.blobIndex = {};
    }
  }

  private saveIndex() {
    fs.writeFileSync(this.blobIndexFile, JSON.stringify(this.blobIndex, null, 2), 'utf-8');
  }

  getActiveProfileConfig(): ProfileConfiguration {
    return this.profileConfigs[this.activeProfile];
  }

  switchProfile(profile: GhaProfile): ProfileConfiguration {
    this.activeProfile = profile;
    const cfg = this.getActiveProfileConfig();
    const adapterClass =
      cfg.blobProvider === 'local-fs'
        ? 'c.g.e.i.b.LocalFileSystemBlobStorageAdapter'
        : 'c.g.e.i.b.SeaweedFsBlobStorageAdapter';
    this.logger.log(
      this.activeProfile,
      `prof-${Date.now().toString(36)}`,
      'INFO',
      adapterClass,
      `Switched active Spring profile to '${profile}' -> provider='${cfg.blobProvider}', basePath='${cfg.blobStoreBasePath}', s3='${SEAWEED_S3_ENDPOINT}'`
    );
    return cfg;
  }

  setCustomBasePath(newPath: string, provider?: BlobProviderType): void {
    const trimmed = newPath.trim().replace(/\/+$/, '');
    if (trimmed) {
      this.profileConfigs[this.activeProfile].blobStoreBasePath = trimmed;
    }
    if (provider) {
      this.profileConfigs[this.activeProfile].blobProvider = provider;
    }
    this.logger.log(
      this.activeProfile,
      `cfg-${Date.now().toString(36)}`,
      'DEBUG',
      'c.g.e.i.b.BlobStoragePort',
      `Updated gha.blob-store.base-path='${this.profileConfigs[this.activeProfile].blobStoreBasePath}', provider='${this.profileConfigs[this.activeProfile].blobProvider}'`
    );
  }

  async storeBlob(
    category: LandingCategory,
    fileName: string,
    mimeType: string,
    base64Data: string,
    correlationId: string
  ): Promise<SectionImageAsset> {
    const cfg = this.getActiveProfileConfig();
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const categoryDir = category.toLowerCase();

    const objectKey = `${categoryDir}/${timestamp}_${cleanName}`;
    const blobPath = `${cfg.blobStoreBasePath}/${objectKey}`;
    const adapterName =
      cfg.blobProvider === 'local-fs'
        ? 'c.g.e.i.b.LocalFileSystemBlobStorageAdapter'
        : 'c.g.e.i.b.SeaweedFsBlobStorageAdapter';

    const rawBase64 = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;
    const buffer = Buffer.from(rawBase64, 'base64');

    const physicalSubDir = path.join(this.localPhysicalRoot, this.activeProfile, categoryDir);
    fs.mkdirSync(physicalSubDir, { recursive: true });
    const physicalFileName = `${timestamp}_${cleanName}`;
    const physicalFullPath = path.join(physicalSubDir, physicalFileName);
    fs.writeFileSync(physicalFullPath, buffer);

    this.blobIndex[blobPath] = {
      localFile: physicalFullPath,
      mimeType: mimeType || 'image/jpeg',
    };
    this.saveIndex();

    if (cfg.blobProvider === 'seaweedfs') {
      try {
        const s3Res = await putObjectToSeaweedS3(objectKey, buffer, mimeType || 'image/jpeg');
        if (s3Res.ok) {
          this.logger.log(
            this.activeProfile,
            correlationId,
            'INFO',
            adapterName,
            `[SEAWEEDFS-S3] Uploaded ${buffer.length} bytes via AWS SigV4 PUT -> ${SEAWEED_S3_ENDPOINT}/${SEAWEED_S3_BUCKET}/${objectKey} (HTTP ${s3Res.status}, ETag=${s3Res.eTag})`
          );
        } else {
          this.logger.log(
            this.activeProfile,
            correlationId,
            'WARN',
            adapterName,
            `[SEAWEEDFS-S3] S3 PUT returned HTTP ${s3Res.status}: ${s3Res.errorText}`
          );
        }
      } catch (err) {
        this.logger.log(
          this.activeProfile,
          correlationId,
          'WARN',
          adapterName,
          `[SEAWEEDFS-S3] S3 PUT failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      this.logger.log(
        this.activeProfile,
        correlationId,
        'INFO',
        adapterName,
        `[LOCAL-FS] Stored blob (${buffer.length} bytes) -> DB path='${blobPath}'`
      );
    }

    return {
      blobPath,
      previewUrl: `/api/v1/events/blobs?path=${encodeURIComponent(blobPath)}`,
      fileName: cleanName,
      mimeType: mimeType || 'image/jpeg',
      sizeBytes: buffer.length,
    };
  }

  resolveBlobFile(blobPath: string): { filePath: string; mimeType: string } | null {
    const entry = this.blobIndex[blobPath];
    if (entry && fs.existsSync(entry.localFile)) {
      return { filePath: entry.localFile, mimeType: entry.mimeType };
    }
    return null;
  }

  getPhysicalStorageStats() {
    return {
      physicalRootDir: this.localPhysicalRoot,
      totalStoredFiles: Object.keys(this.blobIndex).length,
      indexedBlobPaths: Object.keys(this.blobIndex),
    };
  }
}

export interface LandingSectionRepositoryPort {
  findAll(): LandingSectionDocument[];
  findPaginated(params: {
    page: number;
    size: number;
    year?: number;
    published?: boolean;
    category?: LandingCategory;
    search?: string;
  }): PaginatedLandingSectionsResponse;
  findPublished(category?: LandingCategory): LandingSectionDocument[];
  findById(id: string): LandingSectionDocument | undefined;
  unpublishOtherInCategory(
    category: LandingCategory,
    excludeId: string | null,
    newTitle: string,
    newYear: number
  ): LandingSectionDocument[];
  save(doc: LandingSectionDocument): LandingSectionDocument;
  deleteById(id: string): boolean;
}

class MongoEventDbRepositoryAdapter implements LandingSectionRepositoryPort {
  private dbDir: string;
  private collectionFile: string;
  private documents: LandingSectionDocument[] = [];

  constructor(blobStorage: BlobStoragePort) {
    this.dbDir = path.join(__dirname, 'data', 'mongodb_event_db');
    this.collectionFile = path.join(this.dbDir, 'landing_sections_v2.json');
    fs.mkdirSync(this.dbDir, { recursive: true });
    this.loadOrSeed(blobStorage);
  }

  private normalizeDoc(doc: Partial<LandingSectionDocument> & { id: string }): LandingSectionDocument {
    const rawCat = String(doc.category || 'CME').toUpperCase();
    const category: LandingCategory =
      rawCat === 'CONFERENCE' ? 'Conference' : (rawCat === 'ASI' || rawCat === 'AHS' ? 'AHS' : (doc.category as LandingCategory) || 'CME');
    const eventYear = Number(doc.eventYear) || 2026;
    const images: SectionImageAsset[] =
      Array.isArray(doc.images) && doc.images.length > 0
        ? doc.images
        : [
            {
              blobPath: doc.imageBlobPath || `/seaweedfs/${category.toLowerCase()}/banner.jpg`,
              previewUrl:
                doc.imagePreviewUrl || '/src/assets/images/gha_cme_symposium_1791459504997.jpg',
              fileName: doc.imageFileName || 'section_banner.jpg',
              mimeType: doc.imageMimeType || 'image/jpeg',
              sizeBytes: doc.imageSizeBytes || 256000,
            },
          ];
    const primary = images[0];
    const now = doc.updatedAt || new Date().toISOString();
    const createdAt = doc.createdAt || now;
    const published = Boolean(doc.published);

    const history: SectionAuditHistoryEntry[] =
      Array.isArray(doc.history) && doc.history.length > 0
        ? doc.history
        : [
            {
              id: `hist-${doc.id}-init`,
              action: published ? 'PUBLISHED' : 'CREATED',
              publishedState: published,
              summary: `Initial ${category} (${eventYear}) record ${
                published ? 'published to Mobile Landing Page' : 'saved as unpublished draft'
              }`,
              timestamp: createdAt,
            },
          ];

    const resolvedUrl =
      typeof doc.url === 'string' ? doc.url.trim() : '';

    return {
      id: doc.id,
      category,
      eventYear,
      title: (doc.title || `${category} Section`).replace(/\bASI\b/g, 'AHS'),
      description: (doc.description || '').replace(/\bASI\b/g, 'AHS'),
      url: resolvedUrl,
      images: images.map((im) => ({
        ...im,
        blobPath: im.blobPath.replace(/\/asi\//g, '/ahs/').replace(/_asi_/g, '_ahs_'),
        fileName: im.fileName.replace(/asi/gi, 'ahs'),
      })),
      imageBlobPath: primary.blobPath.replace(/\/asi\//g, '/ahs/').replace(/_asi_/g, '_ahs_'),
      imagePreviewUrl: primary.previewUrl,
      imageFileName: primary.fileName.replace(/asi/gi, 'ahs'),
      imageMimeType: primary.mimeType,
      imageSizeBytes: primary.sizeBytes,
      published,
      history: history.map((h) => ({
        ...h,
        summary: h.summary.replace(/\bASI\b/g, 'AHS'),
      })),
      createdAt,
      updatedAt: now,
    };
  }

  private enforceMaxOnePublishedPerCategory() {
    const seenPublishedCategories = new Set<LandingCategory>();
    // Sort by eventYear DESC, updatedAt DESC so the newest published per category wins
    const sorted = [...this.documents].sort((a, b) => {
      if (b.eventYear !== a.eventYear) return b.eventYear - a.eventYear;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    let publishedCount = 0;
    for (const doc of sorted) {
      if (doc.published) {
        if (seenPublishedCategories.has(doc.category) || publishedCount >= 4) {
          doc.published = false;
        } else {
          seenPublishedCategories.add(doc.category);
          publishedCount++;
        }
      }
    }
    // RESTART GUARANTEE: Ensure every one of the 4 clinical verticals has an active published card
    const requiredCats: LandingCategory[] = ['CME', 'GSI', 'AHS', 'Conference'];
    for (const req of requiredCats) {
      const hasPub = sorted.some((d) => d.published && String(d.category || '').toUpperCase() === req.toUpperCase());
      if (!hasPub) {
        const latestInCat = sorted.find((d) => String(d.category || '').toUpperCase() === req.toUpperCase());
        if (latestInCat) {
          latestInCat.published = true;
        }
      }
    }
  }

  private loadOrSeed(blobStorage: BlobStoragePort) {
    if (fs.existsSync(this.collectionFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.collectionFile, 'utf-8'));
        if (Array.isArray(parsed) && parsed.length >= 10) {
          this.documents = parsed.map((d) => this.normalizeDoc(d));
          this.enforceMaxOnePublishedPerCategory();
          this.persist();
          return;
        }
      } catch {
        // proceed to seed
      }
    }

    const basePath = blobStorage.getActiveProfileConfig().blobStoreBasePath;
    const imgCme = '/src/assets/images/gha_cme_symposium_1791459504997.jpg';
    const imgGsi = '/src/assets/images/gha_gsi_summit_1791459527929.jpg';
    const imgAsi = '/src/assets/images/gha_asi_course_1791459544460.jpg';
    const imgConf = '/src/assets/images/gha_annual_conference_1791459556638.jpg';

    const seedSpecs: Array<{
      id: string;
      category: LandingCategory;
      eventYear: number;
      title: string;
      description: string;
      published: boolean;
      displayOrder: number;
      createdAt: string;
      updatedAt: string;
      imgs: Array<{ url: string; name: string; size: number }>;
      history: SectionAuditHistoryEntry[];
    }> = [
      {
        id: '67f1a2b0c9e77a0012a40101',
        category: 'CME',
        eventYear: 2026,
        title: 'National Continuing Medical Education (CME) Accreditation Series 2026',
        description:
          'Accredited clinical modules, live case symposiums, and State Medical Council credit-bearing workshops curated for practicing clinicians and post-graduate residents.',
        published: true,
        displayOrder: 1,
        createdAt: '2026-09-12T08:30:00.000Z',
        updatedAt: '2026-10-08T04:15:00.000Z',
        imgs: [
          { url: imgCme, name: 'gha_cme_symposium_2026.jpg', size: 284600 },
          { url: imgConf, name: 'gha_cme_auditorium_hall.jpg', size: 310200 },
        ],
        history: [
          {
            id: 'h-101-2',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Published 2026 CME Accreditation Series to Mobile App Landing Page',
            timestamp: '2026-10-08T04:15:00.000Z',
          },
          {
            id: 'h-101-1',
            action: 'CREATED',
            publishedState: false,
            summary: 'Created CME 2026 section with 2 images in event_db',
            timestamp: '2026-09-12T08:30:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40102',
        category: 'GSI',
        eventYear: 2026,
        title: 'Gastrointestinal Society of India (GSI) Endoscopy & Hepatology Forum 2026',
        description:
          'Advanced therapeutic endoscopy live transmissions, hepatobiliary consensus panels, and luminal gastroenterology fellowships hosted across regional chapters.',
        published: true,
        displayOrder: 2,
        createdAt: '2026-09-14T10:00:00.000Z',
        updatedAt: '2026-10-07T16:40:00.000Z',
        imgs: [
          { url: imgGsi, name: 'gha_gsi_summit_2026.jpg', size: 312400 },
          { url: imgAsi, name: 'gha_gsi_endoscopy_suite.jpg', size: 294000 },
        ],
        history: [
          {
            id: 'h-102-2',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Published GSI 2026 Endoscopy Forum to Mobile App Landing Page',
            timestamp: '2026-10-07T16:40:00.000Z',
          },
          {
            id: 'h-102-1',
            action: 'CREATED',
            publishedState: true,
            summary: 'Created GSI 2026 section in event_db',
            timestamp: '2026-09-14T10:00:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40103',
        category: 'AHS',
        eventYear: 2026,
        title: 'Course / AHS Masterclass & Robotic Surgery Fellowship 2026',
        description:
          'Hands-on laparoscopic skill labs, robotic surgery certification tracks, and trauma management courses designed for surgical fellows and senior consultants.',
        published: true,
        displayOrder: 3,
        createdAt: '2026-09-18T09:15:00.000Z',
        updatedAt: '2026-10-06T11:20:00.000Z',
        imgs: [{ url: imgAsi, name: 'gha_ahs_course_2026.jpg', size: 298150 }],
        history: [
          {
            id: 'h-103-1',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Created and published Course / AHS 2026 track',
            timestamp: '2026-10-06T11:20:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40104',
        category: 'Conference',
        eventYear: 2026,
        title: 'GHA Annual International Medical Congress & Scientific Exhibition 2026',
        description:
          'Four-day plenary sessions, international keynote lectures, peer-reviewed abstract poster halls, and multi-specialty clinical workshops.',
        published: true,
        displayOrder: 4,
        createdAt: '2026-09-20T14:00:00.000Z',
        updatedAt: '2026-10-05T18:10:00.000Z',
        imgs: [
          { url: imgConf, name: 'gha_annual_conference_2026.jpg', size: 341900 },
          { url: imgCme, name: 'gha_conference_keynote_stage.jpg', size: 284600 },
        ],
        history: [
          {
            id: 'h-104-1',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Published 2026 Annual International Medical Congress section',
            timestamp: '2026-10-05T18:10:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40105',
        category: 'CME',
        eventYear: 2026,
        title: 'Winter Clinical Pharmacology & ICU Antimicrobial Stewardship Update',
        description:
          'Intensive CME credit module covering ICU antimicrobial resistance protocols and precision dosing guidelines. Currently staged as unpublished draft.',
        published: false,
        displayOrder: 5,
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-04T09:45:00.000Z',
        imgs: [{ url: imgCme, name: 'cme_winter_pharmacology_2026.jpg', size: 245000 }],
        history: [
          {
            id: 'h-105-2',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Unpublished while awaiting final NMC credit code confirmation',
            timestamp: '2026-10-04T09:45:00.000Z',
          },
          {
            id: 'h-105-1',
            action: 'CREATED',
            publishedState: true,
            summary: 'Created Winter CME 2026 section',
            timestamp: '2026-10-01T12:00:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40106',
        category: 'GSI',
        eventYear: 2025,
        title: 'GSI National Pancreatic & Biliary Endoscopy Workshop 2025',
        description:
          'ERCP and interventional EUS live clinical demonstrations with high-definition case archives from the 2025 Gastroenterology summit.',
        published: false,
        displayOrder: 6,
        createdAt: '2025-05-10T09:00:00.000Z',
        updatedAt: '2025-11-20T17:00:00.000Z',
        imgs: [{ url: imgGsi, name: 'gsi_ercp_workshop_2025.jpg', size: 276000 }],
        history: [
          {
            id: 'h-106-2',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Archived and unpublished after conclusion of 2025 GSI Workshop',
            timestamp: '2025-11-20T17:00:00.000Z',
          },
          {
            id: 'h-106-1',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Published 2025 GSI Workshop to Mobile App Landing Page',
            timestamp: '2025-05-10T09:00:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40107',
        category: 'AHS',
        eventYear: 2025,
        title: 'AHS Minimal Access & Bariatric Surgery Fellowship Course 2025',
        description:
          'Comprehensive surgical skill curriculum covering sleeve gastrectomy, suturing ergonomics, and perioperative metabolic care.',
        published: true,
        displayOrder: 7,
        createdAt: '2025-03-15T08:00:00.000Z',
        updatedAt: '2025-08-12T14:30:00.000Z',
        imgs: [{ url: imgAsi, name: 'ahs_bariatric_course_2025.jpg', size: 289400 }],
        history: [
          {
            id: 'h-107-1',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Published evergreen 2025 AHS Fellowship Course module',
            timestamp: '2025-08-12T14:30:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40108',
        category: 'Conference',
        eventYear: 2025,
        title: 'GHA Annual Medical & Surgical Conclave — 2025 Edition',
        description:
          'Plenary symposiums on AI-assisted diagnostics, oncology multidisciplinary boards, and residency research paper presentations.',
        published: false,
        displayOrder: 8,
        createdAt: '2025-01-20T11:00:00.000Z',
        updatedAt: '2025-12-15T19:00:00.000Z',
        imgs: [{ url: imgConf, name: 'gha_conclave_2025.jpg', size: 325000 }],
        history: [
          {
            id: 'h-108-2',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Unpublished 2025 Conclave landing banner following event completion',
            timestamp: '2025-12-15T19:00:00.000Z',
          },
          {
            id: 'h-108-1',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Published 2025 Conclave registration banner',
            timestamp: '2025-01-20T11:00:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40109',
        category: 'CME',
        eventYear: 2025,
        title: 'Cardiovascular & Critical Care Emergency CME Symposium 2025',
        description:
          'Point-of-care ultrasound (POCUS), mechanical ventilation strategies, and acute coronary syndrome protocol updates.',
        published: false,
        displayOrder: 9,
        createdAt: '2025-04-02T10:30:00.000Z',
        updatedAt: '2025-10-01T15:20:00.000Z',
        imgs: [{ url: imgCme, name: 'cme_critical_care_2025.jpg', size: 268000 }],
        history: [
          {
            id: 'h-109-1',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Unpublished 2025 Critical Care CME section',
            timestamp: '2025-10-01T15:20:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40110',
        category: 'GSI',
        eventYear: 2024,
        title: 'GSI Inflammatory Bowel Disease (IBD) Clinical Consensus 2024',
        description:
          'Biologic therapy algorithms, mucosal healing assessment criteria, and multi-center registry findings for ulcerative colitis and Crohn disease.',
        published: false,
        displayOrder: 10,
        createdAt: '2024-06-11T09:00:00.000Z',
        updatedAt: '2024-11-30T16:00:00.000Z',
        imgs: [{ url: imgGsi, name: 'gsi_ibd_consensus_2024.jpg', size: 271000 }],
        history: [
          {
            id: 'h-110-1',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Archived 2024 GSI IBD Consensus landing section',
            timestamp: '2024-11-30T16:00:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40111',
        category: 'AHS',
        eventYear: 2024,
        title: 'AHS Hepatobiliary & Trauma Surgery Intensive Course 2024',
        description:
          'Cadaveric dissection workshops, vascular control techniques in abdominal trauma, and postoperative ICU management.',
        published: false,
        displayOrder: 11,
        createdAt: '2024-02-18T08:45:00.000Z',
        updatedAt: '2024-09-22T12:10:00.000Z',
        imgs: [{ url: imgAsi, name: 'ahs_trauma_course_2024.jpg', size: 291000 }],
        history: [
          {
            id: 'h-111-1',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Unpublished 2024 AHS Trauma Course section',
            timestamp: '2024-09-22T12:10:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40112',
        category: 'Conference',
        eventYear: 2024,
        title: 'GHA 12th Annual National Medical Research Congress 2024',
        description:
          'Keynote addresses from Deans of Medical Sciences, young investigator award sessions, and clinical innovation exhibitions.',
        published: false,
        displayOrder: 12,
        createdAt: '2024-01-10T10:00:00.000Z',
        updatedAt: '2024-12-18T18:00:00.000Z',
        imgs: [{ url: imgConf, name: 'gha_congress_2024.jpg', size: 319000 }],
        history: [
          {
            id: 'h-112-1',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Unpublished 2024 Annual Congress section at year close',
            timestamp: '2024-12-18T18:00:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40113',
        category: 'CME',
        eventYear: 2023,
        title: 'Foundation CME in Clinical Research Methodology & Biostatistics 2023',
        description:
          'Mandatory research methodology training for medical faculty and postgraduate residents covering randomized trial design and ethics approval.',
        published: true,
        displayOrder: 13,
        createdAt: '2023-07-05T09:30:00.000Z',
        updatedAt: '2024-01-15T11:00:00.000Z',
        imgs: [{ url: imgCme, name: 'cme_biostatistics_2023.jpg', size: 259000 }],
        history: [
          {
            id: 'h-113-1',
            action: 'PUBLISHED',
            publishedState: true,
            summary: 'Kept published as permanent reference CME course on Mobile App',
            timestamp: '2024-01-15T11:00:00.000Z',
          },
        ],
      },
      {
        id: '67f1a2b0c9e77a0012a40114',
        category: 'Conference',
        eventYear: 2023,
        title: 'GHA 11th Annual Healthcare Leadership & Clinical Summit 2023',
        description:
          'Hospital accreditation standards, digital health records interoperability, and multi-center surgical outcome benchmarks.',
        published: false,
        displayOrder: 14,
        createdAt: '2023-02-14T08:00:00.000Z',
        updatedAt: '2023-12-10T17:30:00.000Z',
        imgs: [{ url: imgConf, name: 'gha_summit_2023.jpg', size: 305000 }],
        history: [
          {
            id: 'h-114-1',
            action: 'UNPUBLISHED',
            publishedState: false,
            summary: 'Unpublished 2023 Summit section',
            timestamp: '2023-12-10T17:30:00.000Z',
          },
        ],
      },
    ];

    this.documents = seedSpecs.map((spec) => {
      const images: SectionImageAsset[] = spec.imgs.map((im, i) => ({
        blobPath: `${basePath}/${spec.category.toLowerCase()}/${spec.eventYear}_0${i + 1}_${im.name}`,
        previewUrl: im.url,
        fileName: im.name,
        mimeType: 'image/jpeg',
        sizeBytes: im.size,
      }));
      const primary = images[0];
      const slug = spec.category === 'AHS' ? 'course-ahs' : spec.category.toLowerCase();
      return {
        id: spec.id,
        category: spec.category,
        eventYear: spec.eventYear,
        title: spec.title,
        description: spec.description,
        url: `https://events.globalhealthacademy.org/${slug}/${spec.eventYear}`,
        images,
        imageBlobPath: primary.blobPath,
        imagePreviewUrl: primary.previewUrl,
        imageFileName: primary.fileName,
        imageMimeType: primary.mimeType,
        imageSizeBytes: primary.sizeBytes,
        published: spec.published,
        history: spec.history,
        createdAt: spec.createdAt,
        updatedAt: spec.updatedAt,
      };
    });

    this.enforceMaxOnePublishedPerCategory();
    this.persist();
  }

  private persist() {
    fs.writeFileSync(this.collectionFile, JSON.stringify(this.documents, null, 2), 'utf-8');
  }

  findAll(): LandingSectionDocument[] {
    const slotOrder: Record<LandingCategory, number> = {
      CME: 1,
      GSI: 2,
      AHS: 3,
      Conference: 4,
    };
    return [...this.documents]
      .map((d) => this.normalizeDoc(d))
      .sort((a, b) => {
        // Priority 1: Published records (the active vertical cards) ALWAYS appear at top
        if (a.published !== b.published) {
          return a.published ? -1 : 1;
        }
        // Priority 2: When both are published, order in canonical 4-vertical sequence (CME, GSI, AHS, Conference)
        if (a.published && b.published) {
          return (slotOrder[a.category] || 99) - (slotOrder[b.category] || 99);
        }
        // Priority 3: When both are unpublished, newest eventYear first, then updatedAt DESC
        if (b.eventYear !== a.eventYear) return b.eventYear - a.eventYear;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }

  findPaginated(params: {
    page: number;
    size: number;
    year?: number;
    published?: boolean;
    category?: LandingCategory;
    search?: string;
  }): PaginatedLandingSectionsResponse {
    const allDocs = this.findAll();
    const yearsSet = new Set<number>(allDocs.map((d) => d.eventYear));
    [2026, 2025, 2024, 2023].forEach((y) => yearsSet.add(y));
    const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

    const filtered = allDocs.filter((doc) => {
      if (params.year !== undefined && doc.eventYear !== params.year) return false;
      if (params.published !== undefined && doc.published !== params.published) return false;
      if (params.category !== undefined && doc.category !== params.category) return false;
      if (params.search && params.search.trim()) {
        const q = params.search.toLowerCase();
        const matchText =
          doc.title.toLowerCase().includes(q) ||
          doc.description.toLowerCase().includes(q) ||
          (doc.url && doc.url.toLowerCase().includes(q)) ||
          doc.category.toLowerCase().includes(q) ||
          String(doc.eventYear).includes(q) ||
          doc.imageBlobPath.toLowerCase().includes(q);
        if (!matchText) return false;
      }
      return true;
    });

    const pageSize = Math.max(1, params.size || 10);
    const totalElements = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));
    const safePage = Math.min(Math.max(0, params.page || 0), totalPages - 1);
    const startIdx = safePage * pageSize;
    const content = filtered.slice(startIdx, startIdx + pageSize);

    return {
      content,
      page: safePage,
      size: pageSize,
      totalElements,
      totalPages,
      availableYears,
    };
  }

  findPublished(category?: LandingCategory): LandingSectionDocument[] {
    const slotOrder: Record<string, number> = {
      CME: 1,
      GSI: 2,
      AHS: 3,
      Conference: 4,
      CONFERENCE: 4,
    };
    const seen = new Set<string>();
    const result: LandingSectionDocument[] = [];
    const all = this.findAll();
    for (const doc of all) {
      if (!doc.published) continue;
      const upperDoc = String(doc.category || '').toUpperCase();
      const normCat = upperDoc === 'CONFERENCE' ? 'Conference' : (upperDoc === 'ASI' || upperDoc === 'AHS' ? 'AHS' : upperDoc);
      if (category) {
        const upperQuery = String(category).toUpperCase();
        const normQuery = upperQuery === 'CONFERENCE' ? 'Conference' : (upperQuery === 'ASI' || upperQuery === 'AHS' ? 'AHS' : upperQuery);
        if (normCat !== normQuery) continue;
      }
      if (!seen.has(normCat)) {
        seen.add(normCat);
        result.push(doc);
      }
    }
    // Fallback: If any of the 4 vertical categories has no active published card, pick its latest record
    const allVerticals = ['CME', 'GSI', 'AHS', 'Conference'];
    for (const v of allVerticals) {
      if (!category || String(category).toUpperCase() === v.toUpperCase()) {
        const hasV = result.some((r) => String(r.category || '').toUpperCase() === v.toUpperCase());
        if (!hasV) {
          const fallbackDoc = all.find((r) => String(r.category || '').toUpperCase() === v.toUpperCase());
          if (fallbackDoc) {
            result.push({ ...fallbackDoc, published: true });
          }
        }
      }
    }
    return result.sort((a, b) => (slotOrder[a.category] || 99) - (slotOrder[b.category] || 99));
  }

  findById(id: string): LandingSectionDocument | undefined {
    const found = this.documents.find((doc) => doc.id === id);
    return found ? this.normalizeDoc(found) : undefined;
  }

  unpublishOtherInCategory(
    category: LandingCategory,
    excludeId: string | null,
    newTitle: string,
    newYear: number
  ): LandingSectionDocument[] {
    const now = new Date().toISOString();
    const affected: LandingSectionDocument[] = [];

    this.documents = this.documents.map((doc) => {
      const norm = this.normalizeDoc(doc);
      if (norm.category === category && norm.published && norm.id !== excludeId) {
        const autoUnpubEntry: SectionAuditHistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action: 'UNPUBLISHED',
          publishedState: false,
          summary: `Auto-unpublished by 4-Card Rule because ${category} (${newYear}) "${newTitle}" was published`,
          timestamp: now,
        };
        const updatedDoc: LandingSectionDocument = {
          ...norm,
          published: false,
          history: [autoUnpubEntry, ...(norm.history || [])],
          updatedAt: now,
        };
        affected.push(updatedDoc);
        return updatedDoc;
      }
      return norm;
    });

    if (affected.length > 0) {
      this.persist();
    }
    return affected;
  }

  save(doc: LandingSectionDocument): LandingSectionDocument {
    const normalized = this.normalizeDoc(doc);
    const idx = this.documents.findIndex((item) => item.id === normalized.id);
    if (idx >= 0) {
      this.documents[idx] = normalized;
    } else {
      this.documents.push(normalized);
    }
    this.enforceMaxOnePublishedPerCategory();
    this.persist();
    return normalized;
  }

  deleteById(id: string): boolean {
    const initialLen = this.documents.length;
    this.documents = this.documents.filter((doc) => doc.id !== id);
    if (this.documents.length !== initialLen) {
      this.persist();
      return true;
    }
    return false;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const logger = new GhaStructuredLogger();
  const blobStorage: BlobStoragePort = new MultiProfileBlobStorageStrategy(logger);
  const repository: LandingSectionRepositoryPort = new MongoEventDbRepositoryAdapter(blobStorage);

  app.use('/api/v1/events', (req, res, next) => {
    const corrId =
      (req.headers['x-correlation-id'] as string) ||
      `gha-${Math.random().toString(36).slice(2, 10)}`;
    (req as Request & { correlationId?: string }).correlationId = corrId;
    const activeCfg = blobStorage.getActiveProfileConfig();

    res.setHeader('X-GHA-Gateway', 'gha-gateway:8080');
    res.setHeader('X-GHA-Upstream-Service', 'gha-event-service:8082');
    res.setHeader('X-GHA-Active-Profile', activeCfg.profile);
    res.setHeader('X-GHA-Correlation-Id', corrId);

    if (!req.path.startsWith('/logs') && !req.path.startsWith('/blobs')) {
      logger.log(
        activeCfg.profile,
        corrId,
        'DEBUG',
        'c.g.g.f.GatewayRouteLoggingFilter',
        `Routed ${req.method} /api/v1/events${req.path} -> lb://GHA-EVENT-SERVICE`
      );
    }
    next();
  });

  app.get('/api/v1/events/config', (_req: Request, res: Response) => {
    const activeCfg = blobStorage.getActiveProfileConfig();
    const stats = blobStorage.getPhysicalStorageStats();
    res.json({
      gatewayName: 'gha-gateway',
      serviceName: 'gha-event-service',
      javaVersion: '17 (Eclipse Temurin)',
      activeProfile: activeCfg.profile,
      availableProfiles: ['dev', 'qa', 'prod'],
      blobProvider: activeCfg.blobProvider,
      mongoDatabase: activeCfg.mongoDatabase,
      mongoUri: activeCfg.mongoUri,
      mongoCollection: 'landing_sections',
      blobStoreProvider:
        activeCfg.blobProvider === 'local-fs'
          ? 'LocalFileSystemBlobStorageAdapter (local-fs)'
          : 'SeaweedFsBlobStorageAdapter (seaweedfs)',
      blobStoreBasePath: activeCfg.blobStoreBasePath,
      seaweedFilerUrl: activeCfg.seaweedFilerUrl,
      logLevel: activeCfg.logLevel,
      blobStoreEnvVar: 'GHA_BLOB_STORE_PATH',
      blobStoreProperty: 'gha.blob-store.base-path',
      localPhysicalBlobDir: stats.physicalRootDir,
      localMongoCollectionFile: path.join(
        __dirname,
        'data',
        'mongodb_event_db',
        'landing_sections_v2.json'
      ),
      totalPhysicalBlobsStored: stats.totalStoredFiles,
    });
  });

  app.put('/api/v1/events/config/profile', (req: Request, res: Response) => {
    const { profile } = req.body as { profile?: GhaProfile };
    if (!profile || !['dev', 'qa', 'prod'].includes(profile)) {
      res.status(400).json({ error: 'Valid profile (dev, qa, prod) is required' });
      return;
    }
    const updated = blobStorage.switchProfile(profile);
    res.json({
      activeProfile: updated.profile,
      config: updated,
      message: `Switched active profile to '${updated.profile}' (provider=${updated.blobProvider}, basePath=${updated.blobStoreBasePath})`,
    });
  });

  app.put('/api/v1/events/config/blob-path', (req: Request, res: Response) => {
    const { blobStoreBasePath, blobProvider } = req.body;
    if (!blobStoreBasePath || typeof blobStoreBasePath !== 'string') {
      res.status(400).json({ error: 'blobStoreBasePath is required' });
      return;
    }
    blobStorage.setCustomBasePath(blobStoreBasePath, blobProvider);
    const cfg = blobStorage.getActiveProfileConfig();
    res.json({
      blobStoreBasePath: cfg.blobStoreBasePath,
      blobProvider: cfg.blobProvider,
      message: `Updated [${cfg.profile}] gha.blob-store.base-path='${cfg.blobStoreBasePath}'`,
    });
  });

  app.get('/api/v1/events/logs', (req: Request, res: Response) => {
    const level = req.query.level as LogLevel | undefined;
    const profile = req.query.profile as GhaProfile | undefined;
    res.json(logger.getLogs(level, profile));
  });

  app.delete('/api/v1/events/logs', (_req: Request, res: Response) => {
    logger.clearLogs();
    res.status(204).send();
  });

  // Live Upstream Proxy to Spring Boot gha-event-service (http://localhost:8082) -> MongoDB (event.landing_sections)
  // When gha-event-service is running on :8082, all /api/v1/events/landing-sections* requests are forwarded to it.
  // If gha-event-service returns an error, it is logged as ERROR and returned to the browser console.
  // If :8082 is not running (e.g., in cloud preview), logs a clear WARN and falls back to the embedded preview store.
  const UPSTREAM_EVENT_SERVICE = process.env.GHA_EVENT_SERVICE_URL || 'http://localhost:8082';
  let loggedOfflineNotice = false;

  app.use('/api/v1/events/landing-sections', async (req: Request, res: Response, next) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-proxy';
    const activeCfg = blobStorage.getActiveProfileConfig();
    // Normalize target URL (e.g. ?category=Conference -> ?category=CONFERENCE)
    let sanitizedOriginalUrl = req.originalUrl.replace(/category=Conference\b/gi, 'category=CONFERENCE');
    const targetUrl = `${UPSTREAM_EVENT_SERVICE}${sanitizedOriginalUrl}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase());

      // Normalize category in outgoing JSON payload so Spring Boot's Java enum deserialization succeeds immediately
      let forwardedBody: any = req.body;
      if (isBodyMethod && forwardedBody && typeof forwardedBody === 'object') {
        forwardedBody = { ...forwardedBody };
        if (forwardedBody.category && typeof forwardedBody.category === 'string') {
          const upper = forwardedBody.category.trim().toUpperCase();
          if (upper === 'CONFERENCE') forwardedBody.category = 'CONFERENCE';
          else if (upper === 'CME') forwardedBody.category = 'CME';
          else if (upper === 'GSI') forwardedBody.category = 'GSI';
          else if (upper === 'AHS' || upper === 'ASI' || upper === 'COURSE') forwardedBody.category = 'AHS';
        }
      }

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Correlation-Id': corrId,
        },
        body: isBodyMethod ? JSON.stringify(forwardedBody ?? {}) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      loggedOfflineNotice = false;

      if (upstreamRes.status === 204) {
        logger.log(
          activeCfg.profile,
          corrId,
          'INFO',
          'c.g.e.a.LandingSectionController',
          `[SPRING-BOOT-8082] ${req.method} ${req.originalUrl} -> HTTP 204 (MongoDB event.landing_sections)`
        );
        res.status(204).send();
        return;
      }

      const rawText = await upstreamRes.text();
      if (!upstreamRes.ok) {
        logger.log(
          activeCfg.profile,
          corrId,
          'ERROR',
          'c.g.e.a.LandingSectionController',
          `[SPRING-BOOT-ERROR] ${req.method} ${targetUrl} failed with HTTP ${upstreamRes.status}: ${rawText}`
        );
        res
          .status(upstreamRes.status)
          .type('application/json')
          .send(rawText || JSON.stringify({ error: `HTTP ${upstreamRes.status} from gha-event-service` }));
        return;
      }

      logger.log(
        activeCfg.profile,
        corrId,
        req.method === 'GET' ? 'DEBUG' : 'INFO',
        'c.g.e.a.LandingSectionServiceImpl',
        `[SPRING-BOOT-8082] ${req.method} ${req.originalUrl} -> HTTP ${upstreamRes.status} from MongoDB(event.landing_sections)`
      );
      res.status(upstreamRes.status).type('application/json').send(rawText);
    } catch (err) {
      // Offline fallback to embedded store is normal in preview environment; log at DEBUG to keep logs clean
      next();
    }
  });

  // Get single Landing Section by MongoDB _id (used when View or Edit is clicked)
  app.get('/api/v1/events/landing-sections/:id', (req: Request, res: Response, next) => {
    const reserved = ['listing', 'admin', 'published'];
    if (reserved.includes(req.params.id)) {
      next();
      return;
    }
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-get-id';
    const activeCfg = blobStorage.getActiveProfileConfig();
    const doc = repository.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: `Document not found in event_db for _id=${req.params.id}` });
      return;
    }
    logger.log(
      activeCfg.profile,
      corrId,
      'DEBUG',
      'c.g.e.a.LandingSectionServiceImpl',
      `findById(_id='${doc.id}') returned ${doc.category} (${doc.eventYear}) from MongoDB(${activeCfg.mongoDatabase}.landing_sections)`
    );
    res.json(doc);
  });

  // Paginated History Listing Endpoint (pageSize=10, filter by year, publish state, category, search)
  app.get('/api/v1/events/landing-sections/listing', (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-list';
    const activeCfg = blobStorage.getActiveProfileConfig();

    const page = Number(req.query.page) || 0;
    const size = Number(req.query.size) || 10;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const published =
      req.query.published === 'true'
        ? true
        : req.query.published === 'false'
        ? false
        : undefined;
    const category = req.query.category as LandingCategory | undefined;
    const search = req.query.search as string | undefined;

    const result = repository.findPaginated({
      page,
      size,
      year,
      published,
      category,
      search,
    });

    logger.log(
      activeCfg.profile,
      corrId,
      'DEBUG',
      'c.g.e.a.LandingSectionServiceImpl',
      `Paginated listing query (page=${result.page}, size=${result.size}, year=${year ?? 'ALL'}, published=${published ?? 'ALL'}) -> ${result.content.length} of ${result.totalElements} records`
    );

    res.json(result);
  });

  app.get('/api/v1/events/landing-sections/admin', (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-admin';
    const activeCfg = blobStorage.getActiveProfileConfig();
    const all = repository.findAll();
    logger.log(
      activeCfg.profile,
      corrId,
      'DEBUG',
      'c.g.e.a.LandingSectionServiceImpl',
      `Loaded ${all.length} total documents from MongoDB(${activeCfg.mongoDatabase}.landing_sections)`
    );
    res.json(all);
  });

  app.get('/api/v1/events/landing-sections/published', (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-mobile';
    const activeCfg = blobStorage.getActiveProfileConfig();
    const category = req.query.category as LandingCategory | undefined;
    const publishedList = repository.findPublished(category);

    logger.log(
      activeCfg.profile,
      corrId,
      'DEBUG',
      'c.g.e.a.LandingSectionServiceImpl',
      `Mobile App Landing Page query (category=${category || 'ALL'}, published=true) returned ${publishedList.length} records`
    );
    res.json(publishedList);
  });

  // Create new Mobile Landing Page Section
  app.post('/api/v1/events/landing-sections', async (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-create';
    const activeCfg = blobStorage.getActiveProfileConfig();

    try {
      const {
        category,
        eventYear,
        title,
        description,
        url,
        published,
        uploadedImages,
      } = req.body;

      if (!category || !description) {
        res.status(400).json({
          error: 'Category and section description are required.',
        });
        return;
      }

      const defaultTitles: Record<LandingCategory, string> = {
        CME: 'Continuing Medical Education (CME) Clinical Program',
        GSI: 'Gastrointestinal Society of India (GSI) Scientific Section',
        AHS: 'Course / AHS Surgical & Clinical Track',
        Conference: 'GHA Annual Medical Conference Section',
      };

      const resolvedCategory = category as LandingCategory;
      const resolvedYear = Number(eventYear) || new Date().getFullYear();
      const resolvedTitle =
        title && title.trim()
          ? title.trim()
          : defaultTitles[resolvedCategory] || `${resolvedCategory} Section`;
      const resolvedUrl = typeof url === 'string' ? url.trim() : '';

      const storedImages: SectionImageAsset[] = [];

      if (Array.isArray(uploadedImages) && uploadedImages.length > 0) {
        for (const img of uploadedImages) {
          if (img.base64Data && img.fileName) {
            const asset = await blobStorage.storeBlob(
              resolvedCategory,
              img.fileName,
              img.mimeType || 'image/jpeg',
              img.base64Data,
              corrId
            );
            storedImages.push(asset);
          }
        }
      }

      if (storedImages.length === 0) {
        const fallbackMap: Record<LandingCategory, string> = {
          CME: '/src/assets/images/gha_cme_symposium_1791459504997.jpg',
          GSI: '/src/assets/images/gha_gsi_summit_1791459527929.jpg',
          AHS: '/src/assets/images/gha_asi_course_1791459544460.jpg',
          Conference: '/src/assets/images/gha_annual_conference_1791459556638.jpg',
        };
        const safeName = `${resolvedCategory.toLowerCase()}_default_banner.jpg`;
        storedImages.push({
          blobPath: `${activeCfg.blobStoreBasePath}/${resolvedCategory.toLowerCase()}/${Date.now()}_${safeName}`,
          previewUrl: fallbackMap[resolvedCategory],
          fileName: safeName,
          mimeType: 'image/jpeg',
          sizeBytes: 280000,
        });
      }

      const primary = storedImages[0];
      const now = new Date().toISOString();
      const mongoObjectId =
        Math.floor(Date.now() / 1000).toString(16) +
        'c9e77a0012' +
        Math.floor(100000 + Math.random() * 899999).toString(16).slice(0, 6);

      const isPub = Boolean(published);
      let displacedRecords: LandingSectionDocument[] = [];
      if (isPub) {
        displacedRecords = repository.unpublishOtherInCategory(
          resolvedCategory,
          null,
          resolvedTitle,
          resolvedYear
        );
        for (const disp of displacedRecords) {
          logger.log(
            activeCfg.profile,
            corrId,
            'INFO',
            'c.g.e.a.LandingSectionServiceImpl',
            `[4-CARD-RULE] Auto-unpublished previous ${disp.category} (${disp.eventYear}) id='${disp.id}' because new ${resolvedCategory} (${resolvedYear}) was published`
          );
        }
      }

      const newDoc: LandingSectionDocument = {
        id: mongoObjectId,
        category: resolvedCategory,
        eventYear: resolvedYear,
        title: resolvedTitle,
        description: description.trim(),
        url: resolvedUrl,
        images: storedImages,
        imageBlobPath: primary.blobPath,
        imagePreviewUrl: primary.previewUrl,
        imageFileName: primary.fileName,
        imageMimeType: primary.mimeType,
        imageSizeBytes: primary.sizeBytes,
        published: isPub,
        history: [
          {
            id: `hist-${Date.now()}`,
            action: 'CREATED',
            publishedState: isPub,
            summary: `Created ${resolvedCategory} (${resolvedYear}) section with ${storedImages.length} image(s)${
              resolvedUrl ? ` · url=${resolvedUrl}` : ''
            } · ${isPub ? 'Published (Active Category Card)' : 'Unpublished'}`,
            timestamp: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      const saved = repository.save(newDoc);
      logger.log(
        activeCfg.profile,
        corrId,
        'INFO',
        'c.g.e.a.LandingSectionServiceImpl',
        `Saved new LandingSectionDocument id='${saved.id}' category='${saved.category}' year=${saved.eventYear} url='${saved.url}' images=${saved.images.length} published=${saved.published}`
      );
      res.status(201).json(saved);
    } catch (err) {
      logger.log(
        activeCfg.profile,
        corrId,
        'ERROR',
        'c.g.e.a.LandingSectionController',
        `Failed to create landing section: ${err instanceof Error ? err.message : String(err)}`
      );
      res.status(500).json({ error: 'Failed to create landing section in event_db' });
    }
  });

  // Update existing Mobile Landing Page Section on Save
  app.put('/api/v1/events/landing-sections/:id', async (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-update';
    const activeCfg = blobStorage.getActiveProfileConfig();
    const existing = repository.findById(req.params.id);

    if (!existing) {
      res.status(404).json({ error: 'Landing section not found in event_db' });
      return;
    }

    const {
      category,
      eventYear,
      title,
      description,
      url,
      published,
      retainedImages,
      uploadedImages,
    } = req.body;

    const resolvedCategory = (category as LandingCategory) || existing.category;
    const resolvedYear = eventYear !== undefined ? Number(eventYear) : existing.eventYear;
    const resolvedUrl =
      url !== undefined ? String(url).trim() : existing.url || '';
    const nextImages: SectionImageAsset[] = [];
    const seenBlob = new Set<string>();
    if (Array.isArray(retainedImages)) {
      for (const item of retainedImages) {
        if (item && item.blobPath && item.previewUrl && !seenBlob.has(item.blobPath)) {
          seenBlob.add(item.blobPath);
          nextImages.push(item);
        }
      }
    } else {
      for (const item of existing.images) {
        if (item && item.blobPath && !seenBlob.has(item.blobPath)) {
          seenBlob.add(item.blobPath);
          nextImages.push(item);
        }
      }
    }

    if (Array.isArray(uploadedImages) && uploadedImages.length > 0) {
      for (const img of uploadedImages) {
        if (img.base64Data && img.fileName) {
          const stored = await blobStorage.storeBlob(
            resolvedCategory,
            img.fileName,
            img.mimeType || 'image/jpeg',
            img.base64Data,
            corrId
          );
          if (!seenBlob.has(stored.blobPath)) {
            seenBlob.add(stored.blobPath);
            nextImages.push(stored);
          }
        }
      }
    }

    if (nextImages.length === 0 && existing.images.length > 0) {
      nextImages.push(existing.images[0]);
    }

    const primary = nextImages[0];
    const nextPublished = published !== undefined ? Boolean(published) : existing.published;
    const nextTitle = title !== undefined && title.trim() ? title.trim() : existing.title;
    const now = new Date().toISOString();

    if (nextPublished) {
      const displaced = repository.unpublishOtherInCategory(
        resolvedCategory,
        existing.id,
        nextTitle,
        resolvedYear
      );
      for (const disp of displaced) {
        logger.log(
          activeCfg.profile,
          corrId,
          'INFO',
          'c.g.e.a.LandingSectionServiceImpl',
          `[4-CARD-RULE] Auto-unpublished previous ${disp.category} (${disp.eventYear}) id='${disp.id}' because id='${existing.id}' was saved as Published`
        );
      }
    }

    const actionType: HistoryActionType =
      nextPublished !== existing.published
        ? nextPublished
          ? 'PUBLISHED'
          : 'UNPUBLISHED'
        : 'UPDATED';

    const newHistoryEntry: SectionAuditHistoryEntry = {
      id: `hist-${Date.now()}`,
      action: actionType,
      publishedState: nextPublished,
      summary: `Modified ${resolvedCategory} (${resolvedYear}) section${
        resolvedUrl ? ` · url=${resolvedUrl}` : ' · url=(none)'
      } · ${nextImages.length} image(s) · state=${
        nextPublished ? 'Published' : 'Unpublished'
      }`,
      timestamp: now,
    };

    const updated: LandingSectionDocument = {
      ...existing,
      category: resolvedCategory,
      eventYear: resolvedYear,
      title: nextTitle,
      description: description !== undefined ? description.trim() : existing.description,
      url: resolvedUrl,
      published: nextPublished,
      images: nextImages,
      imageBlobPath: primary.blobPath,
      imagePreviewUrl: primary.previewUrl,
      imageFileName: primary.fileName,
      imageMimeType: primary.mimeType,
      imageSizeBytes: primary.sizeBytes,
      history: [newHistoryEntry, ...(existing.history || [])],
      updatedAt: now,
    };

    const saved = repository.save(updated);
    logger.log(
      activeCfg.profile,
      corrId,
      'INFO',
      'c.g.e.a.LandingSectionServiceImpl',
      `Updated LandingSectionDocument id='${saved.id}' category='${saved.category}' year=${saved.eventYear} url='${saved.url}' images=${saved.images.length} published=${saved.published}`
    );
    res.json(saved);
  });

  // Toggle Publish / Re-Publish / Unpublish State with 4-Card Rule & History Recording
  app.patch('/api/v1/events/landing-sections/:id/publish', (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-pub';
    const activeCfg = blobStorage.getActiveProfileConfig();
    const existing = repository.findById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Landing section not found in event_db' });
      return;
    }
    const published = Boolean(req.body.published);
    const now = new Date().toISOString();

    let displacedSummary = '';
    if (published) {
      const displaced = repository.unpublishOtherInCategory(
        existing.category,
        existing.id,
        existing.title,
        existing.eventYear
      );
      if (displaced.length > 0) {
        displacedSummary = ` (replaced previous ${displaced[0].category} ${displaced[0].eventYear} card)`;
        for (const disp of displaced) {
          logger.log(
            activeCfg.profile,
            corrId,
            'INFO',
            'c.g.e.a.LandingSectionServiceImpl',
            `[4-CARD-RULE] Auto-unpublished previous ${disp.category} (${disp.eventYear}) id='${disp.id}' because historical/other record id='${existing.id}' was re-published`
          );
        }
      }
    }

    const newHistoryEntry: SectionAuditHistoryEntry = {
      id: `hist-${Date.now()}`,
      action: published ? 'PUBLISHED' : 'UNPUBLISHED',
      publishedState: published,
      summary: published
        ? `Published / Re-Published ${existing.category} (${existing.eventYear}) section to Mobile App Landing Page${displacedSummary}`
        : `Unpublished ${existing.category} (${existing.eventYear}) section — removed from Mobile App Landing Page`,
      timestamp: now,
    };

    const updated: LandingSectionDocument = {
      ...existing,
      published,
      history: [newHistoryEntry, ...(existing.history || [])],
      updatedAt: now,
    };
    const saved = repository.save(updated);
    logger.log(
      activeCfg.profile,
      corrId,
      'INFO',
      'c.g.e.a.LandingSectionServiceImpl',
      `Toggled publish state for document id='${saved.id}' (${saved.category}, ${saved.eventYear}) -> published=${saved.published}`
    );
    res.json(saved);
  });

  // Delete Landing Section
  app.delete('/api/v1/events/landing-sections/:id', (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-del';
    const activeCfg = blobStorage.getActiveProfileConfig();
    const deleted = repository.deleteById(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Landing section not found' });
      return;
    }
    logger.log(
      activeCfg.profile,
      corrId,
      'INFO',
      'c.g.e.a.LandingSectionServiceImpl',
      `Deleted document id='${req.params.id}' from MongoDB(${activeCfg.mongoDatabase}.landing_sections)`
    );
    res.status(204).send();
  });

  // Live S3 Bucket Listing on VPS (http://103.118.17.94:8333/gha-files/)
  app.get('/api/v1/events/s3/list', async (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-s3-ls';
    const activeCfg = blobStorage.getActiveProfileConfig();
    try {
      const objects = await listObjectsFromSeaweedS3();
      logger.log(
        activeCfg.profile,
        corrId,
        'DEBUG',
        'c.g.e.i.b.SeaweedFsBlobStorageAdapter',
        `[SEAWEEDFS-S3] Listed s3://${SEAWEED_S3_BUCKET}/ from ${SEAWEED_S3_ENDPOINT} -> ${objects.length} object(s)`
      );
      res.json({
        endpoint: SEAWEED_S3_ENDPOINT,
        bucket: SEAWEED_S3_BUCKET,
        count: objects.length,
        objects,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.log(
        activeCfg.profile,
        corrId,
        'ERROR',
        'c.g.e.i.b.SeaweedFsBlobStorageAdapter',
        `[SEAWEEDFS-S3] Failed to list s3://${SEAWEED_S3_BUCKET}/: ${msg}`
      );
      res.status(502).json({ error: msg, endpoint: SEAWEED_S3_ENDPOINT, bucket: SEAWEED_S3_BUCKET });
    }
  });

  // Direct Test Upload from Preview UI to VPS S3 (http://103.118.17.94:8333/gha-files/)
  app.post('/api/v1/events/s3/upload', async (req: Request, res: Response) => {
    const corrId = (req as Request & { correlationId?: string }).correlationId || 'gha-s3-put';
    const activeCfg = blobStorage.getActiveProfileConfig();
    try {
      const { fileName, mimeType, base64Data, customKey } = req.body as {
        fileName?: string;
        mimeType?: string;
        base64Data?: string;
        customKey?: string;
      };
      if (!fileName || !base64Data) {
        res.status(400).json({ error: 'fileName and base64Data are required' });
        return;
      }
      const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectKey =
        customKey && customKey.trim()
          ? customKey.trim().replace(/^\/+/, '').replace(/^gha-files\/+/, '')
          : cleanName;
      const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(rawBase64, 'base64');

      const result = await putObjectToSeaweedS3(objectKey, buffer, mimeType || 'image/jpeg');
      if (!result.ok) {
        logger.log(
          activeCfg.profile,
          corrId,
          'ERROR',
          'c.g.e.i.b.SeaweedFsBlobStorageAdapter',
          `[SEAWEEDFS-S3] Direct PUT failed (HTTP ${result.status}): ${result.errorText}`
        );
        res.status(502).json({ error: result.errorText || `HTTP ${result.status}` });
        return;
      }

      logger.log(
        activeCfg.profile,
        corrId,
        'INFO',
        'c.g.e.i.b.SeaweedFsBlobStorageAdapter',
        `[SEAWEEDFS-S3] Direct PUT succeeded -> ${result.s3Uri} (${buffer.length} bytes, ETag=${result.eTag})`
      );

      const objects = await listObjectsFromSeaweedS3().catch(() => []);
      res.status(201).json({
        ok: true,
        key: objectKey,
        s3Uri: result.s3Uri,
        eTag: result.eTag,
        sizeBytes: buffer.length,
        previewUrl: `/api/v1/events/blobs?path=${encodeURIComponent(`/${SEAWEED_S3_BUCKET}/${objectKey}`)}`,
        objects,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/v1/events/blobs', async (req: Request, res: Response) => {
    const blobPath = req.query.path as string;
    if (!blobPath) {
      res.status(400).send('Missing path query parameter');
      return;
    }
    const resolved = blobStorage.resolveBlobFile(blobPath);
    if (resolved) {
      res.setHeader('Content-Type', resolved.mimeType);
      res.sendFile(resolved.filePath);
      return;
    }
    const remoteObj = await getObjectFromSeaweedS3(blobPath).catch(() => null);
    if (remoteObj) {
      res.setHeader('Content-Type', remoteObj.contentType);
      res.send(remoteObj.buffer);
      return;
    }
    res.status(404).send('Blob not found in storage');
  });

  // Downloadable Full Project Bundle (.tar.gz) pre-structured into service/, ui/admin/, and ui/app/
  app.get('/api/v1/events/export/gha-platform-bundle.tar.gz', (_req: Request, res: Response) => {
    try {
      const dataDir = path.join(__dirname, 'data');
      const stagingDir = path.join(dataDir, 'export_staging');
      const outPath = path.join(dataDir, 'gha-platform-bundle.tar.gz');

      fs.rmSync(stagingDir, { recursive: true, force: true });
      fs.mkdirSync(path.join(stagingDir, 'service'), { recursive: true });
      fs.mkdirSync(path.join(stagingDir, 'ui', 'admin', 'nginx'), { recursive: true });
      fs.mkdirSync(path.join(stagingDir, 'ui', 'app'), { recursive: true });
      fs.mkdirSync(path.join(stagingDir, 'scripts'), { recursive: true });

      // 1. Backend -> service/ (gha-event-service, gha-gateway, nginx, podman-compose.yml)
      if (fs.existsSync(path.join(__dirname, 'backend-java'))) {
        fs.cpSync(
          path.join(__dirname, 'backend-java'),
          path.join(stagingDir, 'service'),
          { recursive: true }
        );
      }

      // 2. Frontend Admin -> ui/admin/
      const adminFiles = [
        'src',
        'index.html',
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'server.ts',
        '.env.example',
        'metadata.json',
      ];
      for (const item of adminFiles) {
        const srcItem = path.join(__dirname, item);
        if (fs.existsSync(srcItem)) {
          fs.cpSync(srcItem, path.join(stagingDir, 'ui', 'admin', item), {
            recursive: true,
          });
        }
      }
      const nginxConf = path.join(__dirname, 'backend-java', 'nginx', 'nginx.conf');
      if (fs.existsSync(nginxConf)) {
        fs.cpSync(nginxConf, path.join(stagingDir, 'ui', 'admin', 'nginx', 'nginx.conf'));
      }

      // 3. Frontend Mobile App -> ui/app/
      if (fs.existsSync(path.join(__dirname, 'mobile-app-ghaapp'))) {
        fs.cpSync(
          path.join(__dirname, 'mobile-app-ghaapp'),
          path.join(stagingDir, 'ui', 'app'),
          { recursive: true }
        );
      }

      // 4. Sync Script -> scripts/sync-three-repos.sh
      const syncScript = path.join(__dirname, 'scripts', 'sync-three-repos.sh');
      if (fs.existsSync(syncScript)) {
        fs.cpSync(syncScript, path.join(stagingDir, 'scripts', 'sync-three-repos.sh'));
      }

      execFileSync('tar', ['-czf', outPath, 'service', 'ui', 'scripts'], {
        cwd: stagingDir,
      });

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="gha-platform-bundle.tar.gz"'
      );
      res.sendFile(outPath);
    } catch (err) {
      console.error('Failed to build tar.gz archive:', err);
      res.status(500).json({ error: 'Failed to create downloadable archive' });
    }
  });

  // Self-contained macOS/Linux terminal sync command (bypasses Cloud Run proxy cookie auth on curl)
  app.get('/api/v1/events/export/local-sync-command', (_req: Request, res: Response) => {
    try {
      const dataDir = path.join(__dirname, 'data');
      const stagingDir = path.join(dataDir, 'export_staging_light');
      const outPath = path.join(dataDir, 'gha-code-sync.tar.gz');

      fs.rmSync(stagingDir, { recursive: true, force: true });
      fs.mkdirSync(path.join(stagingDir, 'service'), { recursive: true });
      fs.mkdirSync(path.join(stagingDir, 'ui', 'admin', 'nginx'), { recursive: true });
      fs.mkdirSync(path.join(stagingDir, 'ui', 'app'), { recursive: true });
      fs.mkdirSync(path.join(stagingDir, 'scripts'), { recursive: true });

      // 1. Backend -> service/
      if (fs.existsSync(path.join(__dirname, 'backend-java'))) {
        fs.cpSync(
          path.join(__dirname, 'backend-java'),
          path.join(stagingDir, 'service'),
          { recursive: true }
        );
      }

      // 2. Frontend Admin -> ui/admin/ (excluding large generated binary jpgs to keep clipboard command compact)
      const adminFiles = [
        'index.html',
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'server.ts',
        '.env.example',
        'metadata.json',
      ];
      for (const item of adminFiles) {
        const srcItem = path.join(__dirname, item);
        if (fs.existsSync(srcItem)) {
          fs.cpSync(srcItem, path.join(stagingDir, 'ui', 'admin', item), {
            recursive: true,
          });
        }
      }
      if (fs.existsSync(path.join(__dirname, 'src'))) {
        fs.cpSync(
          path.join(__dirname, 'src'),
          path.join(stagingDir, 'ui', 'admin', 'src'),
          {
            recursive: true,
            filter: (sourcePath) => !sourcePath.endsWith('.jpg') && !sourcePath.endsWith('.png'),
          }
        );
      }
      const nginxConf = path.join(__dirname, 'backend-java', 'nginx', 'nginx.conf');
      if (fs.existsSync(nginxConf)) {
        fs.cpSync(nginxConf, path.join(stagingDir, 'ui', 'admin', 'nginx', 'nginx.conf'));
      }

      // 3. Frontend Mobile App -> ui/app/
      if (fs.existsSync(path.join(__dirname, 'mobile-app-ghaapp'))) {
        fs.cpSync(
          path.join(__dirname, 'mobile-app-ghaapp'),
          path.join(stagingDir, 'ui', 'app'),
          { recursive: true }
        );
      }

      // 4. Sync Script -> scripts/sync-three-repos.sh
      const syncScript = path.join(__dirname, 'scripts', 'sync-three-repos.sh');
      if (fs.existsSync(syncScript)) {
        fs.cpSync(syncScript, path.join(stagingDir, 'scripts', 'sync-three-repos.sh'));
      }

      execFileSync('tar', ['-czf', outPath, 'service', 'ui', 'scripts'], {
        cwd: stagingDir,
      });

      const base64Archive = fs.readFileSync(outPath).toString('base64');
      const targetDir = '/Users/jayakumar/project/gha/mobile-app/code';
      const command = `mkdir -p ${targetDir} && echo '${base64Archive}' | base64 --decode | tar -xz -C ${targetDir} && echo "✅ Successfully synced service/, ui/admin/, and ui/app/ into ${targetDir}"`;

      res.json({
        targetDir,
        archiveBytes: fs.statSync(outPath).size,
        command,
      });
    } catch (err) {
      console.error('Failed to generate local sync command:', err);
      res.status(500).json({ error: 'Failed to generate local sync command' });
    }
  });

  app.get('/api/v1/events/java-sources', (_req: Request, res: Response) => {
    const filesToExpose = [
      {
        title: 'sync-three-repos.sh (GitHub 3-Repo Push Script)',
        module: 'GitHub Sync: JKCBase/ghaapp · app-eventservice · app-admin',
        relativePath: 'scripts/sync-three-repos.sh',
        language: 'bash',
      },
      {
        title: 'App.tsx (React Native Mobile App)',
        module: 'Repo 1: JKCBase/ghaapp (Mobile App)',
        relativePath: 'mobile-app-ghaapp/App.tsx',
        language: 'tsx',
      },
      {
        title: 'eventGatewayClient.ts (Mobile Gateway Client)',
        module: 'Repo 1: JKCBase/ghaapp (Mobile App)',
        relativePath: 'mobile-app-ghaapp/src/api/eventGatewayClient.ts',
        language: 'typescript',
      },
      {
        title: 'pom.xml (Java 17 Maven Project)',
        module: 'Repo 2: JKCBase/app-eventservice',
        relativePath: 'backend-java/gha-event-service/pom.xml',
        language: 'xml',
      },
      {
        title: 'LocalFileSystemBlobStorageAdapter.java',
        module: 'Repo 2: JKCBase/app-eventservice (Local Disk Strategy)',
        relativePath:
          'backend-java/gha-event-service/src/main/java/com/gha/eventservice/infrastructure/blob/LocalFileSystemBlobStorageAdapter.java',
        language: 'java',
      },
      {
        title: 'SeaweedFsBlobStorageAdapter.java',
        module: 'gha-event-service (SeaweedFS Strategy)',
        relativePath:
          'backend-java/gha-event-service/src/main/java/com/gha/eventservice/infrastructure/blob/SeaweedFsBlobStorageAdapter.java',
        language: 'java',
      },
      {
        title: 'BlobStoragePort.java',
        module: 'gha-event-service (Port Interface)',
        relativePath:
          'backend-java/gha-event-service/src/main/java/com/gha/eventservice/domain/port/BlobStoragePort.java',
        language: 'java',
      },
      {
        title: 'LandingSectionDocument.java',
        module: 'gha-event-service (MongoDB Document + History)',
        relativePath:
          'backend-java/gha-event-service/src/main/java/com/gha/eventservice/domain/model/LandingSectionDocument.java',
        language: 'java',
      },
      {
        title: 'LandingSectionRepository.java',
        module: 'gha-event-service (Pageable + Year Filter Repo)',
        relativePath:
          'backend-java/gha-event-service/src/main/java/com/gha/eventservice/infrastructure/persistence/LandingSectionRepository.java',
        language: 'java',
      },
      {
        title: 'LandingSectionServiceImpl.java',
        module: 'gha-event-service (SLF4J Debug Logged Service)',
        relativePath:
          'backend-java/gha-event-service/src/main/java/com/gha/eventservice/application/LandingSectionServiceImpl.java',
        language: 'java',
      },
      {
        title: 'LandingSectionController.java',
        module: 'gha-event-service (Paginated REST API + MDC)',
        relativePath:
          'backend-java/gha-event-service/src/main/java/com/gha/eventservice/api/LandingSectionController.java',
        language: 'java',
      },
      {
        title: 'application-dev.yml',
        module: 'Profile: DEV (Local Disk Storage + DEBUG Logs)',
        relativePath:
          'backend-java/gha-event-service/src/main/resources/application-dev.yml',
        language: 'yaml',
      },
      {
        title: 'application-qa.yml',
        module: 'Profile: QA (QA SeaweedFS + DEBUG Logs)',
        relativePath:
          'backend-java/gha-event-service/src/main/resources/application-qa.yml',
        language: 'yaml',
      },
      {
        title: 'application-prod.yml',
        module: 'Profile: PROD (Hosting Raja VPS + INFO Logs)',
        relativePath:
          'backend-java/gha-event-service/src/main/resources/application-prod.yml',
        language: 'yaml',
      },
      {
        title: 'logback-spring.xml',
        module: 'SLF4J / Logback (dev, qa, prod Profiles)',
        relativePath:
          'backend-java/gha-event-service/src/main/resources/logback-spring.xml',
        language: 'xml',
      },
      {
        title: 'application.yml (GHA Gateway — dev/qa/prod)',
        module: 'Repo 3: JKCBase/app-gateway (Spring Cloud Gateway)',
        relativePath:
          'backend-java/gha-gateway/src/main/resources/application.yml',
        language: 'yaml',
      },
      {
        title: 'GatewayCorrelationAndLoggingGlobalFilter.java',
        module: 'Repo 3: JKCBase/app-gateway (GlobalFilter + Debug Logs)',
        relativePath:
          'backend-java/gha-gateway/src/main/java/com/gha/gateway/filter/GatewayCorrelationAndLoggingGlobalFilter.java',
        language: 'java',
      },
      {
        title: 'pom.xml (GHA Gateway)',
        module: 'Repo 3: JKCBase/app-gateway',
        relativePath: 'backend-java/gha-gateway/pom.xml',
        language: 'xml',
      },
      {
        title: 'podman-compose.yml',
        module: 'Podman Container Topology',
        relativePath: 'backend-java/podman-compose.yml',
        language: 'yaml',
      },
    ];

    const loaded = filesToExpose.map((f) => {
      const fullPath = path.join(__dirname, f.relativePath);
      const content = fs.existsSync(fullPath)
        ? fs.readFileSync(fullPath, 'utf-8')
        : '// File not found';
      return { ...f, content };
    });

    res.json(loaded);
  });

  const distPath = path.join(process.cwd(), 'dist');
  const distIndexExists = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !distIndexExists) {
    if (process.env.NODE_ENV === 'production' && !distIndexExists) {
      logger.log(
        'dev',
        'gha-boot',
        'WARN',
        'c.g.e.GhaEventServiceApplication',
        'Production mode active but dist/index.html was not found. Automatically falling back to Vite live development middleware.'
      );
    }
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err && !res.headersSent) {
          res.status(500).send('Admin UI build not found. Run "npm run build" to build dist, or run "npm run dev".');
        }
      });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.log(
      'dev',
      'gha-boot',
      'INFO',
      'c.g.e.GhaEventServiceApplication',
      `Started GhaEventServiceApplication & GHA Gateway on port ${PORT} (profiles: dev, qa, prod)`
    );
  });
}

startServer();
