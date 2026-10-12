import React, { useCallback, useEffect, useState } from 'react';
import {
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
  Search,
  History,
  X,
  Calendar,
  Images,
  ExternalLink,
  Plus,
} from 'lucide-react';

interface LandingRecordsListingPageProps {
  onEditRecord: (record: LandingSectionRecord) => void;
  onTogglePublish: (record: LandingSectionRecord) => Promise<void>;
  onDeleteRecord: (record: LandingSectionRecord) => Promise<void>;
  onCreateClick?: () => void;
  refreshTrigger: number;
}

const PAGE_SIZE = 10;

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
  const [loading, setLoading] = useState<boolean>(true);

  // View Modal State
  const [viewingRecord, setViewingRecord] = useState<LandingSectionRecord | null>(null);
  const [viewingImageIndex, setViewingImageIndex] = useState<number>(0);

  const loadPaginatedData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await gatewayClient.getPaginatedListing({
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
      });
      setPageData(response);
      // Update viewingRecord if currently open
      if (viewingRecord) {
        const updatedInPage = response.content.find((r) => r.id === viewingRecord.id);
        if (updatedInPage) {
          setViewingRecord(updatedInPage);
        }
      }
    } catch (err) {
      console.error('Failed to load paginated listing:', err);
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

  const handleYearChange = (year?: number) => {
    setSelectedYear(year);
    setPage(0);
  };

  const handlePublishFilterChange = (next: 'ALL' | 'PUBLISHED' | 'UNPUBLISHED') => {
    setPublishFilter(next);
    setPage(0);
  };

  const handleCategoryFilterChange = (next: 'ALL' | LandingCategory) => {
    setCategoryFilter(next);
    setPage(0);
  };

  const startRecordNum =
    pageData.totalElements === 0 ? 0 : pageData.page * PAGE_SIZE + 1;
  const endRecordNum = Math.min(
    pageData.totalElements,
    (pageData.page + 1) * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      {/* Paginated Records Table (10 records per page) */}
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
                      className="hover:bg-slate-50/90 transition-colors align-top"
                    >
                      {/* Column 1: Year & Category */}
                      <td className="py-4 px-4 whitespace-nowrap font-mono tabular-nums">
                        <div className="text-sm font-normal text-slate-800">
                          {record.eventYear}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {record.category === 'AHS' ? 'Course / AHS' : record.category}
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
                              className="text-sm font-normal text-slate-900 hover:underline cursor-pointer line-clamp-1"
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
                            className={`text-xs font-mono font-semibold ${
                              record.published ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {record.published
                              ? `Published (Active ${record.category} Card)`
                              : 'Unpublished (History)'}
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await onTogglePublish(record);
                              await loadPaginatedData();
                            }}
                            title={
                              record.published
                                ? 'Unpublish this record from the Mobile Landing Page'
                                : `Re-Publish this ${record.eventYear} ${record.category} record (automatically unpublishes any other active ${record.category} card)`
                            }
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer ${
                              record.published
                                ? 'bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
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
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="View full record details by MongoDB _id"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onEditRecord(record)}
                            className="px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
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
                            className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer"
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

        {/* Pagination Footer (10 records per page) */}
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

      {/* Record View & Full History Modal */}
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
                    Category: {viewingRecord.category === 'AHS' ? 'Course / AHS' : viewingRecord.category}
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
                      ? `Published (Active ${viewingRecord.category} Card on Mobile App)`
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

              {/* Chronological Publish / Unpublish / Update Audit History */}
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
                  await onTogglePublish(viewingRecord);
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
                  : `Re-Publish as Active ${viewingRecord.category} Card`}
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
