package com.gha.eventservice.api;

import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.model.LandingSectionDocument;
import com.gha.eventservice.domain.port.LandingSectionServicePort;
import com.gha.eventservice.domain.port.LandingSectionServicePort.UpsertLandingSectionCommand;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST Controller exposed by GHA Event Service behind GHA Spring Cloud Gateway (/api/v1/events/**).
 * Supports paginated history listing (size=10), year-wise filtering, view/edit/delete, and multi-image uploads.
 */
@RestController
@RequestMapping("/api/v1/events/landing-sections")
public class LandingSectionController {

    private static final Logger log = LoggerFactory.getLogger(LandingSectionController.class);

    private final LandingSectionServicePort landingSectionService;

    public LandingSectionController(LandingSectionServicePort landingSectionService) {
        this.landingSectionService = landingSectionService;
    }

    /**
     * Paginated Listing endpoint (default size = 10) with optional year and publish-state filter.
     */
    @GetMapping("/listing")
    public ResponseEntity<Page<LandingSectionDocument>> getPaginatedListing(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "10") int size,
            @RequestParam(name = "year", required = false) Integer year,
            @RequestParam(name = "published", required = false) Boolean published,
            @RequestParam(name = "category", required = false) LandingCategory category,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.debug("[CONTROLLER] GET /api/v1/events/landing-sections/listing?page={}&size={}&year={}&published={}&category={}",
                page, size, year, published, category);
        return ResponseEntity.ok(
                landingSectionService.getPaginatedSections(PageRequest.of(page, size), year, published, category)
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<LandingSectionDocument> getSectionById(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.debug("[CONTROLLER] GET /api/v1/events/landing-sections/{} (lookup by MongoDB _id)", id);
        return ResponseEntity.ok(landingSectionService.getSectionById(id));
    }

    @GetMapping("/admin")
    public ResponseEntity<List<LandingSectionDocument>> getAllSectionsForAdmin(
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.debug("[CONTROLLER] GET /api/v1/events/landing-sections/admin invoked");
        return ResponseEntity.ok(landingSectionService.getAllAdminSections());
    }

    @GetMapping("/published")
    public ResponseEntity<List<LandingSectionDocument>> getPublishedSectionsForMobileApp(
            @RequestParam(name = "category", required = false) LandingCategory category,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.debug("[CONTROLLER] GET /api/v1/events/landing-sections/published?category={}", category);
        return ResponseEntity.ok(landingSectionService.getPublishedAppLandingSections(category));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<LandingSectionDocument> createSection(
            @RequestParam("category") LandingCategory category,
            @RequestParam(name = "eventYear", defaultValue = "2026") int eventYear,
            @RequestParam("title") String title,
            @RequestParam("description") String description,
            @RequestParam(name = "url", required = false, defaultValue = "") String url,
            @RequestParam(name = "published", defaultValue = "true") boolean published,
            @RequestPart("images") List<MultipartFile> imageFiles,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.info("[CONTROLLER] POST /api/v1/events/landing-sections: category={}, year={}, url={}, imageCount={}, published={}",
                category, eventYear, url, imageFiles != null ? imageFiles.size() : 0, published);

        UpsertLandingSectionCommand command = new UpsertLandingSectionCommand(
                category, eventYear, title, description, url, published
        );
        return ResponseEntity.ok(landingSectionService.createSection(command, imageFiles));
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<LandingSectionDocument> updateSection(
            @PathVariable("id") String id,
            @RequestParam("category") LandingCategory category,
            @RequestParam(name = "eventYear", defaultValue = "2026") int eventYear,
            @RequestParam("title") String title,
            @RequestParam("description") String description,
            @RequestParam(name = "url", required = false, defaultValue = "") String url,
            @RequestParam("published") boolean published,
            @RequestParam(name = "retainedBlobPaths", required = false) List<String> retainedBlobPaths,
            @RequestPart(name = "images", required = false) List<MultipartFile> newImageFiles,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.info("[CONTROLLER] PUT /api/v1/events/landing-sections/{}: category={}, year={}, url={}, newImages={}",
                id, category, eventYear, url, newImageFiles != null ? newImageFiles.size() : 0);

        UpsertLandingSectionCommand command = new UpsertLandingSectionCommand(
                category, eventYear, title, description, url, published
        );
        return ResponseEntity.ok(
                landingSectionService.updateSection(id, command, newImageFiles, retainedBlobPaths)
        );
    }

    @PatchMapping("/{id}/publish")
    public ResponseEntity<LandingSectionDocument> togglePublishState(
            @PathVariable("id") String id,
            @RequestBody Map<String, Boolean> payload,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        boolean published = Boolean.TRUE.equals(payload.get("published"));
        log.info("[CONTROLLER] PATCH /api/v1/events/landing-sections/{}/publish -> published={}", id, published);
        return ResponseEntity.ok(landingSectionService.updatePublishState(id, published));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSection(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.info("[CONTROLLER] DELETE /api/v1/events/landing-sections/{}", id);
        landingSectionService.deleteSection(id);
        return ResponseEntity.noContent().build();
    }

    private void bindCorrelationId(String correlationId) {
        MDC.put("correlationId", (correlationId != null && !correlationId.isBlank())
                ? correlationId
                : "gha-" + UUID.randomUUID().toString().substring(0, 8));
    }
}
