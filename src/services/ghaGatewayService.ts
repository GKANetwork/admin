import {
  BlobProviderType,
  DebugLogEntry,
  GhaEventGatewayPort,
  GhaGatewayConfigInfo,
  GhaProfile,
  JavaSourceArtifact,
  LandingCategory,
  LandingSectionRecord,
  ListingQueryParams,
  LogLevel,
  PaginatedLandingSectionsResponse,
  UpsertLandingSectionPayload,
} from '../types/gha';

class GhaHttpGatewayAdapter implements GhaEventGatewayPort {
  private readonly baseUrl = '/api/v1/events';

  async getGatewayConfig(): Promise<GhaGatewayConfigInfo> {
    const res = await fetch(`${this.baseUrl}/config`);
    if (!res.ok) throw new Error('Failed to fetch GHA Gateway configuration');
    return res.json();
  }

  async switchProfile(profile: GhaProfile): Promise<{ activeProfile: GhaProfile; message: string }> {
    const res = await fetch(`${this.baseUrl}/config/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    });
    if (!res.ok) throw new Error('Failed to switch active Spring profile');
    return res.json();
  }

  async updateBlobStoreBasePath(
    newBasePath: string,
    blobProvider?: BlobProviderType
  ): Promise<{ blobStoreBasePath: string; blobProvider: BlobProviderType; message: string }> {
    const res = await fetch(`${this.baseUrl}/config/blob-path`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobStoreBasePath: newBasePath, blobProvider }),
    });
    if (!res.ok) throw new Error('Failed to update blob store base path property');
    return res.json();
  }

  async getDebugLogs(level?: LogLevel, profile?: GhaProfile): Promise<DebugLogEntry[]> {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (profile) params.set('profile', profile);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${this.baseUrl}/logs${qs}`);
    if (!res.ok) throw new Error('Failed to load debug logs');
    return res.json();
  }

  async clearDebugLogs(): Promise<void> {
    await fetch(`${this.baseUrl}/logs`, { method: 'DELETE' });
  }

  async getPaginatedListing(params: ListingQueryParams): Promise<PaginatedLandingSectionsResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set('page', String(params.page));
    searchParams.set('size', String(params.size));
    if (params.year !== undefined) searchParams.set('year', String(params.year));
    if (params.published !== undefined) searchParams.set('published', String(params.published));
    if (params.category) searchParams.set('category', params.category);
    if (params.search && params.search.trim()) searchParams.set('search', params.search.trim());

    const res = await fetch(`${this.baseUrl}/landing-sections/listing?${searchParams.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch paginated history listing');
    return res.json();
  }

  async getSectionById(id: string): Promise<LandingSectionRecord> {
    const res = await fetch(`${this.baseUrl}/landing-sections/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Failed to fetch landing section for _id=${id}`);
    return res.json();
  }

  async getAllAdminSections(): Promise<LandingSectionRecord[]> {
    const res = await fetch(`${this.baseUrl}/landing-sections/admin`);
    if (!res.ok) throw new Error('Failed to load admin landing sections from event.landing_sections');
    return res.json();
  }

  async getPublishedMobileSections(category?: LandingCategory): Promise<LandingSectionRecord[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await fetch(`${this.baseUrl}/landing-sections/published${query}`);
    if (!res.ok) throw new Error('Failed to load published mobile landing sections');
    return res.json();
  }

  async createLandingSection(payload: UpsertLandingSectionPayload): Promise<LandingSectionRecord> {
    const res = await fetch(`${this.baseUrl}/landing-sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create section' }));
      throw new Error(err.error || 'Failed to create section');
    }
    return res.json();
  }

  async updateLandingSection(
    id: string,
    payload: UpsertLandingSectionPayload
  ): Promise<LandingSectionRecord> {
    const res = await fetch(`${this.baseUrl}/landing-sections/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update section' }));
      throw new Error(err.error || 'Failed to update section');
    }
    return res.json();
  }

  async togglePublishStatus(id: string, published: boolean): Promise<LandingSectionRecord> {
    const res = await fetch(`${this.baseUrl}/landing-sections/${encodeURIComponent(id)}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published }),
    });
    if (!res.ok) throw new Error('Failed to update publish status');
    return res.json();
  }

  async deleteLandingSection(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/landing-sections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete landing section');
  }

  async getJavaBackendSources(): Promise<JavaSourceArtifact[]> {
    const res = await fetch(`${this.baseUrl}/java-sources`);
    if (!res.ok) throw new Error('Failed to load Java 17 source artifacts');
    return res.json();
  }
}

export class GhaGatewayClientFactory {
  private static instance: GhaEventGatewayPort | null = null;

  static getClient(): GhaEventGatewayPort {
    if (!this.instance) {
      this.instance = new GhaHttpGatewayAdapter();
    }
    return this.instance;
  }
}
