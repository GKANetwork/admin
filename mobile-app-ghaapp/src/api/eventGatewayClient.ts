export type LandingCategory = 'CME' | 'GSI' | 'AHS' | 'Conference';

export interface SectionImageAsset {
  blobPath: string;
  previewUrl?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MobileLandingSection {
  id: string;
  category: LandingCategory;
  eventYear: number;
  title: string;
  description: string;
  url: string;
  images: SectionImageAsset[];
  imageBlobPath: string;
  published: boolean;
  updatedAt: string;
}

/**
 * Interface Abstraction (Port) for Mobile App Gateway Communication
 */
export interface MobileEventGatewayPort {
  fetchPublishedLandingSections(category?: LandingCategory): Promise<MobileLandingSection[]>;
  resolveBlobImageUrl(blobPath: string): string;
}

export class GhaSpringCloudGatewayAdapter implements MobileEventGatewayPort {
  private readonly gatewayBaseUrl: string;

  constructor(gatewayBaseUrl = process.env.EXPO_PUBLIC_GHA_GATEWAY_URL || 'http://10.0.2.2:8080') {
    this.gatewayBaseUrl = gatewayBaseUrl.replace(/\/+$/, '');
  }

  async fetchPublishedLandingSections(category?: LandingCategory): Promise<MobileLandingSection[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const response = await fetch(
      `${this.gatewayBaseUrl}/api/v1/events/landing-sections/published${query}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Client-Platform': 'gha-mobile-app',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Gateway error (${response.status}): Failed to load published landing sections`);
    }

    const data: MobileLandingSection[] = await response.json();
    // Strict client-side guard: only render published === true records
    return data.filter((item) => item.published === true);
  }

  resolveBlobImageUrl(blobPath: string): string {
    return `${this.gatewayBaseUrl}/api/v1/events/blobs?path=${encodeURIComponent(blobPath)}`;
  }
}
