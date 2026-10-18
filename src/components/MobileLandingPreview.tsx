import React, { useState, useEffect } from 'react';
import { LANDING_CATEGORIES, LandingCategory, LandingSectionRecord } from '../types/gha';
import { ResilientSectionImage } from './ResilientSectionImage';
import {
  Smartphone,
  RefreshCw,
  Eye,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Images,
  Globe,
  Lock,
  ExternalLink,
  X,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

interface MobileLandingPreviewProps {
  publishedSections: LandingSectionRecord[];
  totalAdminCount: number;
  loading: boolean;
  onRefresh: () => void;
  onSelectForEdit?: (section: LandingSectionRecord) => void;
  initialCategory?: 'ALL' | LandingCategory;
}

export const MobileLandingPreview: React.FC<MobileLandingPreviewProps> = ({
  publishedSections,
  totalAdminCount,
  loading,
  onRefresh,
  onSelectForEdit,
  initialCategory = 'ALL',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | LandingCategory>(initialCategory);

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory]);
  const [activeDetail, setActiveDetail] = useState<LandingSectionRecord | null>(null);
  const [inAppBrowserSection, setInAppBrowserSection] = useState<LandingSectionRecord | null>(
    null
  );
  const [browserViewMode, setBrowserViewMode] = useState<'portal' | 'iframe'>('portal');
  const [browserReloadCount, setBrowserReloadCount] = useState<number>(0);
  const [carouselIndices, setCarouselIndices] = useState<Record<string, number>>({});

  const isSameCat = (a?: string, b?: string): boolean => {
    if (!a || !b) return false;
    return a.trim().toUpperCase() === b.trim().toUpperCase();
  };

  // Strict guarantee: only records with published === true appear in the Mobile App Landing Page
  const visibleSections = publishedSections.filter(
    (item) =>
      Boolean(item.published) &&
      (selectedCategory === 'ALL' || isSameCat(item.category, selectedCategory))
  );

  const hiddenDraftCount = Math.max(0, totalAdminCount - publishedSections.length);

  const getImageIndex = (sectionId: string, totalImages: number) => {
    const current = carouselIndices[sectionId] || 0;
    return current >= totalImages ? 0 : current;
  };

  const stepImage = (
    e: React.MouseEvent,
    sectionId: string,
    totalImages: number,
    delta: number
  ) => {
    e.stopPropagation();
    setCarouselIndices((prev) => {
      const curr = prev[sectionId] || 0;
      const next = (curr + delta + totalImages) % totalImages;
      return { ...prev, [sectionId]: next };
    });
  };

  const resolveTargetUrl = (section: LandingSectionRecord): string => {
    return section.url && section.url.trim() ? section.url.trim() : '';
  };

  const handleOpenInAppBrowser = (section: LandingSectionRecord) => {
    const target = resolveTargetUrl(section);
    if (!target) {
      setActiveDetail(section);
      return;
    }
    setInAppBrowserSection(section);
    setBrowserViewMode('portal');
  };

  return (
    <div className="flex flex-col items-center">
      {/* Context Header above Mobile Frame */}
      <div className="w-full max-w-[390px] mb-3 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-slate-700" />
          <span className="font-semibold text-slate-900">GHA Mobile App Landing Page</span>
        </div>
        <div className="flex items-center gap-2 font-mono tabular-nums">
          <span>{publishedSections.length}/4 Published</span>
          <span aria-hidden="true">·</span>
          <span className="text-slate-400">{hiddenDraftCount} History</span>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh Mobile Landing Feed from GHA Gateway"
            className="p-1 text-slate-500 hover:text-slate-900 rounded transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Device Viewport Frame (390px iOS / Android Standard Width) */}
      <div className="w-full max-w-[390px] bg-white border border-slate-300 rounded-[28px] overflow-hidden shadow-sm flex flex-col min-h-[690px] max-h-[780px] relative">
        {/* IN-APP BROWSER OVERLAY (Triggered when user clicks a Landing Page Image) */}
        {inAppBrowserSection ? (
          <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
            {/* Native Mobile Status Bar */}
            <div className="bg-slate-900 text-white px-4 pt-2.5 pb-2 flex items-center justify-between text-[11px] font-mono text-slate-300 shrink-0">
              <span>09:41</span>
              <span>GHA IN-APP BROWSER</span>
            </div>

            {/* In-App Browser Navigation & Address Bar */}
            <div className="bg-slate-100 border-b border-slate-200 px-3 py-2 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setInAppBrowserSection(null)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 shrink-0 cursor-pointer"
              >
                Done
              </button>

              <div className="flex-1 min-w-0 bg-white border border-slate-300 rounded-md px-2.5 py-1 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
                <span
                  className="text-[11px] font-mono text-slate-800 truncate"
                  title={resolveTargetUrl(inAppBrowserSection)}
                >
                  {resolveTargetUrl(inAppBrowserSection)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setBrowserReloadCount((c) => c + 1)}
                title="Reload In-App Browser"
                className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-md shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <a
                href={resolveTargetUrl(inAppBrowserSection)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open URL in system browser tab"
                className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-md shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Mode Switcher: Rendered Event Portal vs Live WebView iframe */}
            <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] shrink-0">
              <span className="font-mono text-slate-500">
                Redirected from {inAppBrowserSection.category} Image Tap
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBrowserViewMode('portal')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    browserViewMode === 'portal'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Event Portal
                </button>
                <button
                  type="button"
                  onClick={() => setBrowserViewMode('iframe')}
                  className={`px-2 py-0.5 rounded font-medium cursor-pointer ${
                    browserViewMode === 'iframe'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Live iframe
                </button>
              </div>
            </div>

            {/* In-App Browser WebView Content */}
            {browserViewMode === 'iframe' ? (
              <div className="flex-1 flex flex-col bg-slate-50 relative">
                <iframe
                  key={`${inAppBrowserSection.id}-${browserReloadCount}`}
                  src={resolveTargetUrl(inAppBrowserSection)}
                  title={`In-App Browser: ${inAppBrowserSection.title}`}
                  className="w-full flex-1 border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
                <div className="p-2.5 bg-slate-900 text-slate-300 text-[11px] flex items-center justify-between">
                  <span className="truncate">
                    Target: {resolveTargetUrl(inAppBrowserSection)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBrowserViewMode('portal')}
                    className="text-emerald-400 font-semibold underline ml-2 shrink-0 cursor-pointer"
                  >
                    Switch to Portal View
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={`${inAppBrowserSection.id}-${browserReloadCount}`}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-white"
              >
                {(() => {
                  const imgs =
                    inAppBrowserSection.images && inAppBrowserSection.images.length > 0
                      ? inAppBrowserSection.images
                      : [
                          {
                            blobPath: inAppBrowserSection.imageBlobPath,
                            previewUrl: inAppBrowserSection.imagePreviewUrl,
                            fileName: inAppBrowserSection.imageFileName,
                            mimeType: inAppBrowserSection.imageMimeType,
                            sizeBytes: inAppBrowserSection.imageSizeBytes,
                          },
                        ];
                  const activeIdx = getImageIndex(inAppBrowserSection.id, imgs.length);
                  const currentImg = imgs[activeIdx] || imgs[0];

                  return (
                    <>
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 flex items-start gap-2">
                        <Globe className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-semibold">
                            In-App Browser Redirect Active
                          </div>
                          <div className="font-mono text-[11px] text-emerald-800 break-all mt-0.5">
                            {resolveTargetUrl(inAppBrowserSection)}
                          </div>
                        </div>
                      </div>

                      <div className="aspect-video rounded-xl overflow-hidden bg-slate-900 relative">
                        <ResilientSectionImage
                          src={currentImg.previewUrl}
                          alt={inAppBrowserSection.title}
                          category={inAppBrowserSection.category}
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 text-white text-[11px] font-mono">
                          {inAppBrowserSection.category === 'AHS'
                            ? 'Course / AHS'
                            : inAppBrowserSection.category}{' '}
                          · {inAppBrowserSection.eventYear}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                          <Calendar className="w-3.5 h-3.5 text-slate-700" />
                          <span>Event Year: {inAppBrowserSection.eventYear}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 font-semibold">
                            Registration Open
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 leading-snug">
                          {inAppBrowserSection.title}
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {inAppBrowserSection.description}
                        </p>
                      </div>

                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Delegate Pass &amp; CME Credit Portal</span>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          This destination page is loaded inside the GHA Mobile App In-App Browser from the <code className="font-mono">url</code> field stored in <code className="font-mono">event_db.landing_sections</code>.
                        </p>
                        <div className="pt-1 flex items-center gap-2">
                          <a
                            href={resolveTargetUrl(inAppBrowserSection)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 bg-slate-900 text-white text-center font-semibold rounded-lg hover:bg-slate-800 inline-flex items-center justify-center gap-1.5"
                          >
                            <span>Open Link in New Browser Tab</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* In-App Browser Footer Bar */}
            <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-600 shrink-0">
              <button
                type="button"
                onClick={() => setInAppBrowserSection(null)}
                className="text-slate-900 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close In-App Browser</span>
              </button>
              <span className="text-emerald-700">InAppBrowser · 200 OK</span>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile Status & App Header (Strictly <= 15% mobile viewport height) */}
            <div className="bg-slate-900 text-white px-5 pt-3 pb-3.5 shrink-0">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2 tabular-nums">
                <span>09:41</span>
                <span>GHA MOBILE · LIVE FEED</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-white">
                    Global Health Academy
                  </h3>
                  <p className="text-xs text-slate-300">
                    CME · GSI · Course / AHS · Conferences
                  </p>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                  {visibleSections.length} Active
                </span>
              </div>
            </div>

            {/* Interactive Category Filter Bar inside Mobile App */}
            <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 shrink-0 overflow-x-auto">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setActiveDetail(null);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCategory === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({publishedSections.length})
                </button>
                {LANDING_CATEGORIES.map((cat) => {
                  const count = publishedSections.filter((s) => isSameCat(s.category, cat.code)).length;
                  return (
                    <button
                      key={cat.code}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat.code);
                        setActiveDetail(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isSameCat(selectedCategory, cat.code)
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat.shortLabel} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile Scrollable Feed */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 bg-white">
              {loading ? (
                <div className="p-5 space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="animate-pulse space-y-2">
                      <div className="h-36 bg-slate-200 rounded-lg" />
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-100 rounded w-full" />
                    </div>
                  ))}
                </div>
              ) : activeDetail ? (
                <div className="p-5 space-y-4">
                  <button
                    type="button"
                    onClick={() => setActiveDetail(null)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    ← Back to Mobile Landing Feed
                  </button>

                  {/* Multi-Image Gallery in Detail View (Click image to redirect in In-App Browser) */}
                  {(() => {
                    const imgs =
                      activeDetail.images && activeDetail.images.length > 0
                        ? activeDetail.images
                        : [
                            {
                              blobPath: activeDetail.imageBlobPath,
                              previewUrl: activeDetail.imagePreviewUrl,
                              fileName: activeDetail.imageFileName,
                              mimeType: activeDetail.imageMimeType,
                              sizeBytes: activeDetail.imageSizeBytes,
                            },
                          ];
                    const activeIdx = getImageIndex(activeDetail.id, imgs.length);
                    const currentImg = imgs[activeIdx] || imgs[0];

                    return (
                      <div className="space-y-2.5">
                        <div
                          onClick={() => handleOpenInAppBrowser(activeDetail)}
                          title={`Click image to open ${resolveTargetUrl(activeDetail)} in In-App Browser`}
                          className="aspect-video rounded-xl overflow-hidden bg-slate-900 relative cursor-pointer group"
                        >
                          <ResilientSectionImage
                            src={currentImg.previewUrl}
                            alt={`${activeDetail.title} (${activeIdx + 1}/${imgs.length})`}
                            category={activeDetail.category}
                          />
                          {imgs.length > 1 && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => stepImage(e, activeDetail.id, imgs.length, -1)}
                                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/65 text-white hover:bg-black/85 cursor-pointer"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => stepImage(e, activeDetail.id, imgs.length, 1)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/65 text-white hover:bg-black/85 cursor-pointer"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[11px] font-mono inline-flex items-center gap-1">
                            <Globe className="w-3 h-3 text-emerald-400" />
                            <span>Tap image to open URL</span>
                          </div>
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[11px] font-mono tabular-nums">
                            {activeIdx + 1} / {imgs.length}
                          </div>
                        </div>

                        {imgs.length > 1 && (
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {imgs.map((img, i) => (
                              <button
                                key={img.blobPath + i}
                                type="button"
                                onClick={() =>
                                  setCarouselIndices((prev) => ({
                                    ...prev,
                                    [activeDetail.id]: i,
                                  }))
                                }
                                className={`w-14 h-10 rounded-md overflow-hidden border-2 shrink-0 cursor-pointer ${
                                  i === activeIdx
                                    ? 'border-slate-900'
                                    : 'border-transparent opacity-60'
                                }`}
                              >
                                <ResilientSectionImage
                                  src={img.previewUrl}
                                  alt={img.fileName}
                                  category={activeDetail.category}
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                    <span className="font-semibold text-slate-900">{activeDetail.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>Year {activeDetail.eventYear}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeDetail.images?.length || 1} Image(s)</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-emerald-700">Published</span>
                  </div>
                  <h4 className="text-base font-semibold text-slate-900 leading-snug">
                    {activeDetail.title}
                  </h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {activeDetail.description}
                  </p>

                  {/* Target Redirect URL Button (Only shown when optional URL is set) */}
                  {resolveTargetUrl(activeDetail) && (
                    <button
                      type="button"
                      onClick={() => handleOpenInAppBrowser(activeDetail)}
                      className="w-full py-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="truncate">
                        Open in In-App Browser ({resolveTargetUrl(activeDetail)})
                      </span>
                    </button>
                  )}

                  <div className="pt-3 border-t border-slate-200 space-y-1.5 text-[11px] font-mono text-slate-500">
                    <div>MongoDB ID: {activeDetail.id}</div>
                    <div className="text-sky-700 break-all">
                      Redirect URL: {resolveTargetUrl(activeDetail) || '(None — Optional)'}
                    </div>
                    <div className="text-slate-700 font-semibold">
                      Stored Blob Paths ({activeDetail.images?.length || 1}):
                    </div>
                    {(activeDetail.images || []).map((img, idx) => (
                      <div key={img.blobPath + idx} className="break-all text-slate-600">
                        [{idx + 1}] {img.blobPath}
                      </div>
                    ))}
                  </div>
                </div>
              ) : visibleSections.length === 0 ? (
                <div className="p-8 text-center my-auto">
                  <p className="text-sm font-semibold text-slate-900 mb-1">
                    No Published Sections in {selectedCategory === 'ALL' ? 'Feed' : selectedCategory}
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Only records with Published state enabled in the Admin Form appear on the Mobile App Landing Page.
                  </p>
                </div>
              ) : (
                visibleSections.map((section) => {
                  const imgs =
                    section.images && section.images.length > 0
                      ? section.images
                      : [
                          {
                            blobPath: section.imageBlobPath,
                            previewUrl: section.imagePreviewUrl,
                            fileName: section.imageFileName,
                            mimeType: section.imageMimeType,
                            sizeBytes: section.imageSizeBytes,
                          },
                        ];
                  const currentIdx = getImageIndex(section.id, imgs.length);
                  const activeImg = imgs[currentIdx] || imgs[0];
                  const targetUrl = resolveTargetUrl(section);

                  return (
                    <article
                      key={section.id}
                      className="p-4 hover:bg-slate-50 transition-colors group"
                    >
                      {/* Clicking the Image redirects to section.url in the Mobile In-App Browser */}
                      <div
                        onClick={() => handleOpenInAppBrowser(section)}
                        title={`Tap image to open ${targetUrl} in In-App Browser`}
                        className="aspect-video w-full rounded-xl overflow-hidden bg-slate-900 mb-2.5 relative cursor-pointer"
                      >
                        <ResilientSectionImage
                          src={activeImg.previewUrl}
                          alt={`${section.title} (${currentIdx + 1}/${imgs.length})`}
                          category={section.category}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                        />

                        {/* Multi-Image Carousel Controls on Card */}
                        {imgs.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => stepImage(e, section.id, imgs.length, -1)}
                              title="Previous category image"
                              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/85 transition-colors cursor-pointer z-10"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => stepImage(e, section.id, imgs.length, 1)}
                              title="Next category image"
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/85 transition-colors cursor-pointer z-10"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-3 pointer-events-none">
                          <div className="w-full flex items-center justify-between text-xs text-white/95 mb-1">
                            <span className="font-semibold tracking-wide inline-flex items-center gap-1.5">
                              <span>
                                {section.category === 'AHS' ? 'Course / AHS' : section.category}
                              </span>
                              {targetUrl && (
                                <span className="text-[10px] font-mono text-emerald-300">
                                  · Tap image → In-App Browser
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[11px] text-white/85 tabular-nums inline-flex items-center gap-1">
                              <Images className="w-3 h-3" />
                              <span>
                                {currentIdx + 1}/{imgs.length}
                              </span>
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-white line-clamp-1 drop-shadow-sm">
                            {section.title}
                          </h4>
                        </div>
                      </div>

                      {/* Multi-image dot/thumbnail indicator */}
                      {imgs.length > 1 && (
                        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto">
                          {imgs.map((img, idx) => (
                            <button
                              key={img.blobPath + idx}
                              type="button"
                              onClick={() =>
                                setCarouselIndices((prev) => ({ ...prev, [section.id]: idx }))
                              }
                              className={`h-8 w-12 rounded overflow-hidden border transition-opacity shrink-0 cursor-pointer ${
                                idx === currentIdx
                                  ? 'border-slate-900 opacity-100'
                                  : 'border-slate-200 opacity-55 hover:opacity-90'
                              }`}
                            >
                              <ResilientSectionImage
                                src={img.previewUrl}
                                alt={img.fileName}
                                category={section.category}
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Clean unboxed metadata per Zero-Pill Discipline */}
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <div className="flex items-center gap-1.5 font-mono tabular-nums">
                          <span className="font-semibold text-slate-800">{section.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{imgs.length} Image(s)</span>
                          <span aria-hidden="true">·</span>
                          <span>Published</span>
                        </div>
                        {onSelectForEdit && (
                          <button
                            type="button"
                            onClick={() => onSelectForEdit(section)}
                            className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Edit</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <h4
                        onClick={() => handleOpenInAppBrowser(section)}
                        className="text-sm font-semibold text-slate-900 mb-1 cursor-pointer hover:underline"
                      >
                        {section.title}
                      </h4>

                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                        {section.description}
                      </p>

                      {/* Target Redirect URL Row */}
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                        {targetUrl ? (
                          <button
                            type="button"
                            onClick={() => handleOpenInAppBrowser(section)}
                            className="text-sky-700 hover:underline truncate max-w-[235px] inline-flex items-center gap-1 cursor-pointer"
                            title={`Open in In-App Browser: ${targetUrl}`}
                          >
                            <Globe className="w-3 h-3 shrink-0" />
                            <span className="truncate">{targetUrl}</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 truncate max-w-[235px]" title={activeImg.blobPath}>
                            {activeImg.blobPath}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveDetail(section)}
                          className="text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Mobile Bottom Bar */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-500 shrink-0">
              <span>GET /api/v1/events/landing-sections/published</span>
              <span className="text-emerald-700 font-medium">200 OK</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
