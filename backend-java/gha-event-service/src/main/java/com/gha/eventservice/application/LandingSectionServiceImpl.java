package com.gha.eventservice.application;

import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.model.LandingSectionDocument;
import com.gha.eventservice.domain.model.LandingSectionDocument.SectionAuditHistoryEntry;
import com.gha.eventservice.domain.model.LandingSectionDocument.SectionImageAsset;
import com.gha.eventservice.domain.port.BlobStoragePort;
import com.gha.eventservice.domain.port.LandingSectionServicePort;
import com.gha.eventservice.infrastructure.persistence.LandingSectionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Default implementation of LandingSectionServicePort.
 * Persists documents in MongoDB database "event", collection "landing_sections".
 * Enforces the 4-Card Rule on the Mobile Landing Page (at most 1 published card per category: CME, GSI, AHS, Conference).
 */
@Service
public class LandingSectionServiceImpl implements LandingSectionServicePort {

    private static final Logger log = LoggerFactory.getLogger(LandingSectionServiceImpl.class);

    private final LandingSectionRepository repository;
    private final BlobStoragePort blobStoragePort;
    private final String activeProfile;
    private final String mongoDatabase;

    public LandingSectionServiceImpl(
            LandingSectionRepository repository,
            BlobStoragePort blobStoragePort,
            @Value("${spring.profiles.active:dev}") String activeProfile,
            @Value("${spring.data.mongodb.database:event}") String mongoDatabase
    ) {
        this.repository = repository;
        this.blobStoragePort = blobStoragePort;
        this.activeProfile = activeProfile;
        this.mongoDatabase = mongoDatabase;
        log.info("[GHA-EVENT-SERVICE] Initialized LandingSectionServiceImpl with profile='{}', mongoDb='{}.landing_sections', blobBasePath='{}'",
                activeProfile, mongoDatabase, blobStoragePort.getConfiguredBasePath());
    }

    @EventListener(ApplicationReadyEvent.class)
    public void verifyMongoConnectionAndSeedIfEmpty() {
        try {
            long count = repository.count();
            log.info("[MONGODB-READY] [profile={}] Connected to MongoDB database='{}', collection='landing_sections' (existing documents={})",
                    activeProfile, mongoDatabase, count);
            if (count == 0) {
                log.info("[MONGODB-SEED] Collection '{}.landing_sections' is empty — seeding 4 default category records (CME, GSI, AHS, Conference)...",
                        mongoDatabase);
                String basePath = blobStoragePort.getConfiguredBasePath();
                Instant now = Instant.now();
                List<LandingSectionDocument> initialDocs = List.of(
                        LandingSectionDocument.builder()
                                .category(LandingCategory.CME)
                                .eventYear(2026)
                                .title("National Continuing Medical Education (CME) Accreditation Series 2026")
                                .description("Accredited clinical modules, live case symposiums, and State Medical Council credit-bearing workshops curated for practicing clinicians and post-graduate residents.")
                                .url("https://events.globalhealthacademy.org/cme/2026")
                                .images(List.of(new SectionImageAsset(basePath + "/cme/2026_01_gha_cme_symposium_2026.jpg", "gha_cme_symposium_2026.jpg", "image/jpeg", 284600L)))
                                .imageBlobPath(basePath + "/cme/2026_01_gha_cme_symposium_2026.jpg")
                                .published(true)
                                .history(List.of(new SectionAuditHistoryEntry("PUBLISHED", true, "Seeded initial CME (2026) section in MongoDB(event.landing_sections)", now)))
                                .createdAt(now)
                                .updatedAt(now)
                                .build(),
                        LandingSectionDocument.builder()
                                .category(LandingCategory.GSI)
                                .eventYear(2026)
                                .title("Gastrointestinal Society of India (GSI) Endoscopy & Hepatology Forum 2026")
                                .description("Advanced therapeutic endoscopy live transmissions, hepatobiliary consensus panels, and luminal gastroenterology fellowships hosted across regional chapters.")
                                .url("https://events.globalhealthacademy.org/gsi/2026")
                                .images(List.of(new SectionImageAsset(basePath + "/gsi/2026_01_gha_gsi_summit_2026.jpg", "gha_gsi_summit_2026.jpg", "image/jpeg", 312400L)))
                                .imageBlobPath(basePath + "/gsi/2026_01_gha_gsi_summit_2026.jpg")
                                .published(true)
                                .history(List.of(new SectionAuditHistoryEntry("PUBLISHED", true, "Seeded initial GSI (2026) section in MongoDB(event.landing_sections)", now)))
                                .createdAt(now)
                                .updatedAt(now)
                                .build(),
                        LandingSectionDocument.builder()
                                .category(LandingCategory.AHS)
                                .eventYear(2026)
                                .title("Course / AHS Masterclass & Robotic Surgery Fellowship 2026")
                                .description("Hands-on laparoscopic skill labs, robotic surgery certification tracks, and trauma management courses designed for surgical fellows and senior consultants.")
                                .url("https://events.globalhealthacademy.org/course-ahs/2026")
                                .images(List.of(new SectionImageAsset(basePath + "/ahs/2026_01_gha_ahs_course_2026.jpg", "gha_ahs_course_2026.jpg", "image/jpeg", 298150L)))
                                .imageBlobPath(basePath + "/ahs/2026_01_gha_ahs_course_2026.jpg")
                                .published(true)
                                .history(List.of(new SectionAuditHistoryEntry("PUBLISHED", true, "Seeded initial AHS (2026) section in MongoDB(event.landing_sections)", now)))
                                .createdAt(now)
                                .updatedAt(now)
                                .build(),
                        LandingSectionDocument.builder()
                                .category(LandingCategory.CONFERENCE)
                                .eventYear(2026)
                                .title("GHA Annual International Medical Congress & Scientific Exhibition 2026")
                                .description("Four-day plenary sessions, international keynote lectures, peer-reviewed abstract poster halls, and multi-specialty clinical workshops.")
                                .url("https://events.globalhealthacademy.org/conference/2026")
                                .images(List.of(new SectionImageAsset(basePath + "/conference/2026_01_gha_annual_conference_2026.jpg", "gha_annual_conference_2026.jpg", "image/jpeg", 341900L)))
                                .imageBlobPath(basePath + "/conference/2026_01_gha_annual_conference_2026.jpg")
                                .published(true)
                                .history(List.of(new SectionAuditHistoryEntry("PUBLISHED", true, "Seeded initial Conference (2026) section in MongoDB(event.landing_sections)", now)))
                                .createdAt(now)
                                .updatedAt(now)
                                .build()
                );
                repository.saveAll(initialDocs);
                log.info("[MONGODB-SEED] Successfully seeded {} documents into MongoDB('{}.landing_sections')",
                        initialDocs.size(), mongoDatabase);
            }
        } catch (Exception ex) {
            log.error("[MONGODB-CONNECTION-ERROR] [profile={}] Failed to connect or query MongoDB database='{}', collection='landing_sections': {}",
                    activeProfile, mongoDatabase, ex.getMessage(), ex);
        }
    }

    @Override
    public LandingSectionDocument getSectionById(String id) {
        log.debug("[GHA-EVENT-SERVICE] [profile={}] Fetching section by MongoDB _id='{}' from {}.landing_sections",
                activeProfile, id, mongoDatabase);
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Landing section not found for _id: " + id));
    }

    @Override
    public LandingSectionDocument createSection(UpsertLandingSectionCommand command, List<MultipartFile> imageFiles) {
        log.debug("[GHA-EVENT-SERVICE] [profile={}] Creating landing section (multipart): category={}, year={}, title='{}', published={}",
                activeProfile, command.category(), command.eventYear(), command.title(), command.published());

        List<SectionImageAsset> storedImages = new ArrayList<>();
        if (imageFiles != null) {
            for (MultipartFile file : imageFiles) {
                if (file != null && !file.isEmpty()) {
                    BlobStoragePort.StoredBlobResult res = storeImageInBlobStore(command.category(), file);
                    storedImages.add(new SectionImageAsset(
                            res.blobPath(),
                            res.fileName(),
                            res.contentType(),
                            res.sizeBytes()
                    ));
                }
            }
        }
        return persistNewSectionDocument(command, storedImages);
    }

    @Override
    public LandingSectionDocument createSectionFromJson(
            UpsertLandingSectionCommand command,
            List<Base64ImageUpload> uploadedImages
    ) {
        log.debug("[GHA-EVENT-SERVICE] [profile={}] Creating landing section (JSON): category={}, year={}, title='{}', published={}",
                activeProfile, command.category(), command.eventYear(), command.title(), command.published());

        List<SectionImageAsset> storedImages = storeBase64Images(command.category(), uploadedImages);
        return persistNewSectionDocument(command, storedImages);
    }

    private LandingSectionDocument persistNewSectionDocument(
            UpsertLandingSectionCommand command,
            List<SectionImageAsset> storedImages
    ) {
        if (command.published()) {
            unpublishExistingActiveInCategory(command.category(), null, command.title(), command.eventYear());
        }

        if (storedImages.isEmpty()) {
            String safeName = command.category().name().toLowerCase() + "_default_banner.jpg";
            String defaultPath = blobStoragePort.getConfiguredBasePath() + "/"
                    + command.category().name().toLowerCase() + "/" + System.currentTimeMillis() + "_" + safeName;
            storedImages.add(new SectionImageAsset(defaultPath, safeName, "image/jpeg", 280000L));
        }

        String primaryBlobPath = storedImages.get(0).blobPath();
        Instant now = Instant.now();

        List<SectionAuditHistoryEntry> history = new ArrayList<>();
        history.add(new SectionAuditHistoryEntry(
                "CREATED",
                command.published(),
                String.format("Created %s section (%d) with %d image(s) in %s.landing_sections as %s",
                        command.category(), command.eventYear(), storedImages.size(), mongoDatabase,
                        command.published() ? "Published (Active Category Slot)" : "Unpublished"),
                now
        ));

        LandingSectionDocument document = LandingSectionDocument.builder()
                .category(command.category())
                .eventYear(command.eventYear())
                .title(command.title())
                .description(command.description())
                .url(command.url())
                .images(storedImages)
                .imageBlobPath(primaryBlobPath)
                .published(command.published())
                .history(history)
                .createdAt(now)
                .updatedAt(now)
                .build();

        LandingSectionDocument saved = repository.save(document);
        log.info("[GHA-EVENT-SERVICE] [profile={}] Saved section id='{}' (year={}) to MongoDB({}.landing_sections)",
                activeProfile, saved.getId(), saved.getEventYear(), mongoDatabase);
        return saved;
    }

    @Override
    public LandingSectionDocument updateSection(
            String id,
            UpsertLandingSectionCommand command,
            List<MultipartFile> newImageFiles,
            List<String> retainedBlobPaths
    ) {
        List<SectionImageAsset> newlyStored = new ArrayList<>();
        if (newImageFiles != null) {
            for (MultipartFile file : newImageFiles) {
                if (file != null && !file.isEmpty()) {
                    BlobStoragePort.StoredBlobResult res = storeImageInBlobStore(command.category(), file);
                    newlyStored.add(new SectionImageAsset(
                            res.blobPath(),
                            res.fileName(),
                            res.contentType(),
                            res.sizeBytes()
                    ));
                }
            }
        }
        return applySectionUpdate(id, command, newlyStored, retainedBlobPaths);
    }

    @Override
    public LandingSectionDocument updateSectionFromJson(
            String id,
            UpsertLandingSectionCommand command,
            List<Base64ImageUpload> uploadedImages,
            List<String> retainedBlobPaths
    ) {
        List<SectionImageAsset> newlyStored = storeBase64Images(command.category(), uploadedImages);
        return applySectionUpdate(id, command, newlyStored, retainedBlobPaths);
    }

    private LandingSectionDocument applySectionUpdate(
            String id,
            UpsertLandingSectionCommand command,
            List<SectionImageAsset> newlyStoredImages,
            List<String> retainedBlobPaths
    ) {
        log.debug("[GHA-EVENT-SERVICE] [profile={}] Updating section id='{}' in {}.landing_sections, category={}, year={}, published={}",
                activeProfile, id, mongoDatabase, command.category(), command.eventYear(), command.published());

        LandingSectionDocument existing = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Landing section not found: " + id));

        if (command.published()) {
            unpublishExistingActiveInCategory(command.category(), id, command.title(), command.eventYear());
        }

        List<SectionImageAsset> updatedImages = new ArrayList<>();
        if (existing.getImages() != null && retainedBlobPaths != null) {
            for (SectionImageAsset asset : existing.getImages()) {
                if (retainedBlobPaths.contains(asset.blobPath())) {
                    updatedImages.add(asset);
                } else {
                    blobStoragePort.deleteBlob(asset.blobPath());
                }
            }
        } else if (existing.getImages() != null) {
            updatedImages.addAll(existing.getImages());
        }

        if (newlyStoredImages != null && !newlyStoredImages.isEmpty()) {
            updatedImages.addAll(newlyStoredImages);
        }

        if (updatedImages.isEmpty() && existing.getImages() != null && !existing.getImages().isEmpty()) {
            updatedImages.add(existing.getImages().get(0));
        }

        Instant now = Instant.now();
        List<SectionAuditHistoryEntry> history = existing.getHistory() != null
                ? new ArrayList<>(existing.getHistory())
                : new ArrayList<>();

        history.add(0, new SectionAuditHistoryEntry(
                "UPDATED",
                command.published(),
                String.format("Modified %s section (%d) · %d image(s) · state=%s",
                        command.category(), command.eventYear(), updatedImages.size(),
                        command.published() ? "Published" : "Unpublished"),
                now
        ));

        existing.setCategory(command.category());
        existing.setEventYear(command.eventYear());
        existing.setTitle(command.title());
        existing.setDescription(command.description());
        existing.setUrl(command.url());
        existing.setPublished(command.published());
        existing.setImages(updatedImages);
        existing.setImageBlobPath(updatedImages.isEmpty() ? existing.getImageBlobPath() : updatedImages.get(0).blobPath());
        existing.setHistory(history);
        existing.setUpdatedAt(now);

        LandingSectionDocument saved = repository.save(existing);
        log.info("[GHA-EVENT-SERVICE] [profile={}] Updated section id='{}' in MongoDB({}.landing_sections)",
                activeProfile, saved.getId(), mongoDatabase);
        return saved;
    }

    @Override
    public LandingSectionDocument updatePublishState(String id, boolean published) {
        LandingSectionDocument existing = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Landing section not found: " + id));

        if (published) {
            unpublishExistingActiveInCategory(existing.getCategory(), id, existing.getTitle(), existing.getEventYear());
        }

        Instant now = Instant.now();
        existing.setPublished(published);
        existing.setUpdatedAt(now);

        List<SectionAuditHistoryEntry> history = existing.getHistory() != null
                ? new ArrayList<>(existing.getHistory())
                : new ArrayList<>();
        history.add(0, new SectionAuditHistoryEntry(
                published ? "PUBLISHED" : "UNPUBLISHED",
                published,
                published
                        ? String.format("Published (or Re-Published) %s (%d) record to Mobile App Landing Page (4-card slot)",
                                existing.getCategory(), existing.getEventYear())
                        : "Unpublished record — removed from Mobile App Landing Page",
                now
        ));
        existing.setHistory(history);

        LandingSectionDocument saved = repository.save(existing);
        log.info("[GHA-EVENT-SERVICE] [profile={}] Section id='{}' publish state updated to {} in {}.landing_sections",
                activeProfile, id, published, mongoDatabase);
        return saved;
    }

    /**
     * Enforces the 4-Card Rule: at most 1 active published card per category (CME, GSI, AHS, Conference).
     * Automatically unpublishes any other currently published record in the same category.
     */
    private void unpublishExistingActiveInCategory(
            LandingCategory category,
            String excludeId,
            String newTitle,
            int newYear
    ) {
        List<LandingSectionDocument> currentlyPublished = repository.findByCategoryAndPublishedTrue(category);
        Instant now = Instant.now();
        for (LandingSectionDocument doc : currentlyPublished) {
            if (excludeId != null && excludeId.equals(doc.getId())) {
                continue;
            }
            doc.setPublished(false);
            doc.setUpdatedAt(now);
            List<SectionAuditHistoryEntry> hist = doc.getHistory() != null
                    ? new ArrayList<>(doc.getHistory())
                    : new ArrayList<>();
            hist.add(0, new SectionAuditHistoryEntry(
                    "UNPUBLISHED",
                    false,
                    String.format("Auto-unpublished by 4-Card Rule because %s (%d) \"%s\" was published",
                            category, newYear, newTitle),
                    now
            ));
            doc.setHistory(hist);
            repository.save(doc);
            log.info("[GHA-EVENT-SERVICE] [4-CARD-RULE] Auto-unpublished previous {} record id='{}' ({})",
                    category, doc.getId(), doc.getEventYear());
        }
    }

    @Override
    public Page<LandingSectionDocument> getPaginatedSections(
            Pageable pageable,
            Integer year,
            Boolean published,
            LandingCategory category
    ) {
        if (year != null && published != null) {
            return repository.findByEventYearAndPublishedOrderByUpdatedAtDesc(year, published, pageable);
        }
        if (year != null) {
            return repository.findByEventYearOrderByUpdatedAtDesc(year, pageable);
        }
        if (published != null) {
            return repository.findByPublishedOrderByEventYearDescUpdatedAtDesc(published, pageable);
        }
        return repository.findAllByOrderByEventYearDescUpdatedAtDesc(pageable);
    }

    @Override
    public List<LandingSectionDocument> getAllAdminSections() {
        return repository.findAllByOrderByEventYearDescUpdatedAtDesc();
    }

    @Override
    public List<LandingSectionDocument> getPublishedAppLandingSections(LandingCategory optionalCategory) {
        return (optionalCategory != null)
                ? repository.findByCategoryAndPublishedTrue(optionalCategory)
                : repository.findByPublishedTrueOrderByUpdatedAtDesc();
    }

    @Override
    public void deleteSection(String id) {
        repository.findById(id).ifPresent(doc -> {
            if (doc.getImages() != null) {
                doc.getImages().forEach(img -> blobStoragePort.deleteBlob(img.blobPath()));
            }
            repository.deleteById(id);
            log.info("[GHA-EVENT-SERVICE] [profile={}] Deleted section id='{}' from {}.landing_sections and associated blobs",
                    activeProfile, id, mongoDatabase);
        });
    }

    private List<SectionImageAsset> storeBase64Images(
            LandingCategory category,
            List<Base64ImageUpload> uploadedImages
    ) {
        List<SectionImageAsset> storedImages = new ArrayList<>();
        if (uploadedImages == null) {
            return storedImages;
        }
        for (Base64ImageUpload img : uploadedImages) {
            if (img != null && img.base64Data() != null && !img.base64Data().isBlank()) {
                String rawBase64 = img.base64Data().contains(",")
                        ? img.base64Data().substring(img.base64Data().indexOf(",") + 1)
                        : img.base64Data();
                byte[] bytes = Base64.getDecoder().decode(rawBase64);
                String fileName = (img.fileName() != null && !img.fileName().isBlank())
                        ? img.fileName()
                        : "section-banner.jpg";
                String mimeType = (img.mimeType() != null && !img.mimeType().isBlank())
                        ? img.mimeType()
                        : "image/jpeg";
                BlobStoragePort.StoredBlobResult res = blobStoragePort.storeSectionImage(
                        category,
                        fileName,
                        mimeType,
                        bytes.length,
                        new ByteArrayInputStream(bytes)
                );
                storedImages.add(new SectionImageAsset(
                        res.blobPath(),
                        res.fileName(),
                        res.contentType(),
                        res.sizeBytes()
                ));
            }
        }
        return storedImages;
    }

    private BlobStoragePort.StoredBlobResult storeImageInBlobStore(LandingCategory category, MultipartFile file) {
        try {
            return blobStoragePort.storeSectionImage(
                    category,
                    file.getOriginalFilename() != null ? file.getOriginalFilename() : "section-banner.jpg",
                    file.getContentType(),
                    file.getSize(),
                    file.getInputStream()
            );
        } catch (IOException e) {
            log.error("[BLOB-STORE-ERROR] Failed to store section image in blob store: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to store section image in blob store", e);
        }
    }
}
