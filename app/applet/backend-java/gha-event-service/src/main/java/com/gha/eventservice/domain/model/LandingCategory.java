package com.gha.eventservice.domain.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Supported Mobile App Landing Page Categories for GHA Medical Platform.
 * CME: Continuing Medical Education
 * GSI: Gastrointestinal Society of India
 * AHS: Course / Association of Hepato-Pancreato-Biliary & Hernia Surgeons (AHS)
 * CONFERENCE: Annual & Regional Medical Conferences
 */
public enum LandingCategory {
    CME("CME", "Continuing Medical Education"),
    GSI("GSI", "Gastrointestinal Society of India"),
    AHS("AHS", "Course / AHS"),
    CONFERENCE("Conference", "Annual Medical Conference");

    private final String code;
    private final String label;

    LandingCategory(String code, String label) {
        this.code = code;
        this.label = label;
    }

    @JsonValue
    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }

    @JsonCreator
    public static LandingCategory fromString(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        String normalized = value.trim().toUpperCase();
        for (LandingCategory cat : values()) {
            if (cat.name().equalsIgnoreCase(normalized) || cat.code.equalsIgnoreCase(value.trim())) {
                return cat;
            }
        }
        if (normalized.contains("CONFERENCE")) return CONFERENCE;
        if (normalized.contains("CME")) return CME;
        if (normalized.contains("GSI")) return GSI;
        if (normalized.contains("AHS") || normalized.contains("COURSE") || normalized.contains("ASI")) return AHS;
        throw new IllegalArgumentException("Unknown LandingCategory: " + value + ". Expected one of: [CME, CONFERENCE, GSI, AHS]");
    }
}
