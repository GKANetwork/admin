export type LandingCategory = 'CME' | 'GSI' | 'AHS' | 'Conference';
export type GhaProfile = 'dev' | 'qa' | 'prod';
export type BlobProviderType = 'local-fs' | 'seaweedfs';
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type HistoryActionType = 'CREATED' | 'UPDATED' | 'PUBLISHED' | 'UNPUBLISHED';

export interface CategoryMetadata {
  code: LandingCategory;
  shortLabel: string;
  fullName: string;
  clinicalFocus: string;
}

export const LANDING_CATEGORIES: CategoryMetadata[] = [
  {
    code: 'CME',
    shortLabel: 'CME',
    fullName: 'Continuing Medical Education',
    clinicalFocus: 'Accredited credit hours, clinical case reviews & symposiums',
  },
  {
    code: 'GSI',
    shortLabel: 'GSI',
    fullName: 'Gastrointestinal Society of India',
    clinicalFocus: 'Endoscopy, hepatobiliary consensus & luminal gastroenterology',
  },
  {
    code: 'AHS',
    shortLabel: 'Course / AHS',
    fullName: 'Course / AHS Surgical & Clinical Fellowship',
    clinicalFocus: 'Surgical skill masterclasses, laparoscopy & fellowship courses',
  },
  {
    code: 'Conference',
    shortLabel: 'Conference',
    fullName: 'Annual Medical Conference',
    clinicalFocus: 'Plenary keynotes, abstract posters & multi-specialty congresses',
  },
];

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

export interface PendingImageUpload {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  previewUrl: string;
}

export interface LandingSectionRecord {
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
  content: LandingSectionDocumentRecord[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  availableYears: number[];
}

export type LandingSectionDocumentRecord = LandingSectionRecord;

export interface ListingQueryParams {
  page: number;
  size: number;
  year?: number;
  published?: boolean;
  category?: LandingCategory;
  search?: string;
}

export interface UpsertLandingSectionPayload {
  category: LandingCategory;
  eventYear: number;
  title: string;
  description: string;
  url?: string;
  published: boolean;
  retainedImages?: SectionImageAsset[];
  uploadedImages?: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    base64Data: string;
  }>;
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

export interface GhaGatewayConfigInfo {
  gatewayName: string;
  serviceName: string;
  javaVersion: string;
  activeProfile: GhaProfile;
  availableProfiles: GhaProfile[];
  blobProvider: BlobProviderType;
  mongoDatabase: string;
  mongoUri: string;
  mongoCollection: string;
  blobStoreProvider: string;
  blobStoreBasePath: string;
  seaweedFilerUrl: string;
  logLevel: LogLevel;
  blobStoreEnvVar: string;
  blobStoreProperty: string;
  localPhysicalBlobDir: string;
  localMongoCollectionFile: string;
  totalPhysicalBlobsStored: number;
}

export interface JavaSourceArtifact {
  title: string;
  module: string;
  relativePath: string;
  language: string;
  content: string;
}

export interface GhaEventGatewayPort {
  getGatewayConfig(): Promise<GhaGatewayConfigInfo>;
  switchProfile(profile: GhaProfile): Promise<{ activeProfile: GhaProfile; message: string }>;
  updateBlobStoreBasePath(
    newBasePath: string,
    blobProvider?: BlobProviderType
  ): Promise<{ blobStoreBasePath: string; blobProvider: BlobProviderType; message: string }>;
  getDebugLogs(level?: LogLevel, profile?: GhaProfile): Promise<DebugLogEntry[]>;
  clearDebugLogs(): Promise<void>;
  getPaginatedListing(params: ListingQueryParams): Promise<PaginatedLandingSectionsResponse>;
  getSectionById(id: string): Promise<LandingSectionRecord>;
  getAllAdminSections(): Promise<LandingSectionRecord[]>;
  getPublishedMobileSections(category?: LandingCategory): Promise<LandingSectionRecord[]>;
  createLandingSection(payload: UpsertLandingSectionPayload): Promise<LandingSectionRecord>;
  updateLandingSection(id: string, payload: UpsertLandingSectionPayload): Promise<LandingSectionRecord>;
  togglePublishStatus(id: string, published: boolean): Promise<LandingSectionRecord>;
  deleteLandingSection(id: string): Promise<void>;
  getJavaBackendSources(): Promise<JavaSourceArtifact[]>;
}
