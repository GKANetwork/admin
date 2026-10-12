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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Default implementation of LandingSectionServicePort.
 * Enforces the 4-Card Rule on the Mobile Landing Page (at most 1 published card per category: CME, GSI, AHS, Conference).
 * When a new or historical record in a category is published/re-published, any previously published record
 * in that same category is automatically unpublished with an audit history entry.
 */
@Service
public class LandingSectionServiceImpl implements LandingSectionServicePort {

    private static final Logger log = LoggerFactory.getLogger(LandingSectionServiceImpl.class);

    private final LandingSectionRepository repository;
    private final BlobStoragePort blobStoragePort;
    private final String activeProfile;

    public LandingSectionServiceImpl(
            LandingSectionRepository repository,
            BlobStoragePort blobStoragePort,
            @Value("${spring.profiles.active:dev}") String activeProfile
    ) {
        this.repository = repository;
        this.blobStoragePort = blobStoragePort;
        this.activeProfile = activeProfile;
        log.info("[GHA-EVENT-SERVICE] Initialized LandingSectionServiceImpl with profile='{}', blobBasePath='{}'",
                activeProfile, blobStoragePort.getConfiguredBasePath());
    }

    @Override
    public LandingSectionDocument getSectionById(String id) {
        log.debug("[GHA-EVENT-SERVICE] [profile={}] Fetching section by MongoDB _id='{}'", activeProfile, id);
        return repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Landing section not found for _id: " + id));
    }

    @Override
    public LandingSectionDocument createSection(UpsertLandingSectionCommand command, List<MultipartFile> imageFiles) {
        log.debug("[GHA-EVENT-SERVICE] [profile={}] Creating landing section: category={}, year={}, title='{}', published={}",
                activeProfile, command.category(), command.eventYear(), command.title(), command.published());

        if (command.published()) {
            unpublishExistingActiveInCategory(command.category(), null, command.title(), command.eventYear());
        }

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

        String primaryBlobPath = storedImages.isEmpty() ? null : storedImages.get(0).blobPath();
        Instant now = Instant.now();

        List<SectionAuditHistoryEntry> history = new ArrayList<>();
        history.add(new SectionAuditHistoryEntry(
                "CREATED",
                command.published(),
                String.format("Created %s section (%d) with %d image(s) as %s",
                        command.category(), command.eventYear(), storedImages.size(),
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
        log.info("[GHA-EVENT-SERVICE] [profile={}] Saved section id='{}' (year={}) to MongoDB(event_db)",
                activeProfile, saved.getId(), saved.getEventYear());
        return saved;
    }

    @Override
    public LandingSectionDocument updateSection(
            String id,
            UpsertLandingSectionCommand command,
            List<MultipartFile> newImageFiles,
            List<String> retainedBlobPaths
    ) {
        log.debug("[GHA-EVENT-SERVICE] [profile={}] Updating section id='{}', category={}, year={}, published={}",
                activeProfile, id, command.category(), command.eventYear(), command.published());

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

        if (newImageFiles != null) {
            for (MultipartFile file : newImageFiles) {
                if (file != null && !file.isEmpty()) {
                    BlobStoragePort.StoredBlobResult res = storeImageInBlobStore(command.category(), file);
                    updatedImages.add(new SectionImageAsset(
                            res.blobPath(),
                            res.fileName(),
                            res.contentType(),
                            res.sizeBytes()
                    ));
                }
            }
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
        log.info("[GHA-EVENT-SERVICE] [profile={}] Updated section id='{}' in event_db", activeProfile, saved.getId());
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
        log.info("[GHA-EVENT-SERVICE] [profile={}] Section id='{}' publish state updated to {}",
                activeProfile, id, published);
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
            log.info("[GHA-EVENT-SERVICE] [profile={}] Deleted section id='{}' and associated blobs", activeProfile, id);
        });
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
            throw new RuntimeException("Failed to store section image in blob store", e);
        }
    }
}
