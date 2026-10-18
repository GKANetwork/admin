import React, { useCallback, useEffect, useState } from 'react';
import {
  LANDING_CATEGORIES,
  LandingCategory,
  LandingSectionRecord,
  PaginatedLandingSectionsResponse,
} from '../types/gha';
import { GhaGatewayClientFactory } from '../services/ghaGatewayService';
import { ResilientSectionImage } from './ResilientSectionImage';
import {
  Eye,
  Pencil,
  Trash2,
  CheckCircle2,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  History,
  X,
  Images,
  ExternalLink,
  Smartphone,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Globe,
  Lock,
} from 'lucide-react';

interface LandingRecordsListingPageProps {
  onEditRecord: (record: LandingSectionRecord) => void;
  onTogglePublish: (record: LandingSectionRecord) => Promise<void>;
  onDeleteRecord: (record: LandingSectionRecord) => Promise<void>;
  onCreateClick?: () => void;
  refreshTrigger: number;
}

const PAGE_SIZE = 10;

// Canonical slot order for the 4 verticals
const VERTICAL_SLOTS: LandingCategory[] = ['CME', 'GSI', 'AHS', 'Conference'];

export const LandingRecordsListingPage: React.FC<LandingRecordsListingPageProps> = ({
  onEditRecord,
  onTogglePublish,
  onDeleteRecord,
  onCreateClick,
  refreshTrigger,
}) => {
  const gatewayClient = GhaGatewayClientFactory.getClient();

  const [page, setPage] = useState<number>(0);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [publishFilter, setPublishFilter] = useState<'ALL' | 'PUBLISHED' | 'UNPUBLISHED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | LandingCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [pageData, setPageData] = useState<PaginatedLandingSectionsResponse>({
    content: [],
    page: 0,
    size: PAGE_SIZE,
    totalElements: 0,
    totalPages: 1,
    availableYears: [2026, 2025, 2024, 2023],
  });
  const [publishedSections, setPublishedSections] = useState<LandingSectionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // View Record Modal State
  const [viewingRecord, setViewingRecord] = useState<LandingSectionRecord | null>(null);
  const [viewingImageIndex, setViewingImageIndex] = useState<number>(0);

  // Validation / Replace Modal State (4-Card Rule: strictly 1 per vertical, max 4 total)
  const [validationModal, setValidationModal] = useState<{
    targetRecord: LandingSectionRecord;
    displacedRecord: LandingSectionRecord | null;
  } | null>(null);

  // 4-Card Live Mobile Feed Preview Modal State
  const [show4CardPreview, setShow4CardPreview] = useState<boolean>(false);
  const [previewFocusedCategory, setPreviewFocusedCategory] = useState<'ALL' | LandingCategory>('ALL');
  const [previewDeviceMode, setPreviewDeviceMode] = useState<'iphone' | 'android'>('iphone');
  const [previewCarouselIndices, setPreviewCarouselIndices] = useState<Record<string, number>>({});
  const [inAppBrowserSection, setInAppBrowserSection] = useState<LandingSectionRecord | null>(null);

  const loadPaginatedData = useCallback(async () => {
    setLoading(true);
    try {
      const [response, publishedList] = await Promise.all([
        gatewayClient.getPaginatedListing({
          page,
          size: PAGE_SIZE,
          year: selectedYear,
          published:
            publishFilter === 'PUBLISHED'
              ? true
              : publishFilter === 'UNPUBLISHED'
              ? false
              : undefined,
          category: categoryFilter === 'ALL' ? undefined : categoryFilter,
          search: searchQuery.trim() || undefined,
        }),
        gatewayClient.getPublishedMobileSections(),
      ]);

      setPageData(response);
      setPublishedSections(publishedList);

      // Update viewingRecord if currently open
      if (viewingRecord) {
        const updatedInPage = response.content.find((r) => r.id === viewingRecord.id);
        if (updatedInPage) {
          setViewingRecord(updatedInPage);
        }
      }
    } catch (err) {
      console.error('Failed to load paginated listing and published sections:', err);
    } finally {
      setLoading(false);
    }
  }, [
    gatewayClient,
    page,
    selectedYear,
    publishFilter,
    categoryFilter,
    searchQuery,
    refreshTrigger,
  ]);

  useEffect(() => {
    loadPaginatedData();
  }, [loadPaginatedData]);

  // Validation Handler: Strictly max 4 cards total and 1 per vertical
  const handleInitiatePublish = async (record: LandingSectionRecord) => {
    if (record.published) {
      // Unpublishing an existing card: directly allow
      await onTogglePublish(record);
      await loadPaginatedData();
      return;
    }

    // Publishing an unpublished card: validate 4-card rule
    const existingPublishedForVertical = publishedSections.find(
      (p) => p.category === record.category && p.id !== record.id
    );

    if (existingPublishedForVertical) {
      // Prompt replacement confirmation
      setValidationModal({
        targetRecord: record,
        displacedRecord: existingPublishedForVertical,
      });
      return;
    }

    // Check if 4 cards are already published across other verticals
    if (publishedSections.length >= 4) {
      alert(
        'Validation Warning: All 4 vertical slots (CME, GSI, Course / AHS, Conference) are already published. Please unpublish an existing card before publishing this card.'
      );
      return;
    }

    // Safe to publish directly
    await onTogglePublish(record);
    await loadPaginatedData();
  };

  const handleConfirmReplacePublish = async () => {
    if (!validationModal) return;
    const { targetRecord } = validationModal;
    setValidationModal(null);
    await onTogglePublish(targetRecord);
    await loadPaginatedData();
  };

  const getPublishedForVertical = (cat: LandingCategory): LandingSectionRecord | undefined => {
    return publishedSections.find((p) => p.category === cat);
  };

  const formatCategoryName = (cat: LandingCategory): string => {
    return cat === 'AHS' ? 'Course / AHS' : cat;
  };

  const startRecordNum =
    pageData.totalElements === 0 ? 0 : pageData.page * PAGE_SIZE + 1;
  const endRecordNum = Math.min(
    pageData.totalElements,
    (pageData.page + 1) * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      {/* =========================================================================
          SECTION 1: THE 4 PUBLISHED SECTIONS AT TOP (1 PER VERTICAL · MAX 4)
         ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {/* Top Header & Mobile Preview Trigger */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <h2 className="text-sm font-black tracking-wide uppercase text-white">
                Live Published Sections · 4 Verticals Active
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {publishedSections.length} of 4 Published
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Validated 4-Card Contract: Strictly 1 card per clinical vertical is live at any time. Pinned at top.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setPreviewFocusedCategory('ALL');
                setShow4CardPreview(true);
              }}
              className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              title="Preview the 4 published cards live in the mobile app feed simulator"
            >
              <Smartphone className="w-4 h-4 stroke-[2.5]" />
              <span>Preview 4 Selected Cards</span>
              <span className="bg-slate-950/20 px-1.5 py-0.5 rounded text-[10px] font-mono font-black">
                {publishedSections.length}/4
              </span>
            </button>
          </div>
        </div>

        {/* 4 Vertical Slots Showcase Grid */}
        <div className="p-6 bg-slate-50/70 border-b border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VERTICAL_SLOTS.map((verticalKey, idx) => {
              const publishedRec = getPublishedForVertical(verticalKey);
              const meta = LANDING_CATEGORIES.find((c) => c.code === verticalKey);
              const imgs =
                publishedRec?.images && publishedRec.images.length > 0
                  ? publishedRec.images
                  : publishedRec
                  ? [
                      {
                        blobPath: publishedRec.imageBlobPath,
                        previewUrl: publishedRec.imagePreviewUrl,
                        fileName: publishedRec.imageFileName,
                        mimeType: publishedRec.imageMimeType,
                        sizeBytes: publishedRec.imageSizeBytes,
                      },
                    ]
                  : [];

              return (
                <div
                  key={verticalKey}
                  className={`rounded-xl border transition-all duration-200 flex flex-col justify-between overflow-hidden ${
                    publishedRec
                      ? 'bg-white border-emerald-300 shadow-xs hover:border-emerald-400 hover:shadow-sm'
                      : 'bg-white/60 border-dashed border-amber-300 shadow-none'
                  }`}
                >
                  {/* Slot Header */}
                  <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black font-mono text-slate-500 uppercase">
                        Slot {idx + 1}
                      </span>
                      <span className="text-[11px] font-black text-slate-900">
                        {formatCategoryName(verticalKey)}
                      </span>
                    </div>

                    {publishedRec ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black font-mono bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>LIVE</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-100 text-amber-800 border border-amber-200">
                        EMPTY
                      </span>
                    )}
                  </div>

                  {/* Slot Content */}
                  <div className="p-3.5 space-y-2.5 flex-1 flex flex-col">
                    {publishedRec ? (
                      <>
                        <div
                          onClick={() => {
                            setViewingRecord(publishedRec);
                            setViewingImageIndex(0);
                          }}
                          className="aspect-video w-full rounded-lg overflow-hidden bg-slate-900 border border-slate-200 relative cursor-pointer shrink-0"
                        >
                          <ResilientSectionImage
                            src={imgs[0]?.previewUrl}
                            alt={publishedRec.title}
                            category={publishedRec.category}
                          />
                          {imgs.length > 1 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono inline-flex items-center gap-0.5">
                              <Images className="w-2.5 h-2.5" />
                              <span>{imgs.length}</span>
                            </span>
                          )}
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-mono font-bold">
                            {publishedRec.eventYear}
                          </span>
                        </div>

                        <div className="flex-1 space-y-1">
                          <h4
                            onClick={() => {
                              setViewingRecord(publishedRec);
                              setViewingImageIndex(0);
                            }}
                            className="text-xs font-bold text-slate-900 line-clamp-1 hover:underline cursor-pointer"
                            title={publishedRec.title}
                          >
                            {publishedRec.title}
                          </h4>
                          <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {publishedRec.description}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-2 space-y-1">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <p className="text-xs font-semibold text-slate-700">
                          No Active {formatCategoryName(verticalKey)} Card
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {meta?.clinicalFocus || 'Select an item from the table below to publish.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Slot Footer Actions */}
                  <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1 text-[11px]">
                    {publishedRec ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewFocusedCategory(publishedRec.category);
                            setShow4CardPreview(true);
                          }}
                          className="px-2 py-1 font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded inline-flex items-center gap-1 cursor-pointer transition-colors"
                          title="Preview in Mobile simulator"
                        >
                          <Smartphone className="w-3 h-3" />
                          <span>Preview</span>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditRecord(publishedRec)}
                            className="px-2 py-1 font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInitiatePublish(publishedRec)}
                            className="px-2 py-1 font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded inline-flex items-center gap-1 cursor-pointer transition-colors"
                            title="Unpublish this vertical card"
                          >
                            <EyeOff className="w-3 h-3" />
                            <span>Unpublish</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="text-[11px] font-mono text-slate-400 italic mx-auto">
                        Awaiting publication
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2: ALL RECORDS TABLE (WITH PUBLISHED ROWS PINNED AT TOP)
         ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-950 uppercase tracking-wider">
                <th className="py-3.5 px-4 font-black text-slate-950">Year · Category</th>
                <th className="py-3.5 px-4 font-black text-slate-950">Section Banner &amp; Details</th>
                <th className="py-3.5 px-4 font-black text-slate-950">Publish State</th>
                <th className="py-3.5 px-4 font-black text-slate-950">Latest History Event</th>
                <th className="py-3.5 px-4 font-black text-slate-950 text-right">Actions (View / Edit / Delete)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={5} className="p-4">
                      <div className="h-14 bg-slate-100 animate-pulse rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : pageData.content.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 px-6 text-center">
                    <p className="text-sm font-semibold text-slate-900">
                      No records found for the selected year / filter
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try selecting &ldquo;All Years&rdquo; or clearing the search filter.
                    </p>
                  </td>
                </tr>
              ) : (
                pageData.content.map((record) => {
                  const imgs =
                    record.images && record.images.length > 0
                      ? record.images
                      : [
                          {
                            blobPath: record.imageBlobPath,
                            previewUrl: record.imagePreviewUrl,
                            fileName: record.imageFileName,
                            mimeType: record.imageMimeType,
                            sizeBytes: record.imageSizeBytes,
                          },
                        ];
                  const latestHistory =
                    record.history && record.history.length > 0
                      ? record.history[0]
                      : null;

                  return (
                    <tr
                      key={record.id}
                      className={`transition-colors align-top ${
                        record.published
                          ? 'bg-emerald-50/25 hover:bg-emerald-50/50 border-l-4 border-l-emerald-500'
                          : 'hover:bg-slate-50/90'
                      }`}
                    >
                      {/* Column 1: Year & Category */}
                      <td className="py-4 px-4 whitespace-nowrap font-mono tabular-nums">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-900">
                            {record.eventYear}
                          </span>
                          {record.published && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-black font-mono bg-emerald-600 text-white">
                              PINNED
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-700 mt-0.5">
                          {formatCategoryName(record.category)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Updated {record.updatedAt.slice(0, 10)}
                        </div>
                      </td>

                      {/* Column 2: Thumbnail + Title + Description + Blob Path */}
                      <td className="py-4 px-4 max-w-md">
                        <div className="flex items-start gap-3.5">
                          <div
                            onClick={() => {
                              setViewingRecord(record);
                              setViewingImageIndex(0);
                            }}
                            className="w-28 aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-200 shrink-0 relative cursor-pointer"
                          >
                            <ResilientSectionImage
                              src={imgs[0].previewUrl}
                              alt={record.title}
                              category={record.category}
                            />
                            {imgs.length > 1 && (
                              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-mono inline-flex items-center gap-0.5">
                                <Images className="w-2.5 h-2.5" />
                                <span>{imgs.length}</span>
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div
                              onClick={() => {
                                setViewingRecord(record);
                                setViewingImageIndex(0);
                              }}
                              className="text-sm font-semibold text-slate-900 hover:underline cursor-pointer line-clamp-1"
                            >
                              {record.title}
                            </div>
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                              {record.description}
                            </p>
                            {record.url && (
                              <div
                                className="text-[11px] font-mono text-sky-700 mt-1 truncate inline-flex items-center gap-1 max-w-full"
                                title={`In-App Browser Redirect URL: ${record.url}`}
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{record.url}</span>
                              </div>
                            )}
                            <div
                              className="text-[11px] font-mono text-slate-400 mt-0.5 truncate"
                              title={imgs[0].blobPath}
                            >
                              {imgs[0].blobPath}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 3: Publish / Re-Publish / Unpublish State & Quick Toggle */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="space-y-1.5">
                          <div
                            className={`text-xs font-mono font-bold ${
                              record.published ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {record.published
                              ? `Published (${formatCategoryName(record.category)} Slot)`
                              : 'Unpublished (History)'}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleInitiatePublish(record)}
                            title={
                              record.published
                                ? 'Unpublish this record from the Mobile Landing Page'
                                : `Publish this ${record.eventYear} ${formatCategoryName(record.category)} record (Validates 4-card rule)`
                            }
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer ${
                              record.published
                                ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                            }`}
                          >
                            {record.published ? (
                              <>
                                <EyeOff className="w-3 h-3" />
                                <span>Unpublish</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                <span>
                                  {record.history && record.history.some((h) => h.action === 'UNPUBLISHED')
                                    ? 'Re-Publish'
                                    : 'Publish'}
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Column 4: Audit History Summary */}
                      <td className="py-4 px-4 max-w-xs">
                        {latestHistory ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 tabular-nums">
                              <History className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-800">
                                {latestHistory.action}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{latestHistory.timestamp.slice(0, 10)}</span>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2">
                              {latestHistory.summary}
                            </p>
                            {record.history && record.history.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingRecord(record);
                                  setViewingImageIndex(0);
                                }}
                                className="text-[11px] font-mono text-slate-500 hover:text-slate-900 underline cursor-pointer"
                              >
                                +{record.history.length - 1} earlier history event(s)
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">No history recorded</span>
                        )}
                      </td>

                      {/* Column 5: View / Edit / Delete Actions */}
                      <td className="py-4 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              setViewingImageIndex(0);
                              try {
                                const fresh = await gatewayClient.getSectionById(record.id);
                                setViewingRecord(fresh);
                              } catch {
                                setViewingRecord(record);
                              }
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="View full record details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onEditRecord(record)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Edit record in Admin Form"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteRecord(record);
                              await loadPaginatedData();
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Delete record from event_db"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs font-mono text-slate-600 tabular-nums">
            Showing <span className="font-semibold text-slate-900">{startRecordNum}</span>–
            <span className="font-semibold text-slate-900">{endRecordNum}</span> of{' '}
            <span className="font-semibold text-slate-900">{pageData.totalElements}</span>{' '}
            records (Page size: {PAGE_SIZE})
            {selectedYear !== undefined && (
              <span> · Filtered by Year {selectedYear}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            <button
              type="button"
              disabled={pageData.page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: pageData.totalPages }).map((_, idx) => {
              const active = idx === pageData.page;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPage(idx)}
                  className={`w-8 h-8 rounded-lg font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}

            <button
              type="button"
              disabled={pageData.page >= pageData.totalPages - 1}
              onClick={() =>
                setPage((p) => Math.min(pageData.totalPages - 1, p + 1))
              }
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: VALIDATION CONFIRMATION MODAL (1 PER VERTICAL RULE)
         ========================================================================= */}
      {validationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  Vertical Validation · 4-Card Rule
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setValidationModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                The mobile app enforces a strict <strong>4-Card Limit</strong> with <strong>exactly 1 published card per clinical vertical</strong>.
              </p>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span>Current Active Card for Vertical:</span>
                  <span className="font-mono bg-amber-200 px-1.5 py-0.5 rounded text-amber-950">
                    {formatCategoryName(validationModal.targetRecord.category)}
                  </span>
                </div>
                {validationModal.displacedRecord && (
                  <div className="text-amber-800 text-xs pl-2 border-l-2 border-amber-400">
                    <p className="font-semibold text-slate-900">
                      {validationModal.displacedRecord.title} ({validationModal.displacedRecord.eventYear})
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Will be automatically unpublished and moved to historical records.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                <span className="font-bold text-emerald-900">New Card to Publish as Active:</span>
                <p className="font-semibold text-slate-900">
                  {validationModal.targetRecord.title} ({validationModal.targetRecord.eventYear})
                </p>
              </div>

              <p className="text-slate-500 text-[11px]">
                Do you want to proceed and replace the active card for{' '}
                <strong>{formatCategoryName(validationModal.targetRecord.category)}</strong>?
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setValidationModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReplacePublish}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Replace &amp; Publish Active Card</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SECTION 4: LIVE 4-CARD MOBILE FEED PREVIEW MODAL
         ========================================================================= */}
      {show4CardPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-slate-900 text-white border border-slate-700 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col my-auto max-h-[92vh]">
            {/* Modal Top Bar */}
            <div className="px-6 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Live Mobile App Preview · 4 Published Cards Feed
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Exact representation of the landing feed delivered to mobile clients via GHA Gateway.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Device Frame Toggle */}
                <div className="bg-slate-800 p-1 rounded-lg flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewDeviceMode('iphone')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                      previewDeviceMode === 'iphone'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    iPhone 16
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDeviceMode('android')}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                      previewDeviceMode === 'android'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Pixel 9
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShow4CardPreview(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Phone Frame & Sidebar Breakdown */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-900 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center justify-center">
              {/* Interactive Phone Simulator */}
              <div className="lg:col-span-7 flex justify-center">
                <div
                  className={`w-[360px] h-[640px] bg-slate-950 rounded-[48px] p-3 shadow-2xl border-4 ${
                    previewDeviceMode === 'iphone'
                      ? 'border-slate-700 ring-1 ring-slate-600'
                      : 'border-slate-800 ring-1 ring-slate-700 rounded-[40px]'
                  } flex flex-col relative`}
                >
                  {/* Dynamic Island / Punch Hole */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
                    {previewDeviceMode === 'iphone' ? (
                      <div className="w-24 h-5 bg-black rounded-full border border-slate-800/60" />
                    ) : (
                      <div className="w-3.5 h-3.5 bg-black rounded-full border border-slate-800" />
                    )}
                  </div>

                  {/* Phone Screen Viewport */}
                  <div className="w-full h-full bg-slate-50 text-slate-900 rounded-[38px] overflow-hidden flex flex-col relative">
                    {/* Status Bar */}
                    <div className="h-10 px-6 flex items-center justify-between text-[11px] font-semibold text-slate-900 bg-white/80 backdrop-blur-xs select-none shrink-0 z-20">
                      <span>9:41</span>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        <span>5G</span>
                        <div className="w-5 h-2.5 border border-slate-900 rounded-xs p-0.5 flex items-center">
                          <div className="w-full h-full bg-slate-900 rounded-2xs" />
                        </div>
                      </div>
                    </div>

                    {/* App Bar */}
                    <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                          G
                        </div>
                        <div>
                          <div className="text-xs font-black tracking-tight text-slate-900 leading-none">
                            GLOBAL HEALTH
                          </div>
                          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none mt-0.5">
                            ACADEMY EVENTS
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        {publishedSections.length} Live Cards
                      </span>
                    </div>

                    {/* Category Filter Chips inside Phone */}
                    <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewFocusedCategory('ALL')}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                          previewFocusedCategory === 'ALL'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        ALL ({publishedSections.length})
                      </button>
                      {VERTICAL_SLOTS.map((catKey) => {
                        const hasPublished = publishedSections.some((p) => p.category === catKey);
                        return (
                          <button
                            key={catKey}
                            type="button"
                            onClick={() => setPreviewFocusedCategory(catKey)}
                            className={`px-2 py-1 text-[10px] font-bold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                              previewFocusedCategory === catKey
                                ? 'bg-slate-900 text-white'
                                : hasPublished
                                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                : 'bg-slate-100 text-slate-400 opacity-60'
                            }`}
                          >
                            {formatCategoryName(catKey)}
                          </button>
                        );
                      })}
                    </div>

                    {/* Scrollable Feed of 4 Published Cards */}
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
                      {publishedSections
                        .filter(
                          (sec) =>
                            previewFocusedCategory === 'ALL' || sec.category === previewFocusedCategory
                        )
                        .map((section) => {
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
                          const currImgIdx = previewCarouselIndices[section.id] || 0;
                          const activeImg = imgs[currImgIdx % imgs.length];

                          return (
                            <div
                              key={section.id}
                              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
                            >
                              {/* Card Image Banner & Carousel */}
                              <div className="aspect-video w-full relative bg-slate-900 overflow-hidden">
                                <ResilientSectionImage
                                  src={activeImg.previewUrl}
                                  alt={section.title}
                                  category={section.category}
                                />

                                {/* Carousel Controls if Multi-image */}
                                {imgs.length > 1 && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewCarouselIndices((prev) => ({
                                          ...prev,
                                          [section.id]:
                                            (currImgIdx - 1 + imgs.length) % imgs.length,
                                        }));
                                      }}
                                      className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90 cursor-pointer"
                                    >
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewCarouselIndices((prev) => ({
                                          ...prev,
                                          [section.id]: (currImgIdx + 1) % imgs.length,
                                        }));
                                      }}
                                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-mono">
                                      {currImgIdx + 1}/{imgs.length}
                                    </div>
                                  </>
                                )}

                                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-900/90 text-white border border-white/20">
                                    {formatCategoryName(section.category)}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/90 text-slate-900">
                                    {section.eventYear}
                                  </span>
                                </div>
                              </div>

                              {/* Card Content */}
                              <div className="p-3.5 space-y-2">
                                <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                                  {section.title}
                                </h4>
                                <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                                  {section.description}
                                </p>

                                <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100">
                                  {section.url ? (
                                    <button
                                      type="button"
                                      onClick={() => setInAppBrowserSection(section)}
                                      className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <span>Explore Event</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] font-mono text-slate-400 italic">
                                      Clinical Overview
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      {publishedSections.length === 0 && (
                        <div className="py-16 text-center text-slate-500 text-xs">
                          No cards currently published in the mobile feed.
                        </div>
                      )}
                    </div>

                    {/* In-Phone Browser Overlay */}
                    {inAppBrowserSection && (
                      <div className="absolute inset-0 bg-white z-40 flex flex-col">
                        <div className="px-3 py-2 bg-slate-900 text-white flex items-center justify-between text-xs shrink-0">
                          <div className="flex items-center gap-1.5 truncate text-[11px]">
                            <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="truncate">{inAppBrowserSection.url}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInAppBrowserSection(null)}
                            className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs text-slate-800">
                          <h3 className="font-bold text-sm text-slate-900">
                            {inAppBrowserSection.title}
                          </h3>
                          <p className="text-slate-600">{inAppBrowserSection.description}</p>
                          <div className="p-3 bg-slate-100 rounded-lg text-[11px] font-mono break-all">
                            Target Event Portal URL: {inAppBrowserSection.url}
                          </div>
                          <p className="text-[11px] text-slate-500 italic">
                            (In-App Browser loads this URL natively inside the mobile app webview wrapper)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar: 4-Vertical Architecture Breakdown */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      4 Published Cards Status
                    </span>
                    <span className="text-[11px] font-mono font-bold text-emerald-400">
                      {publishedSections.length} of 4 Slots Filled
                    </span>
                  </div>

                  <div className="space-y-2">
                    {VERTICAL_SLOTS.map((catKey, i) => {
                      const pub = getPublishedForVertical(catKey);
                      return (
                        <div
                          key={catKey}
                          onClick={() => setPreviewFocusedCategory(catKey)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            pub
                              ? 'bg-slate-900/90 border-slate-600 hover:border-emerald-400'
                              : 'bg-slate-900/40 border-slate-700/60 opacity-60'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">
                              {i + 1}. {formatCategoryName(catKey)}
                            </span>
                            {pub ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300">
                                {pub.eventYear}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-amber-400">
                                Vacant
                              </span>
                            )}
                          </div>
                          {pub && (
                            <p className="text-[11px] text-slate-400 truncate mt-1">
                              {pub.title}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-2 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Instant Real-Time Sync</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Changes made to the published records in the GHA Admin area update the Gateway endpoint{' '}
                    <code className="text-emerald-300 font-mono text-[10px]">
                      /api/v1/events/landing-sections/published
                    </code>{' '}
                    instantly for both iOS and Android clients.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SECTION 5: FULL RECORD DETAIL VIEW MODAL
         ========================================================================= */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full overflow-hidden shadow-xl my-8">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs font-mono text-slate-400">
                  MongoDB (event_db.landing_sections) · ID: {viewingRecord.id}
                </div>
                <h3 className="text-base font-semibold text-white truncate mt-0.5">
                  {viewingRecord.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Multi-Image Viewer */}
              {(() => {
                const imgs =
                  viewingRecord.images && viewingRecord.images.length > 0
                    ? viewingRecord.images
                    : [
                        {
                          blobPath: viewingRecord.imageBlobPath,
                          previewUrl: viewingRecord.imagePreviewUrl,
                          fileName: viewingRecord.imageFileName,
                          mimeType: viewingRecord.imageMimeType,
                          sizeBytes: viewingRecord.imageSizeBytes,
                        },
                      ];
                const safeIdx = viewingImageIndex < imgs.length ? viewingImageIndex : 0;
                const currentImg = imgs[safeIdx];

                return (
                  <div className="space-y-3">
                    <div className="aspect-video w-full rounded-xl overflow-hidden bg-slate-900 relative border border-slate-200">
                      <ResilientSectionImage
                        src={currentImg.previewUrl}
                        alt={viewingRecord.title}
                        category={viewingRecord.category}
                      />
                      <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded bg-black/75 text-white text-xs font-mono tabular-nums">
                        Image {safeIdx + 1} of {imgs.length}
                      </div>
                    </div>

                    {imgs.length > 1 && (
                      <div className="flex items-center gap-2 overflow-x-auto">
                        {imgs.map((img, i) => (
                          <button
                            key={img.blobPath + i}
                            type="button"
                            onClick={() => setViewingImageIndex(i)}
                            className={`w-20 h-12 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer ${
                              i === safeIdx
                                ? 'border-slate-900'
                                : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                          >
                            <ResilientSectionImage
                              src={img.previewUrl}
                              alt={img.fileName}
                              category={viewingRecord.category}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Metadata & Description */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 tabular-nums">
                  <span className="font-semibold text-slate-900">
                    Year: {viewingRecord.eventYear}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-slate-900">
                    Category: {formatCategoryName(viewingRecord.category)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      viewingRecord.published
                        ? 'text-emerald-700 font-semibold'
                        : 'text-amber-700 font-semibold'
                    }
                  >
                    {viewingRecord.published
                      ? `Published (Active ${formatCategoryName(viewingRecord.category)} Card on Mobile App)`
                      : 'Unpublished (Hidden from Mobile App)'}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {viewingRecord.description}
                </p>
                {viewingRecord.url && (
                  <div className="pt-1 flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-500 font-semibold">Redirect URL (In-App Browser):</span>
                    <a
                      href={viewingRecord.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 hover:underline inline-flex items-center gap-1 break-all"
                    >
                      <span>{viewingRecord.url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}
              </div>

              {/* Stored Blob Paths */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs font-mono">
                <div className="text-slate-500 font-semibold">
                  Stored Blob Store Paths in MongoDB (event_db):
                </div>
                {(viewingRecord.images || []).map((img, idx) => (
                  <div key={img.blobPath + idx} className="text-slate-800 break-all">
                    [{idx + 1}] {img.blobPath} ({(img.sizeBytes / 1024).toFixed(1)} KB)
                  </div>
                ))}
              </div>

              {/* Audit History Timeline */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-slate-700" />
                  <span>Publish, Unpublish &amp; Modification History Timeline</span>
                </h4>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
                  {(viewingRecord.history || []).map((h, i) => (
                    <div
                      key={h.id || i}
                      className="p-3.5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="font-mono font-semibold text-slate-900">
                          {h.action} ·{' '}
                          <span
                            className={
                              h.publishedState ? 'text-emerald-700' : 'text-amber-700'
                            }
                          >
                            State: {h.publishedState ? 'Published' : 'Unpublished'}
                          </span>
                        </div>
                        <div className="text-slate-600">{h.summary}</div>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                        {h.timestamp.replace('T', ' ').slice(0, 19)} UTC
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={async () => {
                  await handleInitiatePublish(viewingRecord);
                  await loadPaginatedData();
                }}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer ${
                  viewingRecord.published
                    ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {viewingRecord.published
                  ? 'Unpublish Record'
                  : `Re-Publish as Active ${formatCategoryName(viewingRecord.category)} Card`}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const rec = viewingRecord;
                    setViewingRecord(null);
                    onEditRecord(rec);
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit This Record</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingRecord(null)}
                  className="px-4 py-2 text-xs font-medium bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
