package com.gha.eventservice.domain.port;

import com.gha.eventservice.domain.model.LandingCategory;

import java.io.InputStream;

/**
 * Port / Interface abstraction for Blob Storage (Strategy Pattern).
 * Allows seamlessly switching between SeaweedFS Filer, SeaweedFS S3, or Local Volume storage
 * without modifying domain or application service code.
 */
public interface BlobStoragePort {

    record StoredBlobResult(
        String blobPath,
        String fileName,
        String contentType,
        long sizeBytes
    ) {}

    /**
     * Stores an image in the configured blob store path (resolved from property or env var)
     * and returns the stored path to persist in MongoDB (event_db).
     */
    StoredBlobResult storeSectionImage(
        LandingCategory category,
        String originalFileName,
        String contentType,
        long sizeBytes,
        InputStream contentStream
    );

    /**
     * Reads a blob stream by its stored MongoDB path.
     */
    InputStream readBlobStream(String blobPath);

    /**
     * Deletes a blob from the underlying storage provider.
     */
    void deleteBlob(String blobPath);

    /**
     * Returns the configured base path resolved from application property or environment variable.
     */
    String getConfiguredBasePath();
}
