package com.gha.eventservice.infrastructure.blob;

import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.port.BlobStoragePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;

/**
 * Local File System Implementation of BlobStoragePort (Strategy Pattern).
 * Activated when gha.blob-store.provider=local-fs (default in 'dev' profile).
 * Stores uploaded category images directly on the local machine disk path resolved from
 * 'gha.blob-store.base-path' or 'GHA_BLOB_STORE_PATH' environment variable.
 */
@Component
@ConditionalOnProperty(name = "gha.blob-store.provider", havingValue = "local-fs")
public class LocalFileSystemBlobStorageAdapter implements BlobStoragePort {

    private static final Logger log = LoggerFactory.getLogger(LocalFileSystemBlobStorageAdapter.class);

    private final Path rootDirectory;

    public LocalFileSystemBlobStorageAdapter(
            @Value("${gha.blob-store.base-path:${GHA_BLOB_STORE_PATH:./local-gha-blobs/landing-sections}}") String basePath
    ) {
        this.rootDirectory = Paths.get(basePath).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.rootDirectory);
            log.info("[LOCAL-BLOB-STORE] Initialized local disk blob storage at path: {}", this.rootDirectory);
        } catch (IOException e) {
            log.error("[LOCAL-BLOB-STORE] Failed to create local blob storage directory: {}", this.rootDirectory, e);
            throw new IllegalStateException("Could not initialize local blob storage directory", e);
        }
    }

    @Override
    public StoredBlobResult storeSectionImage(
            LandingCategory category,
            String originalFileName,
            String contentType,
            long sizeBytes,
            InputStream contentStream
    ) {
        String sanitizedName = (originalFileName != null ? originalFileName : "image.jpg")
                .replaceAll("[^a-zA-Z0-9._-]", "_");
        String categoryFolder = category.name().toLowerCase();
        String fileNameWithTimestamp = Instant.now().toEpochMilli() + "_" + sanitizedName;

        try {
            Path categoryDir = this.rootDirectory.resolve(categoryFolder);
            Files.createDirectories(categoryDir);

            Path targetFile = categoryDir.resolve(fileNameWithTimestamp).normalize();
            log.debug("[LOCAL-BLOB-STORE] Writing image to local disk: category={}, file={}, sizeBytes={}",
                    category, targetFile, sizeBytes);

            long bytesWritten = Files.copy(contentStream, targetFile, StandardCopyOption.REPLACE_EXISTING);

            String storedDbPath = targetFile.toString().replace("\\", "/");
            log.info("[LOCAL-BLOB-STORE] Stored blob locally at path='{}' ({} bytes)", storedDbPath, bytesWritten);

            return new StoredBlobResult(storedDbPath, sanitizedName, contentType, bytesWritten);
        } catch (IOException e) {
            log.error("[LOCAL-BLOB-STORE] Error storing image locally for category={}", category, e);
            throw new RuntimeException("Failed to write image to local blob directory", e);
        }
    }

    @Override
    public InputStream readBlobStream(String blobPath) {
        try {
            Path filePath = Paths.get(blobPath).toAbsolutePath().normalize();
            log.debug("[LOCAL-BLOB-STORE] Reading local blob file from path: {}", filePath);
            return new FileInputStream(filePath.toFile());
        } catch (FileNotFoundException e) {
            log.warn("[LOCAL-BLOB-STORE] Local blob file not found at path: {}", blobPath);
            throw new RuntimeException("Blob file not found on local disk: " + blobPath, e);
        }
    }

    @Override
    public void deleteBlob(String blobPath) {
        try {
            Path filePath = Paths.get(blobPath).toAbsolutePath().normalize();
            boolean deleted = Files.deleteIfExists(filePath);
            log.debug("[LOCAL-BLOB-STORE] Deleted local blob path='{}', existed={}", filePath, deleted);
        } catch (IOException e) {
            log.warn("[LOCAL-BLOB-STORE] Failed to delete local blob at path='{}': {}", blobPath, e.getMessage());
        }
    }

    @Override
    public String getConfiguredBasePath() {
        return this.rootDirectory.toString().replace("\\", "/");
    }
}
