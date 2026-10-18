package com.gha.eventservice.api;

import com.gha.eventservice.domain.port.BlobStoragePort;
import com.gha.eventservice.infrastructure.blob.SeaweedFsBlobStorageAdapter;
import com.gha.eventservice.infrastructure.blob.SeaweedFsBlobStorageAdapter.S3ObjectSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Exposes live S3 bucket diagnostics (/api/v1/events/s3/list, /api/v1/events/s3/upload)
 * and blob streaming (/api/v1/events/blobs) so the frontend works seamlessly against
 * both the Node preview server and the Spring Boot microservice.
 */
@RestController
@RequestMapping("/api/v1/events")
public class SeaweedS3DiagnosticsController {

    private static final Logger log = LoggerFactory.getLogger(SeaweedS3DiagnosticsController.class);

    private final BlobStoragePort blobStoragePort;
    private final SeaweedFsBlobStorageAdapter seaweedFsAdapter;

    public SeaweedS3DiagnosticsController(
            BlobStoragePort blobStoragePort,
            @Autowired(required = false) SeaweedFsBlobStorageAdapter seaweedFsAdapter
    ) {
        this.blobStoragePort = blobStoragePort;
        this.seaweedFsAdapter = seaweedFsAdapter;
    }

    @GetMapping("/s3/list")
    public ResponseEntity<Map<String, Object>> listS3BucketObjects() {
        if (seaweedFsAdapter == null) {
            return ResponseEntity.ok(Map.of(
                    "endpoint", "local-fs",
                    "bucket", "gha-files",
                    "cliCommand", "aws --endpoint-url http://127.0.0.1:8333 s3 ls s3://gha-files/ --recursive",
                    "count", 0,
                    "items", Collections.emptyList()
            ));
        }

        try {
            List<S3ObjectSummary> items = seaweedFsAdapter.listS3Objects();
            return ResponseEntity.ok(Map.of(
                    "endpoint", seaweedFsAdapter.getSeaweedS3Url(),
                    "bucket", seaweedFsAdapter.getCollection(),
                    "cliCommand", String.format("aws --endpoint-url http://127.0.0.1:8333 s3 ls s3://%s/ --recursive", seaweedFsAdapter.getCollection()),
                    "count", items.size(),
                    "items", items
            ));
        } catch (Exception e) {
            log.warn("[S3-DIAGNOSTICS] Failed to list S3 bucket objects: {}", e.getMessage());
            return ResponseEntity.status(502).body(Map.of(
                    "error", e.getMessage(),
                    "endpoint", seaweedFsAdapter.getSeaweedS3Url(),
                    "bucket", seaweedFsAdapter.getCollection(),
                    "items", Collections.emptyList()
            ));
        }
    }

    @PostMapping("/s3/upload")
    public ResponseEntity<Map<String, Object>> uploadDirectToS3(@RequestBody Map<String, String> payload) {
        if (seaweedFsAdapter == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "SeaweedFS S3 provider is not active in the current profile"));
        }

        String fileName = payload.getOrDefault("fileName", "upload.jpg");
        String mimeType = payload.getOrDefault("mimeType", "image/jpeg");
        String category = payload.getOrDefault("category", "general");
        String base64Data = payload.get("base64Data");

        if (base64Data == null || base64Data.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "base64Data is required"));
        }

        try {
            String cleanBase64 = base64Data.contains(",")
                    ? base64Data.substring(base64Data.indexOf(",") + 1)
                    : base64Data;
            byte[] fileBytes = Base64.getDecoder().decode(cleanBase64);

            S3ObjectSummary uploaded = seaweedFsAdapter.uploadDirectToS3(category, fileName, mimeType, fileBytes);
            List<S3ObjectSummary> items = seaweedFsAdapter.listS3Objects();

            return ResponseEntity.status(201).body(Map.of(
                    "uploaded", true,
                    "bucket", seaweedFsAdapter.getCollection(),
                    "objectKey", uploaded.key(),
                    "blobPath", uploaded.blobPath(),
                    "s3Url", String.format("%s/%s/%s", seaweedFsAdapter.getSeaweedS3Url(), seaweedFsAdapter.getCollection(), uploaded.key()),
                    "sizeBytes", uploaded.size(),
                    "cliCommand", String.format("aws --endpoint-url http://127.0.0.1:8333 s3 ls s3://%s/ --recursive", seaweedFsAdapter.getCollection()),
                    "items", items
            ));
        } catch (Exception e) {
            log.error("[S3-DIAGNOSTICS] Direct S3 upload failed: {}", e.getMessage());
            return ResponseEntity.status(502).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/blobs")
    public ResponseEntity<InputStreamResource> streamBlob(
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "blobPath", required = false) String blobPath
    ) {
        String resolvedPath = (path != null && !path.isBlank()) ? path : blobPath;
        if (resolvedPath == null || resolvedPath.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        InputStream stream = blobStoragePort.readBlobStream(resolvedPath);
        MediaType mediaType = MediaType.IMAGE_JPEG;
        String lower = resolvedPath.toLowerCase();
        if (lower.endsWith(".png")) {
            mediaType = MediaType.IMAGE_PNG;
        } else if (lower.endsWith(".webp")) {
            mediaType = MediaType.parseMediaType("image/webp");
        } else if (lower.endsWith(".gif")) {
            mediaType = MediaType.IMAGE_GIF;
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .body(new InputStreamResource(stream));
    }
}
