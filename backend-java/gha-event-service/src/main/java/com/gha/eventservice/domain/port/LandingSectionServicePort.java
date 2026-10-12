package com.gha.eventservice.domain.port;

import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.model.LandingSectionDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Application Service Interface for managing Mobile App Landing Page sections.
 * Enforces max 4 published cards on Mobile Landing Page (1 active per category: CME, GSI, AHS, Conference)
 * and supports re-publishing any historical unpublished record.
 */
public interface LandingSectionServicePort {

    record UpsertLandingSectionCommand(
        LandingCategory category,
        int eventYear,
        String title,
        String description,
        String url,
        boolean published
    ) {}

    record Base64ImageUpload(
        String fileName,
        String mimeType,
        long sizeBytes,
        String base64Data
    ) {}

    LandingSectionDocument getSectionById(String id);

    LandingSectionDocument createSection(UpsertLandingSectionCommand command, List<MultipartFile> imageFiles);

    LandingSectionDocument createSectionFromJson(UpsertLandingSectionCommand command, List<Base64ImageUpload> uploadedImages);

    LandingSectionDocument updateSection(
        String id,
        UpsertLandingSectionCommand command,
        List<MultipartFile> newImageFiles,
        List<String> retainedBlobPaths
    );

    LandingSectionDocument updateSectionFromJson(
        String id,
        UpsertLandingSectionCommand command,
        List<Base64ImageUpload> uploadedImages,
        List<String> retainedBlobPaths
    );

    LandingSectionDocument updatePublishState(String id, boolean published);

    Page<LandingSectionDocument> getPaginatedSections(
        Pageable pageable,
        Integer year,
        Boolean published,
        LandingCategory category
    );

    List<LandingSectionDocument> getAllAdminSections();

    List<LandingSectionDocument> getPublishedAppLandingSections(LandingCategory optionalCategory);

    void deleteSection(String id);
}
