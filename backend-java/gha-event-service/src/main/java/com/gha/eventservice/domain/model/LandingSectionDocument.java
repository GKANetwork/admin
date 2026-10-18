package com.gha.eventservice.domain.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * MongoDB Document stored in database: "event", collection: "landing_sections".
 * Supports multiple images per vertical/category, optional redirect URL for in-app browser,
 * year-wise filtering across 1,000+ historical records, and publish/modification history.
 * Enforces max 4 published cards on Mobile Landing Page (1 active published record per category).
 */
@Document(collection = "landing_sections")
@CompoundIndexes({
    @CompoundIndex(name = "idx_year_updated", def = "{'event_year': -1, 'updated_at': -1}"),
    @CompoundIndex(name = "idx_category_published", def = "{'category': 1, 'published': 1}")
})
public class LandingSectionDocument {

    public record SectionImageAsset(
        @Field("blob_path") String blobPath,
        @Field("file_name") String fileName,
        @Field("mime_type") String mimeType,
        @Field("size_bytes") long sizeBytes
    ) {
        public String getPreviewUrl() {
            if (blobPath == null || blobPath.isBlank()) {
                return "";
            }
            return "/api/v1/events/blobs?path=" + java.net.URLEncoder.encode(blobPath, java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    public record SectionAuditHistoryEntry(
        @Field("action") String action, // CREATED, UPDATED, PUBLISHED, UNPUBLISHED
        @Field("published_state") boolean publishedState,
        @Field("summary") String summary,
        @Field("timestamp") Instant timestamp
    ) {}

    @Id
    private String id;

    @Indexed
    @Field("category")
    private LandingCategory category;

    @Indexed
    @Field("event_year")
    private int eventYear;

    @Field("title")
    private String title;

    @Field("description")
    private String description;

    /**
     * Optional target redirect URL opened in the Mobile In-App Browser when the user taps the section image.
     */
    @Field("url")
    private String url;

    @Field("images")
    private List<SectionImageAsset> images = new ArrayList<>();

    @Field("image_blob_path")
    private String imageBlobPath;

    @Indexed
    @Field("published")
    private boolean published;

    @Field("history")
    private List<SectionAuditHistoryEntry> history = new ArrayList<>();

    @Field("created_at")
    private Instant createdAt;

    @Field("updated_at")
    private Instant updatedAt;

    public LandingSectionDocument() {
    }

    private LandingSectionDocument(Builder builder) {
        this.id = builder.id;
        this.category = builder.category;
        this.eventYear = builder.eventYear;
        this.title = builder.title;
        this.description = builder.description;
        this.url = builder.url;
        this.images = builder.images != null ? builder.images : new ArrayList<>();
        this.imageBlobPath = builder.imageBlobPath;
        this.published = builder.published;
        this.history = builder.history != null ? builder.history : new ArrayList<>();
        this.createdAt = builder.createdAt;
        this.updatedAt = builder.updatedAt;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String id;
        private LandingCategory category;
        private int eventYear = java.time.Year.now().getValue();
        private String title;
        private String description;
        private String url;
        private List<SectionImageAsset> images = new ArrayList<>();
        private String imageBlobPath;
        private boolean published;
        private List<SectionAuditHistoryEntry> history = new ArrayList<>();
        private Instant createdAt = Instant.now();
        private Instant updatedAt = Instant.now();

        public Builder id(String id) { this.id = id; return this; }
        public Builder category(LandingCategory category) { this.category = category; return this; }
        public Builder eventYear(int eventYear) { this.eventYear = eventYear; return this; }
        public Builder title(String title) { this.title = title; return this; }
        public Builder description(String description) { this.description = description; return this; }
        public Builder url(String url) { this.url = url; return this; }
        public Builder images(List<SectionImageAsset> images) { this.images = images; return this; }
        public Builder imageBlobPath(String imageBlobPath) { this.imageBlobPath = imageBlobPath; return this; }
        public Builder published(boolean published) { this.published = published; return this; }
        public Builder history(List<SectionAuditHistoryEntry> history) { this.history = history; return this; }
        public Builder createdAt(Instant createdAt) { this.createdAt = createdAt; return this; }
        public Builder updatedAt(Instant updatedAt) { this.updatedAt = updatedAt; return this; }

        public LandingSectionDocument build() {
            return new LandingSectionDocument(this);
        }
    }

    public String getId() { return id; }
    public LandingCategory getCategory() { return category; }
    public void setCategory(LandingCategory category) { this.category = category; }
    public int getEventYear() { return eventYear; }
    public void setEventYear(int eventYear) { this.eventYear = eventYear; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public List<SectionImageAsset> getImages() { return images; }
    public void setImages(List<SectionImageAsset> images) { this.images = images; }
    public String getImageBlobPath() { return imageBlobPath; }
    public void setImageBlobPath(String imageBlobPath) { this.imageBlobPath = imageBlobPath; }
    public String getImagePreviewUrl() {
        if (images != null && !images.isEmpty()) {
            return images.get(0).getPreviewUrl();
        }
        if (imageBlobPath != null && !imageBlobPath.isBlank()) {
            return "/api/v1/events/blobs?path=" + java.net.URLEncoder.encode(imageBlobPath, java.nio.charset.StandardCharsets.UTF_8);
        }
        return "";
    }
    public String getImageFileName() {
        return (images != null && !images.isEmpty()) ? images.get(0).fileName() : "section_banner.jpg";
    }
    public String getImageMimeType() {
        return (images != null && !images.isEmpty()) ? images.get(0).mimeType() : "image/jpeg";
    }
    public long getImageSizeBytes() {
        return (images != null && !images.isEmpty()) ? images.get(0).sizeBytes() : 0L;
    }
    public boolean isPublished() { return published; }
    public void setPublished(boolean published) { this.published = published; }
    public List<SectionAuditHistoryEntry> getHistory() { return history; }
    public void setHistory(List<SectionAuditHistoryEntry> history) { this.history = history; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
