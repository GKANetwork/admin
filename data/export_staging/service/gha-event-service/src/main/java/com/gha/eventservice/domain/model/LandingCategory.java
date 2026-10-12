package com.gha.eventservice.domain.model;

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

    public String getCode() {
        return code;
    }

    public String getLabel() {
        return label;
    }
}
