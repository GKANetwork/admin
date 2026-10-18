package com.gha.eventservice.infrastructure.blob;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.port.BlobStoragePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SeaweedFS Implementation of BlobStoragePort (Strategy Pattern).
 *
 * Uploads directly to SeaweedFS S3 Gateway (http://103.118.17.94:8333/gha-files/...)
 * using AWS Signature V4 so that all uploaded files are indexed in the 'gha-files'
 * S3 bucket and immediately visible via:
 *   aws --endpoint-url http://127.0.0.1:8333 s3 ls s3://gha-files/ --recursive
 *
 * Includes automatic fallback to Filer (:8888) and Master (:9333).
 */
@Component
@ConditionalOnProperty(name = "gha.blob-store.provider", havingValue = "seaweedfs", matchIfMissing = true)
public class SeaweedFsBlobStorageAdapter implements BlobStoragePort {

    private static final Logger log = LoggerFactory.getLogger(SeaweedFsBlobStorageAdapter.class);
    private static final Pattern FID_PATTERN = Pattern.compile("(\\d+,[0-9a-fA-F]+)");
    private static final DateTimeFormatter AMZ_DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");
    private static final DateTimeFormatter DATE_STAMP_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final String basePath;
    private final String collection;
    private final String seaweedMasterUrl;
    private final String seaweedFilerUrl;
    private final String seaweedS3Url;
    private final String s3AccessKey;
    private final String s3SecretKey;
    private final String s3Region;
    private final RestClient masterClient;
    private final ObjectMapper objectMapper;
    private final Path localReadThroughCacheDir;

    public SeaweedFsBlobStorageAdapter(
            @Value("${gha.blob-store.base-path:${GHA_BLOB_STORE_PATH:/gha-files}}") String basePath,
            @Value("${gha.blob-store.collection:${GHA_BLOB_COLLECTION:gha-files}}") String collection,
            @Value("${gha.blob-store.seaweedfs-master-url:${GHA_SEAWEEDFS_ENDPOINT:http://103.118.17.94:9333}}") String seaweedMasterUrl,
            @Value("${gha.blob-store.seaweedfs-filer-url:${GHA_SEAWEEDFS_FILER_URL:http://127.0.0.1:8888}}") String seaweedFilerUrl,
            @Value("${gha.blob-store.seaweedfs-s3-url:${GHA_SEAWEEDFS_S3_URL:http://103.118.17.94:8333}}") String seaweedS3Url,
            @Value("${gha.blob-store.s3-access-key:${GHA_S3_ACCESS_KEY:admin}}") String s3AccessKey,
            @Value("${gha.blob-store.s3-secret-key:${GHA_S3_SECRET_KEY:qapassw0rd}}") String s3SecretKey,
            @Value("${gha.blob-store.s3-region:${GHA_S3_REGION:us-east-1}}") String s3Region
    ) {
        this.basePath = basePath.endsWith("/") ? basePath.substring(0, basePath.length() - 1) : basePath;
        this.collection = (collection == null || collection.isBlank()) ? "gha-files" : collection.trim();
        this.seaweedMasterUrl = trimTrailingSlash(seaweedMasterUrl);
        this.seaweedFilerUrl = trimTrailingSlash(seaweedFilerUrl);
        this.seaweedS3Url = trimTrailingSlash(seaweedS3Url);
        this.s3AccessKey = s3AccessKey;
        this.s3SecretKey = s3SecretKey;
        this.s3Region = (s3Region == null || s3Region.isBlank()) ? "us-east-1" : s3Region.trim();
        this.masterClient = RestClient.builder().baseUrl(this.seaweedMasterUrl).build();
        this.objectMapper = new ObjectMapper();
        this.localReadThroughCacheDir = Paths.get("./local-gha-blobs/seaweedfs-cache").toAbsolutePath().normalize();

        try {
            Files.createDirectories(this.localReadThroughCacheDir);
        } catch (IOException e) {
            log.warn("[SEAWEEDFS-BLOB-STORE] Could not create local read-through cache dir: {}", e.getMessage());
        }

        log.info("[SEAWEEDFS-BLOB-STORE] Initialized SeaweedFS adapter: bucket='{}', s3Url='{}', masterUrl='{}'",
                this.collection, this.seaweedS3Url, this.seaweedMasterUrl);
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
        String objectKey = String.format("%s/%d_%s", categoryFolder, Instant.now().toEpochMilli(), sanitizedName);

        byte[] fileBytes;
        try {
            fileBytes = contentStream.readAllBytes();
        } catch (IOException e) {
            throw new RuntimeException("Failed to read image upload stream", e);
        }

        String resolvedContentType = contentType != null ? contentType : "image/jpeg";

        // 1. Upload via S3 Gateway (:8333) with AWS SigV4 so `aws s3 ls s3://gha-files/ --recursive` lists the file
        boolean indexedInBucket = tryUploadViaS3OrFiler(objectKey, sanitizedName, resolvedContentType, fileBytes);

        // 2. Fallback to Master (:9333/submit?collection=gha-files) if S3/Filer is unreachable
        String assignedFid = null;
        if (!indexedInBucket) {
            assignedFid = tryUploadViaMaster(sanitizedName, resolvedContentType, fileBytes);
        }

        String targetBlobPath;
        if (indexedInBucket) {
            targetBlobPath = String.format("%s/%s", this.basePath, objectKey);
        } else if (assignedFid != null && !assignedFid.isBlank()) {
            targetBlobPath = String.format("%s/%s/%s_%s", this.basePath, categoryFolder, assignedFid, sanitizedName);
        } else {
            targetBlobPath = String.format("%s/%s", this.basePath, objectKey);
        }

        cacheBlobLocally(targetBlobPath, fileBytes);

        log.info("[SEAWEEDFS-BLOB-STORE] Stored blob: bucket='{}', s3Indexed={}, masterFid='{}', blobPath='{}'",
                this.collection, indexedInBucket, assignedFid, targetBlobPath);

        return new StoredBlobResult(targetBlobPath, sanitizedName, resolvedContentType, fileBytes.length);
    }

    /**
     * Uploads to SeaweedFS S3 Gateway (:8333) using AWS Signature V4 (or Filer :8888 as fallback)
     * so that `aws --endpoint-url http://127.0.0.1:8333 s3 ls s3://gha-files/ --recursive` lists the file.
     */
    private boolean tryUploadViaS3OrFiler(String objectKey, String fileName, String contentType, byte[] fileBytes) {
        List<String> s3Candidates = List.of(
                this.seaweedS3Url,
                this.seaweedMasterUrl.replace(":9333", ":8333")
        );

        for (String s3Base : s3Candidates) {
            if (s3Base == null || s3Base.isBlank() || s3Base.endsWith(":9333")) {
                continue;
            }
            String s3ObjectUri = String.format("%s/%s/%s", s3Base, this.collection, objectKey);
            try {
                executeSignedS3Request("PUT", s3ObjectUri, contentType, fileBytes);
                log.info("[SEAWEEDFS-BLOB-STORE] Uploaded to S3 bucket '{}' via {}", this.collection, s3ObjectUri);
                return true;
            } catch (Exception e) {
                log.debug("[SEAWEEDFS-BLOB-STORE] Signed S3 PUT to {} failed: {}", s3ObjectUri, e.getMessage());
            }
        }

        // Fallback: Filer `/buckets/{collection}/{objectKey}` if running locally on same container network
        if (this.seaweedFilerUrl != null && !this.seaweedFilerUrl.isBlank()) {
            String filerBucketUri = String.format("%s/buckets/%s/%s?collection=%s",
                    this.seaweedFilerUrl, this.collection, objectKey, this.collection);
            try {
                MultipartBodyBuilder bodyBuilder = new MultipartBodyBuilder();
                bodyBuilder.part("file", new ByteArrayResource(fileBytes) {
                            @Override
                            public String getFilename() {
                                return fileName;
                            }
                        })
                        .filename(fileName)
                        .contentType(MediaType.parseMediaType(contentType));

                RestClient.create().post()
                        .uri(filerBucketUri)
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(bodyBuilder.build())
                        .retrieve()
                        .toBodilessEntity();

                log.info("[SEAWEEDFS-BLOB-STORE] Uploaded to Filer bucket via {}", filerBucketUri);
                return true;
            } catch (Exception e) {
                log.debug("[SEAWEEDFS-BLOB-STORE] Filer upload to {} not reachable: {}", filerBucketUri, e.getMessage());
            }
        }

        return false;
    }

    private byte[] executeSignedS3Request(String method, String fullUrl, String contentType, byte[] payload) throws Exception {
        URI uri = URI.create(fullUrl);
        String host = uri.getPort() > 0 ? uri.getHost() + ":" + uri.getPort() : uri.getHost();
        String canonicalUri = uri.getRawPath();

        ZonedDateTime now = ZonedDateTime.now(ZoneOffset.UTC);
        String amzDate = AMZ_DATE_FORMAT.format(now);
        String dateStamp = DATE_STAMP_FORMAT.format(now);

        byte[] bodyBytes = payload != null ? payload : new byte[0];
        String payloadHash = sha256Hex(bodyBytes);

        String canonicalHeaders = "host:" + host + "\n"
                + "x-amz-content-sha256:" + payloadHash + "\n"
                + "x-amz-date:" + amzDate + "\n";
        String signedHeaders = "host;x-amz-content-sha256;x-amz-date";

        String canonicalRequest = method + "\n"
                + canonicalUri + "\n"
                + "\n"
                + canonicalHeaders + "\n"
                + signedHeaders + "\n"
                + payloadHash;

        String credentialScope = dateStamp + "/" + this.s3Region + "/s3/aws4_request";
        String stringToSign = "AWS4-HMAC-SHA256\n"
                + amzDate + "\n"
                + credentialScope + "\n"
                + sha256Hex(canonicalRequest.getBytes(StandardCharsets.UTF_8));

        byte[] signingKey = getSignatureKey(this.s3SecretKey, dateStamp, this.s3Region, "s3");
        String signature = HexFormat.of().formatHex(hmacSha256(signingKey, stringToSign));

        String authorizationHeader = "AWS4-HMAC-SHA256 "
                + "Credential=" + this.s3AccessKey + "/" + credentialScope + ", "
                + "SignedHeaders=" + signedHeaders + ", "
                + "Signature=" + signature;

        if ("PUT".equalsIgnoreCase(method)) {
            RestClient.create().put()
                    .uri(uri)
                    .header("Host", host)
                    .header("x-amz-date", amzDate)
                    .header("x-amz-content-sha256", payloadHash)
                    .header("Authorization", authorizationHeader)
                    .contentType(MediaType.parseMediaType(contentType != null ? contentType : "application/octet-stream"))
                    .body(bodyBytes)
                    .retrieve()
                    .toBodilessEntity();
            return new byte[0];
        } else if ("DELETE".equalsIgnoreCase(method)) {
            RestClient.create().delete()
                    .uri(uri)
                    .header("Host", host)
                    .header("x-amz-date", amzDate)
                    .header("x-amz-content-sha256", payloadHash)
                    .header("Authorization", authorizationHeader)
                    .retrieve()
                    .toBodilessEntity();
            return new byte[0];
        } else {
            return RestClient.create().get()
                    .uri(uri)
                    .header("Host", host)
                    .header("x-amz-date", amzDate)
                    .header("x-amz-content-sha256", payloadHash)
                    .header("Authorization", authorizationHeader)
                    .retrieve()
                    .body(byte[].class);
        }
    }

    private String tryUploadViaMaster(String sanitizedName, String contentType, byte[] fileBytes) {
        String submitUri = "/submit?collection=" + this.collection;
        try {
            MultipartBodyBuilder bodyBuilder = new MultipartBodyBuilder();
            bodyBuilder.part("file", new ByteArrayResource(fileBytes) {
                        @Override
                        public String getFilename() {
                            return sanitizedName;
                        }
                    })
                    .filename(sanitizedName)
                    .contentType(MediaType.parseMediaType(contentType));

            String responseJson = masterClient.post()
                    .uri(submitUri)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(bodyBuilder.build())
                    .retrieve()
                    .body(String.class);

            if (responseJson != null) {
                JsonNode root = objectMapper.readTree(responseJson);
                if (root.hasNonNull("fid")) {
                    return root.get("fid").asText();
                }
            }
        } catch (Exception e) {
            log.warn("[SEAWEEDFS-BLOB-STORE] Master /submit call failed ({})", e.getMessage());
        }
        return null;
    }

    @Override
    public InputStream readBlobStream(String blobPath) {
        log.debug("[SEAWEEDFS-BLOB-STORE] Reading blob stream for blobPath='{}'", blobPath);

        // 1. Check local read-through cache first
        Path cachedFile = resolveLocalCacheFile(blobPath);
        if (Files.exists(cachedFile)) {
            try {
                return new FileInputStream(cachedFile.toFile());
            } catch (IOException ignored) {
            }
        }

        // 2. Read from S3 Gateway (:8333) with AWS SigV4
        String relativeKey = blobPath.startsWith(this.basePath + "/")
                ? blobPath.substring((this.basePath + "/").length())
                : blobPath.replaceFirst("^/+", "");

        try {
            String s3ObjectUri = String.format("%s/%s/%s", this.seaweedS3Url, this.collection, relativeKey);
            byte[] bytes = executeSignedS3Request("GET", s3ObjectUri, null, null);
            if (bytes != null && bytes.length > 0) {
                cacheBlobLocally(blobPath, bytes);
                return new ByteArrayInputStream(bytes);
            }
        } catch (Exception ignored) {
        }

        // 3. Fallback: Extract fid (e.g., "2,0bdc16527c") and fetch from Volume Server
        String fid = extractFid(blobPath);
        if (fid != null) {
            try {
                String volumeId = fid.split(",")[0];
                String lookupJson = masterClient.get()
                        .uri("/dir/lookup?volumeId=" + volumeId + "&collection=" + this.collection)
                        .retrieve()
                        .body(String.class);

                if (lookupJson != null) {
                    JsonNode root = objectMapper.readTree(lookupJson);
                    JsonNode locations = root.get("locations");
                    if (locations != null && locations.isArray() && !locations.isEmpty()) {
                        String volumeUrl = locations.get(0).get("publicUrl").asText();
                        String fullVolumeEndpoint = (volumeUrl.startsWith("http") ? volumeUrl : "http://" + volumeUrl) + "/" + fid;
                        byte[] bytes = RestClient.create().get()
                                .uri(fullVolumeEndpoint)
                                .retrieve()
                                .body(byte[].class);
                        if (bytes != null && bytes.length > 0) {
                            cacheBlobLocally(blobPath, bytes);
                            return new ByteArrayInputStream(bytes);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[SEAWEEDFS-BLOB-STORE] Could not read fid='{}' from volume server: {}", fid, e.getMessage());
            }
        }

        return new ByteArrayInputStream(new byte[0]);
    }

    @Override
    public void deleteBlob(String blobPath) {
        log.debug("[SEAWEEDFS-BLOB-STORE] Deleting blob path='{}'", blobPath);
        try {
            Files.deleteIfExists(resolveLocalCacheFile(blobPath));
        } catch (IOException ignored) {
        }

        String relativeKey = blobPath.startsWith(this.basePath + "/")
                ? blobPath.substring((this.basePath + "/").length())
                : blobPath.replaceFirst("^/+", "");

        try {
            String s3ObjectUri = String.format("%s/%s/%s", this.seaweedS3Url, this.collection, relativeKey);
            executeSignedS3Request("DELETE", s3ObjectUri, null, null);
        } catch (Exception ignored) {
        }

        String fid = extractFid(blobPath);
        if (fid != null) {
            try {
                masterClient.delete()
                        .uri("/" + fid)
                        .retrieve()
                        .toBodilessEntity();
            } catch (Exception e) {
                log.debug("[SEAWEEDFS-BLOB-STORE] Remote delete skipped for fid='{}': {}", fid, e.getMessage());
            }
        }
    }

    @Override
    public String getConfiguredBasePath() {
        return this.basePath;
    }

    public record S3ObjectSummary(
            String key,
            String lastModified,
            String eTag,
            long size,
            String storageClass,
            String blobPath
    ) {}

    public String getSeaweedS3Url() {
        return this.seaweedS3Url;
    }

    public String getCollection() {
        return this.collection;
    }

    /**
     * Lists all objects currently indexed inside s3://gha-files/ via AWS Signature V4 GET.
     */
    public List<S3ObjectSummary> listS3Objects() throws Exception {
        String s3BucketUri = String.format("%s/%s/", this.seaweedS3Url, this.collection);
        byte[] xmlBytes = executeSignedS3Request("GET", s3BucketUri, null, null);
        String xml = xmlBytes != null ? new String(xmlBytes, StandardCharsets.UTF_8) : "";

        java.util.ArrayList<S3ObjectSummary> items = new java.util.ArrayList<>();
        Pattern contentsPattern = Pattern.compile("<Contents>([\\s\\S]*?)</Contents>");
        Matcher matcher = contentsPattern.matcher(xml);
        while (matcher.find()) {
            String block = matcher.group(1);
            String key = extractXmlTag(block, "Key");
            String lastModified = extractXmlTag(block, "LastModified");
            String eTag = extractXmlTag(block, "ETag").replace("\"", "");
            long size = 0L;
            try {
                size = Long.parseLong(extractXmlTag(block, "Size"));
            } catch (NumberFormatException ignored) {
            }
            String storageClass = extractXmlTag(block, "StorageClass");
            if (!key.isBlank()) {
                items.add(new S3ObjectSummary(
                        key,
                        lastModified,
                        eTag,
                        size,
                        storageClass.isBlank() ? "STANDARD" : storageClass,
                        this.basePath + "/" + key
                ));
            }
        }
        return items;
    }

    /**
     * Directly uploads a file to s3://gha-files/{category}/{timestamp}_{fileName} via AWS SigV4 PUT.
     */
    public S3ObjectSummary uploadDirectToS3(String category, String originalFileName, String contentType, byte[] fileBytes) throws Exception {
        String sanitizedName = (originalFileName != null ? originalFileName : "upload.bin")
                .replaceAll("[^a-zA-Z0-9._-]", "_");
        String folder = (category != null && !category.isBlank())
                ? category.trim().toLowerCase().replaceAll("[^a-z0-9_-]", "")
                : "general";
        String objectKey = String.format("%s/%d_%s", folder, Instant.now().toEpochMilli(), sanitizedName);
        String s3ObjectUri = String.format("%s/%s/%s", this.seaweedS3Url, this.collection, objectKey);

        executeSignedS3Request("PUT", s3ObjectUri, contentType != null ? contentType : "application/octet-stream", fileBytes);
        String targetBlobPath = String.format("%s/%s", this.basePath, objectKey);
        cacheBlobLocally(targetBlobPath, fileBytes);

        return new S3ObjectSummary(
                objectKey,
                Instant.now().toString(),
                "",
                fileBytes.length,
                "STANDARD",
                targetBlobPath
        );
    }

    private static String extractXmlTag(String xmlBlock, String tagName) {
        Pattern p = Pattern.compile("<" + tagName + ">([\\s\\S]*?)</" + tagName + ">");
        Matcher m = p.matcher(xmlBlock);
        return m.find() ? m.group(1).trim() : "";
    }

    private static String sha256Hex(byte[] data) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(md.digest(data));
    }

    private static byte[] hmacSha256(byte[] key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] getSignatureKey(String secretKey, String dateStamp, String regionName, String serviceName) throws Exception {
        byte[] kSecret = ("AWS4" + secretKey).getBytes(StandardCharsets.UTF_8);
        byte[] kDate = hmacSha256(kSecret, dateStamp);
        byte[] kRegion = hmacSha256(kDate, regionName);
        byte[] kService = hmacSha256(kRegion, serviceName);
        return hmacSha256(kService, "aws4_request");
    }

    private String extractFid(String blobPath) {
        if (blobPath == null) {
            return null;
        }
        Matcher matcher = FID_PATTERN.matcher(blobPath);
        return matcher.find() ? matcher.group(1) : null;
    }

    private Path resolveLocalCacheFile(String blobPath) {
        String safeKey = blobPath.replaceAll("[^a-zA-Z0-9._-]", "_");
        return this.localReadThroughCacheDir.resolve(safeKey);
    }

    private void cacheBlobLocally(String blobPath, byte[] bytes) {
        try {
            Files.write(resolveLocalCacheFile(blobPath), bytes);
        } catch (IOException e) {
            log.debug("[SEAWEEDFS-BLOB-STORE] Could not write local cache file: {}", e.getMessage());
        }
    }

    private static String trimTrailingSlash(String url) {
        if (url == null) {
            return "";
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
