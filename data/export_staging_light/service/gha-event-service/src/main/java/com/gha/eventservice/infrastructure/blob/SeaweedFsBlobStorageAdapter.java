package com.gha.eventservice.infrastructure.blob;

import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.port.BlobStoragePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.InputStream;
import java.time.Instant;

/**
 * SeaweedFS Implementation of BlobStoragePort (Strategy Pattern).
 * Activated when gha.blob-store.provider=seaweedfs (default in 'qa' and 'prod' profiles).
 * Picks base storage path from 'gha.blob-store.base-path' property or 'GHA_BLOB_STORE_PATH' env var.
 */
@Component
@ConditionalOnProperty(name = "gha.blob-store.provider", havingValue = "seaweedfs", matchIfMissing = false)
public class SeaweedFsBlobStorageAdapter implements BlobStoragePort {

    private static final Logger log = LoggerFactory.getLogger(SeaweedFsBlobStorageAdapter.class);

    private final String basePath;
    private final String seaweedFilerUrl;
    private final RestClient restClient;

    public SeaweedFsBlobStorageAdapter(
            @Value("${gha.blob-store.base-path:${GHA_BLOB_STORE_PATH:/seaweedfs/buckets/gha-event-media/landing-sections}}") String basePath,
            @Value("${gha.blob-store.seaweedfs-filer-url:${GHA_SEAWEEDFS_ENDPOINT:http://seaweedfs:8888}}") String seaweedFilerUrl
    ) {
        this.basePath = basePath.endsWith("/") ? basePath.substring(0, basePath.length() - 1) : basePath;
        this.seaweedFilerUrl = seaweedFilerUrl.endsWith("/") ? seaweedFilerUrl.substring(0, seaweedFilerUrl.length() - 1) : seaweedFilerUrl;
        this.restClient = RestClient.builder().baseUrl(this.seaweedFilerUrl).build();
        log.info("[SEAWEEDFS-BLOB-STORE] Initialized SeaweedFS adapter: filerUrl='{}', basePath='{}'",
                this.seaweedFilerUrl, this.basePath);
    }

    @Override
    public StoredBlobResult storeSectionImage(
            LandingCategory category,
            String originalFileName,
            String contentType,
            long sizeBytes,
            InputStream contentStream
    ) {
        String sanitizedName = (originalFileName != null ? originalFileName : "banner.jpg")
                .replaceAll("[^a-zA-Z0-9._-]", "_");
        String categoryFolder = category.name().toLowerCase();
        String targetBlobPath = String.format("%s/%s/%d_%s",
                basePath, categoryFolder, Instant.now().toEpochMilli(), sanitizedName);

        log.debug("[SEAWEEDFS-BLOB-STORE] Uploading image to SeaweedFS: category={}, targetBlobPath={}, sizeBytes={}",
                category, targetBlobPath, sizeBytes);

        MultipartBodyBuilder bodyBuilder = new MultipartBodyBuilder();
        bodyBuilder.part("file", new InputStreamResource(contentStream))
                .filename(sanitizedName)
                .contentType(MediaType.parseMediaType(contentType != null ? contentType : "image/jpeg"));

        restClient.post()
                .uri(targetBlobPath)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(bodyBuilder.build())
                .retrieve()
                .toBodilessEntity();

        log.info("[SEAWEEDFS-BLOB-STORE] Successfully stored image in SeaweedFS: path='{}'", targetBlobPath);
        return new StoredBlobResult(targetBlobPath, sanitizedName, contentType, sizeBytes);
    }

    @Override
    public InputStream readBlobStream(String blobPath) {
        log.debug("[SEAWEEDFS-BLOB-STORE] Fetching blob stream from SeaweedFS path='{}'", blobPath);
        byte[] bytes = restClient.get()
                .uri(blobPath)
                .retrieve()
                .body(byte[].class);
        return new java.io.ByteArrayInputStream(bytes != null ? bytes : new byte[0]);
    }

    @Override
    public void deleteBlob(String blobPath) {
        log.debug("[SEAWEEDFS-BLOB-STORE] Deleting blob from SeaweedFS path='{}'", blobPath);
        restClient.delete()
                .uri(blobPath)
                .retrieve()
                .toBodilessEntity();
    }

    @Override
    public String getConfiguredBasePath() {
        return this.basePath;
    }
}
