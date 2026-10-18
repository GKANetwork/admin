package com.gha.eventservice.api;

import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.model.LandingSectionDocument;
import com.gha.eventservice.domain.port.LandingSectionServicePort;
import com.gha.eventservice.domain.port.LandingSectionServicePort.Base64ImageUpload;
import com.gha.eventservice.domain.port.LandingSectionServicePort.UpsertLandingSectionCommand;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
import java.util.stream.Collectors;

/**
 * REST Controller exposed by GHA Event Service behind GHA Spring Cloud Gateway (/api/v1/events/**).
 * Supports both JSON (used by Admin UI) and Multipart Form Data for creating/updating sections in MongoDB (event.landing_sections).
 */
@RestController
@RequestMapping("/api/v1/events/landing-sections")
@CrossOrigin(origins = "*")
public class LandingSectionController {

    private static final Logger log = LoggerFactory.getLogger(LandingSectionController.class);

    private final LandingSectionServicePort landingSectionService;

    public LandingSectionController(LandingSectionServicePort landingSectionService) {
        this.landingSectionService = landingSectionService;
    }

    public record RetainedImageDto(
            String blobPath,
            String previewUrl,
            String fileName,
            String mimeType,
            long sizeBytes
    ) {}

    public record JsonUpsertLandingSectionRequest(
            LandingCategory category,
            Integer eventYear,
            String title,
            String description,
            String url,
            Boolean published,
            List<RetainedImageDto> retainedImages,
            List<Base64ImageUpload> uploadedImages
    ) {}

    /**
     * Paginated Listing endpoint (default size = 10) with optional year and publish-state filter.
     * Returns content, page, size, totalElements, totalPages, and availableYears.
     */
    @GetMapping("/listing")
    public ResponseEntity<Map<String, Object>> getPaginatedListing(
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
        Page<LandingSectionDocument> springPage =
                landingSectionService.getPaginatedSections(PageRequest.of(page, size), year, published, category);

        Set<Integer> years = new TreeSet<>(Comparator.reverseOrder());
        years.addAll(List.of(2026, 2025, 2024, 2023));
        landingSectionService.getAllAdminSections().forEach(d -> years.add(d.getEventYear()));

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("content", springPage.getContent());
        response.put("page", springPage.getNumber());
        response.put("size", springPage.getSize());
        response.put("totalElements", springPage.getTotalElements());
        response.put("totalPages", Math.max(1, springPage.getTotalPages()));
        response.put("availableYears", new ArrayList<>(years));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<LandingSectionDocument> getSectionById(
            @PathVariable("id") String id,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.debug("[CONTROLLER] GET /api/v1/events/landing-sections/{} (lookup by MongoDB _id in event.landing_sections)", id);
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

    /**
     * JSON Create Endpoint (invoked by Desktop Admin UI).
     */
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<LandingSectionDocument> createSectionJson(
            @RequestBody JsonUpsertLandingSectionRequest body,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        LandingCategory category = body.category() != null ? body.category() : LandingCategory.CME;
        int eventYear = body.eventYear() != null ? body.eventYear() : 2026;
        String title = (body.title() != null && !body.title().isBlank())
                ? body.title().trim()
                : category.name() + " Clinical Section (" + eventYear + ")";
        String description = body.description() != null ? body.description().trim() : "";
        String url = body.url() != null ? body.url().trim() : "";
        boolean published = body.published() == null || body.published();

        log.info("[CONTROLLER-JSON] POST /api/v1/events/landing-sections -> MongoDB(event.landing_sections): category={}, year={}, url={}, imageCount={}, published={}",
                category, eventYear, url, body.uploadedImages() != null ? body.uploadedImages().size() : 0, published);

        UpsertLandingSectionCommand command = new UpsertLandingSectionCommand(
                category, eventYear, title, description, url, published
        );
        LandingSectionDocument saved = landingSectionService.createSectionFromJson(command, body.uploadedImages());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    /**
     * Multipart Create Endpoint.
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<LandingSectionDocument> createSection(
            @RequestParam("category") LandingCategory category,
            @RequestParam(name = "eventYear", defaultValue = "2026") int eventYear,
            @RequestParam("title") String title,
            @RequestParam("description") String description,
            @RequestParam(name = "url", required = false, defaultValue = "") String url,
            @RequestParam(name = "published", defaultValue = "true") boolean published,
            @RequestPart(name = "images", required = false) List<MultipartFile> imageFiles,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        log.info("[CONTROLLER-MULTIPART] POST /api/v1/events/landing-sections -> MongoDB(event.landing_sections): category={}, year={}, url={}, imageCount={}, published={}",
                category, eventYear, url, imageFiles != null ? imageFiles.size() : 0, published);

        UpsertLandingSectionCommand command = new UpsertLandingSectionCommand(
                category, eventYear, title, description, url, published
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(landingSectionService.createSection(command, imageFiles));
    }

    /**
     * JSON Update Endpoint (invoked by Desktop Admin UI).
     */
    @PutMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<LandingSectionDocument> updateSectionJson(
            @PathVariable("id") String id,
            @RequestBody JsonUpsertLandingSectionRequest body,
            @RequestHeader(value = "X-Correlation-Id", required = false) String correlationId
    ) {
        bindCorrelationId(correlationId);
        LandingCategory category = body.category() != null ? body.category() : LandingCategory.CME;
        int eventYear = body.eventYear() != null ? body.eventYear() : 2026;
        String title = body.title() != null ? body.title().trim() : "";
        String description = body.description() != null ? body.description().trim() : "";
        String url = body.url() != null ? body.url().trim() : "";
        boolean published = Boolean.TRUE.equals(body.published());

        List<String> retainedBlobPaths = body.retainedImages() != null
                ? body.retainedImages().stream()
                    .map(RetainedImageDto::blobPath)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList())
                : null;

        log.info("[CONTROLLER-JSON] PUT /api/v1/events/landing-sections/{} -> MongoDB(event.landing_sections): category={}, year={}, url={}, newImages={}",
                id, category, eventYear, url, body.uploadedImages() != null ? body.uploadedImages().size() : 0);

        UpsertLandingSectionCommand command = new UpsertLandingSectionCommand(
                category, eventYear, title, description, url, published
        );
        return ResponseEntity.ok(
                landingSectionService.updateSectionFromJson(id, command, body.uploadedImages(), retainedBlobPaths)
        );
    }

    /**
     * Multipart Update Endpoint.
     */
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
        log.info("[CONTROLLER-MULTIPART] PUT /api/v1/events/landing-sections/{} -> MongoDB(event.landing_sections): category={}, year={}, url={}, newImages={}",
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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleControllerException(Exception ex) {
        log.error("[GHA-EVENT-SERVICE-ERROR] Request failed in LandingSectionController: {}", ex.getMessage(), ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", ex.getMessage() != null ? ex.getMessage() : "Internal server error in gha-event-service"));
    }

    private void bindCorrelationId(String correlationId) {
        MDC.put("correlationId", (correlationId != null && !correlationId.isBlank())
                ? correlationId
                : "gha-" + UUID.randomUUID().toString().substring(0, 8));
    }
}
