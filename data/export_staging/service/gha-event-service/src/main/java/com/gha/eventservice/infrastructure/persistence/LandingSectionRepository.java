package com.gha.eventservice.infrastructure.persistence;

import com.gha.eventservice.domain.model.LandingCategory;
import com.gha.eventservice.domain.model.LandingSectionDocument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data MongoDB Repository targeting database: "event_db".
 * Supports pagination (10 records per page across 1,000+ records) sorted by eventYear DESC, updatedAt DESC,
 * and enforces the 4-card rule (at most 1 published record per category).
 */
@Repository
public interface LandingSectionRepository extends MongoRepository<LandingSectionDocument, String> {

    /**
     * Paginated listing for Admin History Listing page (sorted by eventYear DESC, updatedAt DESC).
     */
    Page<LandingSectionDocument> findAllByOrderByEventYearDescUpdatedAtDesc(Pageable pageable);

    Page<LandingSectionDocument> findByEventYearOrderByUpdatedAtDesc(int eventYear, Pageable pageable);

    Page<LandingSectionDocument> findByEventYearAndPublishedOrderByUpdatedAtDesc(
        int eventYear,
        boolean published,
        Pageable pageable
    );

    Page<LandingSectionDocument> findByPublishedOrderByEventYearDescUpdatedAtDesc(
        boolean published,
        Pageable pageable
    );

    /**
     * Used by Mobile App Landing Page endpoint: returns ONLY published records (max 4 cards: 1 per category).
     */
    List<LandingSectionDocument> findByPublishedTrueOrderByUpdatedAtDesc();

    List<LandingSectionDocument> findByCategoryAndPublishedTrue(LandingCategory category);

    List<LandingSectionDocument> findAllByOrderByEventYearDescUpdatedAtDesc();
}
