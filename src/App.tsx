import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BlobProviderType,
  DebugLogEntry,
  GhaGatewayConfigInfo,
  GhaProfile,
  LANDING_CATEGORIES,
  LandingCategory,
  LandingSectionRecord,
  PendingImageUpload,
  SectionImageAsset,
  UpsertLandingSectionPayload,
} from './types/gha';
import { GhaGatewayClientFactory } from './services/ghaGatewayService';
import { MobileLandingPreview } from './components/MobileLandingPreview';
import { JavaBackendInspector } from './components/JavaBackendInspector';
import { LandingRecordsListingPage } from './components/LandingRecordsListingPage';
import { ResilientSectionImage } from './components/ResilientSectionImage';
import { LiveSeaweedS3Tester } from './components/LiveSeaweedS3Tester';
import { FormLiveCardPreview } from './components/FormLiveCardPreview';
import {
  Plus,
  Upload,
  Database,
  HardDrive,
  RotateCcw,
  X,
  Terminal,
  Copy,
  Check,
  ArrowLeft,
  LayoutList,
  Sparkles,
} from 'lucide-react';

// When running locally on Mac (localhost / 127.0.0.1 / custom domain), only Landing Listing & AdminForm are shown.
// Advanced internal tabs (Storage & DB, Profiles & Java 17, SeaweedS3 tester) are retained for Google AI Studio preview.
const isAiStudioEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('aistudio') || host.includes('run.app') || window.location.search.includes('studio=true');
};

type ActiveWorkspaceTab =
  | 'admin-manager'
  | 'history-listing'
  | 'mobile-preview'
  | 'storage-db'
  | 'java-code';

export default function App() {
  const gatewayClient = GhaGatewayClientFactory.getClient();

  const isStudio = isAiStudioEnvironment();
  // By default, open Landing page which is the Listing page as requested
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('history-listing');
  const [gatewayConfig, setGatewayConfig] = useState<GhaGatewayConfigInfo | null>(null);
  const [adminSections, setAdminSections] = useState<LandingSectionRecord[]>([]);
  const [publishedSections, setPublishedSections] = useState<LandingSectionRecord[]>([]);
  const [recentLogs, setRecentLogs] = useState<DebugLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Admin Form State (Supports MULTIPLE images per vertical/category + Event Year + Optional Redirect URL)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState<LandingCategory>('CME');
  const [formEventYear, setFormEventYear] = useState<number>(2026);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formUrl, setFormUrl] = useState<string>('');
  const [formPublished, setFormPublished] = useState<boolean>(true);
  const [retainedImages, setRetainedImages] = useState<SectionImageAsset[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingImageUpload[]>([]);
  const [copyingSyncCmd, setCopyingSyncCmd] = useState<boolean>(false);
  const [copiedSyncCmd, setCopiedSyncCmd] = useState<boolean>(false);

  const handleCopyMacSyncCommand = async () => {
    setCopyingSyncCmd(true);
    try {
      const res = await fetch('/api/v1/events/export/local-sync-command');
      if (!res.ok) throw new Error('Failed to build sync command');
      const data = await res.json();
      await navigator.clipboard.writeText(data.command);
      setCopiedSyncCmd(true);
      showToast(
        'success',
        'Copied Mac Terminal Sync Command! Paste (Cmd+V) in your Mac terminal to extract directly into /Users/jayakumar/project/gha/mobile-app/code'
      );
      setTimeout(() => setCopiedSyncCmd(false), 3000);
    } catch {
      showToast('error', 'Failed to copy sync command');
    } finally {
      setCopyingSyncCmd(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formContainerRef = useRef<HTMLDivElement | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, allAdmin, pubOnly, logsData] = await Promise.all([
        gatewayClient.getGatewayConfig(),
        gatewayClient.getAllAdminSections(),
        gatewayClient.getPublishedMobileSections(),
        gatewayClient.getDebugLogs(),
      ]);
      setGatewayConfig(cfg);
      setAdminSections(allAdmin);
      setPublishedSections(pubOnly);
      setRecentLogs(logsData.slice(0, 10));
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to synchronize with GHA Gateway / GHA Event Service');
    } finally {
      setLoading(false);
    }
  }, [gatewayClient]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const resetForm = () => {
    setEditingId(null);
    setFormCategory('CME');
    setFormEventYear(2026);
    setFormTitle('');
    setFormDescription('');
    setFormUrl('');
    setFormPublished(true);
    setRetainedImages([]);
    setPendingUploads([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectSectionForEdit = async (section: LandingSectionRecord) => {
    setActiveTab('admin-manager');
    let latest = section;
    try {
      latest = await gatewayClient.getSectionById(section.id);
    } catch {
      // fallback to passed section
    }
    setEditingId(latest.id);
    setFormCategory(latest.category);
    setFormEventYear(latest.eventYear || 2026);
    setFormTitle(latest.title);
    setFormDescription(latest.description);
    setFormUrl(latest.url || '');
    setFormPublished(latest.published);
    setRetainedImages(
      latest.images && latest.images.length > 0
        ? [...latest.images]
        : [
            {
              blobPath: latest.imageBlobPath,
              previewUrl: latest.imagePreviewUrl,
              fileName: latest.imageFileName,
              mimeType: latest.imageMimeType,
              sizeBytes: latest.imageSizeBytes,
            },
          ]
    );
    setPendingUploads([]);
    setTimeout(() => {
      formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleMultiImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray: File[] = Array.from(fileList);
    const readPromises = filesArray.map(
      (file) =>
        new Promise<PendingImageUpload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              fileName: file.name,
              mimeType: file.type || 'image/jpeg',
              sizeBytes: file.size,
              base64Data: dataUrl,
              previewUrl: dataUrl,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    );

    try {
      const loadedUploads = await Promise.all(readPromises);
      setPendingUploads((prev) => [...prev, ...loadedUploads]);
    } catch {
      showToast('error', 'Failed to read one or more selected image files.');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveRetainedImage = (blobPathToRemove: string) => {
    setRetainedImages((prev) => prev.filter((img) => img.blobPath !== blobPathToRemove));
  };

  const handleRemovePendingUpload = (idToRemove: string) => {
    setPendingUploads((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescription.trim()) {
      showToast('error', 'Please enter a description for the mobile landing page section.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: UpsertLandingSectionPayload = {
        category: formCategory,
        eventYear: Number(formEventYear) || 2026,
        title:
          formTitle.trim() ||
          `${formCategory === 'AHS' ? 'Course / AHS' : formCategory} Clinical Section (${formEventYear})`,
        description: formDescription.trim(),
        url: formUrl.trim(),
        published: formPublished,
        retainedImages,
        uploadedImages: pendingUploads.map((u) => ({
          fileName: u.fileName,
          mimeType: u.mimeType,
          sizeBytes: u.sizeBytes,
          base64Data: u.base64Data,
        })),
      };

      if (editingId) {
        const updated = await gatewayClient.updateLandingSection(editingId, payload);
        showToast(
          'success',
          `Updated ${updated.category} (${updated.eventYear}) record in event.landing_sections · ${
            updated.published
              ? 'Published as active category card on Mobile App (4-Card Rule)'
              : 'Unpublished'
          }`
        );
      } else {
        const created = await gatewayClient.createLandingSection(payload);
        showToast(
          'success',
          `Saved ${created.category} (${created.eventYear}) section with ${created.images.length} image(s) to event.landing_sections`
        );
      }

      await fetchAllData();
      resetForm();
    } catch (err: unknown) {
      console.error('[GHA-ADMIN-ERROR] Failed to save landing section:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save landing section';
      showToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePublish = async (section: LandingSectionRecord) => {
    const nextPublished = !section.published;
    try {
      await gatewayClient.togglePublishStatus(section.id, nextPublished);
      showToast(
        'success',
        `${section.category} (${section.eventYear}) "${section.title}" is now ${
          nextPublished
            ? `PUBLISHED as the active ${section.category} card on Mobile Landing Page (any previous ${section.category} card was auto-unpublished)`
            : 'UNPUBLISHED (Removed from Mobile Landing Page)'
        }`
      );
      await fetchAllData();
      if (editingId === section.id) {
        setFormPublished(nextPublished);
      }
    } catch {
      showToast('error', 'Failed to toggle publish status via GHA Gateway');
    }
  };

  const handleDeleteSection = async (section: LandingSectionRecord) => {
    try {
      await gatewayClient.deleteLandingSection(section.id);
      showToast(
        'success',
        `Deleted ${section.category} (${section.eventYear}) section from event.landing_sections`
      );
      if (editingId === section.id) {
        resetForm();
      }
      await fetchAllData();
    } catch {
      showToast('error', 'Failed to delete section');
    }
  };

  const handleSwitchProfile = async (profile: GhaProfile) => {
    try {
      const res = await gatewayClient.switchProfile(profile);
      showToast('success', res.message);
      await fetchAllData();
    } catch {
      showToast('error', 'Failed to switch Spring Boot profile');
    }
  };

  const handleUpdateBlobBasePath = async (
    newPath: string,
    provider?: BlobProviderType
  ) => {
    await gatewayClient.updateBlobStoreBasePath(newPath, provider);
    await fetchAllData();
  };

  const configuredBasePath =
    gatewayConfig?.blobStoreBasePath || './local-gha-blobs/dev/landing-sections';

  const plannedBlobPaths: string[] = [
    ...retainedImages.map((img) => img.blobPath),
    ...pendingUploads.map((u) => {
      const safe = u.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      return `${configuredBasePath}/${formCategory.toLowerCase()}/<timestamp>_${safe}`;
    }),
  ];

  if (plannedBlobPaths.length === 0) {
    plannedBlobPaths.push(
      `${configuredBasePath}/${formCategory.toLowerCase()}/<timestamp>_${formCategory.toLowerCase()}_default_banner.jpg`
    );
  }

  const totalImagesInForm = retainedImages.length + pendingUploads.length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('history-listing');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap hover:opacity-80 transition-opacity"
          >
            GHA Conference Admin
          </a>
          {!isStudio && (
            <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
              Local Mode
            </span>
          )}
        </div>

        {/* Zone 2: Navigation Links (Clean: Landing Page Sections + Admin Form locally; internal tabs preserved in AI Studio) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('history-listing')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history-listing'
                ? 'text-slate-900 underline underline-offset-8 decoration-2 font-bold'
                : ''
            }`}
          >
            <LayoutList className="w-4 h-4" />
            <span>Landing Page Sections ({adminSections.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setActiveTab('admin-manager');
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'admin-manager'
                ? 'text-slate-900 underline underline-offset-8 decoration-2 font-bold'
                : ''
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>{editingId ? `Edit Section (${formCategory})` : 'Create Mobile Landing Page'}</span>
          </button>

          {/* Studio tabs only visible inside Google AI Studio preview */}
          {isStudio && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('mobile-preview')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'mobile-preview'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2'
                    : ''
                }`}
              >
                Full Mobile App
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('storage-db')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'storage-db'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2'
                    : ''
                }`}
              >
                Local Storage &amp; DB
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('java-code')}
                className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'java-code'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2'
                    : ''
                }`}
              >
                Profiles &amp; Java 17
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: 2 primary actions (Copy Mac Sync Command + Create Mobile Landing Page) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleCopyMacSyncCommand}
            disabled={copyingSyncCmd}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-100 border border-emerald-300 rounded-lg hover:bg-emerald-200 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
            title="Copies a terminal command to extract service/, ui/admin/, and ui/app/ directly into /Users/jayakumar/project/gha/mobile-app/code"
          >
            {copiedSyncCmd ? (
              <Check className="w-3.5 h-3.5 text-emerald-800" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-emerald-800" />
            )}
            <span>
              {copiedSyncCmd
                ? 'Copied!'
                : copyingSyncCmd
                ? 'Preparing...'
                : 'Copy Mac Sync Command'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setActiveTab('admin-manager');
              formContainerRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Mobile Landing Page</span>
          </button>
        </div>
      </header>

      {/* Mobile Viewport Navigation Strip */}
      <div className="flex md:hidden items-center gap-1 px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('history-listing')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
            activeTab === 'history-listing'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Landing Sections ({adminSections.length})
        </button>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setActiveTab('admin-manager');
          }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
            activeTab === 'admin-manager'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {editingId ? 'Edit Section' : '+ Create Mobile Landing Page'}
        </button>
        {isStudio && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('mobile-preview')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                activeTab === 'mobile-preview'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mobile App
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('storage-db')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                activeTab === 'storage-db'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Storage &amp; DB
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('java-code')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer ${
                activeTab === 'java-code'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Profiles
            </button>
          </>
        )}
      </div>

      {/* Main Desktop Viewport (1440px Baseline Container) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8">
        {/* Architecture, Active Spring Profile (dev/qa/prod) & Gateway Context Bar */}
        <div className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500 mb-1">
              <span>Nginx Proxy</span>
              <span aria-hidden="true">/</span>
              <span>GHA Gateway (:8080)</span>
              <span aria-hidden="true">/</span>
              <span>GHA Event Service (:8082)</span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-900 font-semibold">
                MongoDB ({gatewayConfig?.mongoDatabase || 'event'}.{gatewayConfig?.mongoCollection || 'landing_sections'})
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-semibold">
                {gatewayConfig?.blobProvider === 'local-fs'
                  ? 'Local Disk Blob Store'
                  : 'SeaweedFS Blob Store'}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Mobile Landing Page Administration &amp; History
            </h1>
          </div>

          {/* Interactive 3-Profile Selector (dev, qa, prod) + Summary Stats */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
              {(['dev', 'qa', 'prod'] as const).map((prof) => {
                const active = (gatewayConfig?.activeProfile || 'dev') === prof;
                return (
                  <button
                    key={prof}
                    type="button"
                    onClick={() => handleSwitchProfile(prof)}
                    className={`px-3 py-1 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {prof.toUpperCase()}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
              <div>
                <span className="text-slate-400">Published: </span>
                <span className="font-semibold text-emerald-700">
                  {publishedSections.length}
                </span>
              </div>
              <span aria-hidden="true">·</span>
              <div>
                <span className="text-slate-400">Unpublished: </span>
                <span className="font-semibold text-amber-700">
                  {Math.max(0, adminSections.length - publishedSections.length)}
                </span>
              </div>
              <span aria-hidden="true">·</span>
              <div>
                <span className="text-slate-400">Total: </span>
                <span className="font-semibold text-slate-900">
                  {adminSections.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Toast Feedback Banner */}
        {feedbackBanner && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg border text-sm flex items-center justify-between ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <span>{feedbackBanner.message}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs font-mono underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: ADMIN FORM FOR CREATION / EDITING WITH LIVE RIGHT-SIDE PREVIEW */}
        {activeTab === 'admin-manager' && (
          <div className="space-y-6">
            {/* Top Navigation Back to Landing Sections Listing */}
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setActiveTab('history-listing');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Landing Page Sections</span>
              </button>

              <div className="text-xs font-mono text-slate-500">
                Target Collection:{' '}
                <span className="font-semibold text-slate-900">
                  {gatewayConfig?.mongoDatabase || 'event'}.{gatewayConfig?.mongoCollection || 'landing_sections'}
                </span>
              </div>
            </div>

            {/* Seaweed S3 Diagnostics (Studio only) */}
            {isStudio && (
              <LiveSeaweedS3Tester
                refreshTrigger={refreshTrigger}
                onUploadSuccess={(msg) => {
                  showToast('success', msg);
                  fetchAllData();
                }}
              />
            )}

            {/* 2-Column Responsive Form & Live Preview: Form (Left 7 cols) & Card Preview (Right 5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Admin Form */}
              <div className="lg:col-span-7 space-y-6" ref={formContainerRef}>
                <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
                  <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        {editingId
                          ? `Edit Mobile Landing Section (${editingId})`
                          : 'Create Mobile Landing Page Section'}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {editingId
                          ? 'Modifying any field or image updates the record in MongoDB (event.landing_sections) when you click Save.'
                          : 'Configure category, event year, description, multiple images, optional URL, and publish state.'}
                      </p>
                    </div>
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => resetForm()}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cancel Edit</span>
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleFormSubmit} className="space-y-6">
                    {/* Category Selection (CME, GSI, Course / AHS, Conference) */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-2">
                        1. Select Category / Vertical
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {LANDING_CATEGORIES.map((cat) => {
                          const isSelected = formCategory === cat.code;
                          return (
                            <button
                              key={cat.code}
                              type="button"
                              onClick={() => setFormCategory(cat.code)}
                              className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold tracking-tight">
                                  {cat.shortLabel}
                                </span>
                                <span
                                  className={`text-[10px] font-mono ${
                                    isSelected ? 'text-emerald-300' : 'text-slate-400'
                                  }`}
                                >
                                  {cat.code}
                                </span>
                              </div>
                              <p
                                className={`text-[10px] mt-1 line-clamp-1 ${
                                  isSelected ? 'text-slate-300' : 'text-slate-500'
                                }`}
                              >
                                {cat.fullName}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section Title & Event Year */}
                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
                      <div className="sm:col-span-4">
                        <label
                          htmlFor="section-title-input"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          2. Section Heading / Title
                        </label>
                        <input
                          id="section-title-input"
                          type="text"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder={`e.g., ${
                            formCategory === 'AHS'
                              ? 'Course / AHS Laparoscopic Masterclass'
                              : `${formCategory} Clinical Section`
                          }`}
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label
                          htmlFor="section-year-select"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          Event Year
                        </label>
                        <select
                          id="section-year-select"
                          value={formEventYear}
                          onChange={(e) => setFormEventYear(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                        >
                          {[2027, 2026, 2025, 2024, 2023, 2022].map((yr) => (
                            <option key={yr} value={yr}>
                              {yr}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Section Description Text Field */}
                    <div>
                      <label
                        htmlFor="section-description-input"
                        className="block text-xs font-semibold text-slate-800 mb-1.5"
                      >
                        3. Section Description (Rendered on Mobile Card) *
                      </label>
                      <textarea
                        id="section-description-input"
                        rows={3}
                        required
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Describe the medical conference section, accreditation credits, course eligibility, or clinical highlights..."
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900 leading-relaxed"
                      />
                    </div>

                    {/* Optional Section Redirect URL Field */}
                    <div>
                      <label
                        htmlFor="section-url-input"
                        className="block text-xs font-semibold text-slate-800 mb-1.5"
                      >
                        4. Redirect URL (Optional — In-App Browser Link)
                      </label>
                      <input
                        id="section-url-input"
                        type="url"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="Optional: https://events.globalhealthacademy.org/... (leave blank if no link)"
                        className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        When provided, tapping the section banner on the mobile app opens this link in the in-app browser.
                      </p>
                    </div>

                    {/* Multiple Image Upload + Paths */}
                    <div className="space-y-4 pt-1">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <label className="block text-xs font-semibold text-slate-800">
                          5. Section Images (Multiple Images Supported)
                        </label>
                        <span className="text-xs font-mono text-slate-500 tabular-nums">
                          {totalImagesInForm > 0
                            ? `${totalImagesInForm} image(s) attached`
                            : 'Default category banner used if none uploaded'}
                        </span>
                      </div>

                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed border-slate-300 hover:border-slate-900 bg-slate-50 rounded-lg p-4 cursor-pointer transition-colors flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-white border border-slate-200 rounded-lg shrink-0">
                            <Upload className="w-4 h-4 text-slate-700" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900">
                              Upload one or multiple images (JPG, PNG, WebP)
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Supports multiple banners with in-card swipe/carousel on mobile.
                            </p>
                          </div>
                        </div>
                        <span className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-md text-slate-800 shrink-0">
                          + Add Images
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleMultiImageFileSelect}
                          className="hidden"
                        />
                      </div>

                      {/* Multi-Image Thumbnail Strip */}
                      {(retainedImages.length > 0 || pendingUploads.length > 0) && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {retainedImages.map((img, idx) => (
                            <div
                              key={img.blobPath + idx}
                              className="border border-slate-200 rounded-lg overflow-hidden bg-white relative group"
                            >
                              <div className="aspect-video bg-slate-900">
                                <ResilientSectionImage
                                  src={img.previewUrl}
                                  alt={img.fileName}
                                  category={formCategory}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveRetainedImage(img.blobPath)}
                                title="Remove image"
                                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/75 text-white hover:bg-red-600 transition-colors cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                              <div className="p-1.5 text-[10px] font-mono">
                                <div className="text-slate-900 font-semibold truncate">
                                  #{idx + 1} {img.fileName}
                                </div>
                                <div className="text-emerald-700">Stored in Blob Store</div>
                              </div>
                            </div>
                          ))}

                          {pendingUploads.map((up, idx) => {
                            const orderNum = retainedImages.length + idx + 1;
                            return (
                              <div
                                key={up.id}
                                className="border border-slate-300 rounded-lg overflow-hidden bg-white relative group"
                              >
                                <div className="aspect-video bg-slate-900">
                                  <ResilientSectionImage
                                    src={up.previewUrl}
                                    alt={up.fileName}
                                    category={formCategory}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePendingUpload(up.id)}
                                  title="Remove upload"
                                  className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/75 text-white hover:bg-red-600 transition-colors cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                <div className="p-1.5 text-[10px] font-mono">
                                  <div className="text-slate-900 font-semibold truncate">
                                    #{orderNum} {up.fileName}
                                  </div>
                                  <div className="text-amber-700">
                                    New ({(up.sizeBytes / 1024).toFixed(1)} KB)
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Stored Blob Paths info */}
                      <div className="p-3 bg-slate-100 rounded-lg text-[11px] font-mono text-slate-700 space-y-1">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Target Storage:</span>
                          <span>event.landing_sections.images[]</span>
                        </div>
                        <div className="space-y-0.5 max-h-24 overflow-y-auto text-slate-900 font-medium">
                          {plannedBlobPaths.map((p, idx) => (
                            <div key={p + idx} className="truncate">
                              [{idx + 1}] {p}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Publish Control + Form Actions */}
                    <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={formPublished}
                          onClick={() => setFormPublished((prev) => !prev)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                            formPublished ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                              formPublished ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <div>
                          <span className="text-xs font-semibold text-slate-900 block">
                            {formPublished
                              ? `Publish State: PUBLISHED (Live ${formCategory} Card on Mobile App)`
                              : 'Publish State: UNPUBLISHED (Saved to History — Hidden from Mobile App)'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            4-Card Rule: Publishing sets this as active card for {formCategory} (auto-unpublishes older {formCategory} cards).
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => resetForm()}
                          className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Reset
                        </button>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="px-6 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 shadow-xs"
                        >
                          {submitting ? 'Saving...' : editingId ? 'Update Section' : 'Save Section'}
                        </button>
                      </div>
                    </div>
                  </form>
                </section>

                {/* Debug log feed only in AI Studio */}
                {isStudio && (
                  <section className="bg-slate-950 text-slate-200 rounded-xl p-5 font-mono text-xs">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-emerald-400" />
                        <span className="font-semibold text-white">
                          GHA Event Service Debug Logs (profile={gatewayConfig?.activeProfile || 'dev'})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('java-code')}
                        className="text-xs text-sky-400 hover:underline cursor-pointer"
                      >
                        Profiles &amp; Full Logs →
                      </button>
                    </div>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {recentLogs.map((l) => (
                        <div key={l.id} className="truncate">
                          <span className="text-slate-500">{l.timestamp.slice(11, 23)}</span>{' '}
                          <span className="text-sky-400">[{l.profile}]</span>{' '}
                          <span className="text-slate-400">[{l.correlationId}]</span>{' '}
                          <span
                            className={
                              l.level === 'ERROR'
                                ? 'text-red-400'
                                : l.level === 'WARN'
                                ? 'text-amber-300'
                                : l.level === 'INFO'
                                ? 'text-emerald-400'
                                : 'text-purple-300'
                            }
                          >
                            {l.level}
                          </span>{' '}
                          <span>{l.message}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Right Column: PREVIEW ON RIGHT SIDE OF THE FORM (NOT BELOW) */}
              <div className="lg:col-span-5">
                <FormLiveCardPreview
                  category={formCategory}
                  eventYear={formEventYear}
                  title={formTitle}
                  description={formDescription}
                  url={formUrl}
                  published={formPublished}
                  retainedImages={retainedImages}
                  pendingUploads={pendingUploads}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRIMARY LANDING PAGE SECTIONS LISTING (DEFAULT PAGE) */}
        {activeTab === 'history-listing' && (
          <LandingRecordsListingPage
            onEditRecord={handleSelectSectionForEdit}
            onTogglePublish={handleTogglePublish}
            onDeleteRecord={handleDeleteSection}
            onCreateClick={() => {
              resetForm();
              setActiveTab('admin-manager');
            }}
            refreshTrigger={refreshTrigger}
          />
        )}

        {/* TAB 3: DEDICATED MOBILE APP LANDING PAGE VIEW */}
        {activeTab === 'mobile-preview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5">
              <MobileLandingPreview
                publishedSections={publishedSections}
                totalAdminCount={adminSections.length}
                loading={loading}
                onRefresh={fetchAllData}
                onSelectForEdit={handleSelectSectionForEdit}
              />
            </div>
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Mobile Landing Page Multi-Image &amp; Publish State Contract
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  The Mobile App queries{' '}
                  <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                    GET /api/v1/events/landing-sections/published
                  </code>{' '}
                  through <strong>GHA Gateway</strong>. Only records with{' '}
                  <code className="font-mono text-xs">published: true</code> appear on the Mobile App Landing Page.
                </p>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-xs font-semibold text-slate-700 mb-1">
                  4-Card Rule &amp; Historical Re-Publish Matrix ({adminSections.length} Total in event.landing_sections)
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  At most 4 cards (1 per category: CME, GSI, Course / AHS, Conference) are live at any point. Pick any older unpublished record below and click <strong>Re-Publish</strong> to make it the active card for its category.
                </p>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-[520px] overflow-y-auto">
                  {adminSections.map((sec) => (
                    <div
                      key={sec.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-slate-500">
                          {sec.eventYear} · {sec.category === 'AHS' ? 'Course / AHS' : sec.category} ·{' '}
                          {sec.images?.length || 1} Image(s)
                        </div>
                        <div className="font-semibold text-slate-900 truncate">
                          {sec.title}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(sec)}
                        className={`px-3 py-1.5 font-semibold rounded-md shrink-0 cursor-pointer transition-colors ${
                          sec.published
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {sec.published
                          ? 'Active Published (Click to Unpublish)'
                          : `Re-Publish as Active ${sec.category} Card`}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LOCAL STORAGE & MONGODB (event_db) INSPECTOR */}
        {activeTab === 'storage-db' && (
          <div className="space-y-6">
            <LiveSeaweedS3Tester
              refreshTrigger={refreshTrigger}
              onUploadSuccess={(msg) => {
                showToast('success', msg);
                fetchAllData();
              }}
            />
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">
                How Local Storage Works (Local File System vs. SeaweedFS Container)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="font-mono font-semibold text-slate-900">
                    Option A: Local Disk Folder (dev profile)
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Set <code className="font-mono">SPRING_PROFILES_ACTIVE=dev</code> (or{' '}
                    <code className="font-mono">gha.blob-store.provider=local-fs</code>) and{' '}
                    <code className="font-mono">GHA_BLOB_STORE_PATH=/Users/you/gha-blobs</code>.{' '}
                    <code className="font-mono">LocalFileSystemBlobStorageAdapter</code> writes all uploaded images directly into that folder on your laptop/PC and saves the file paths in MongoDB (<code className="font-mono">event_db</code>).
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="font-mono font-semibold text-slate-900">
                    Option B: Local Podman + SeaweedFS (qa/prod)
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Run <code className="font-mono">podman-compose -f backend-java/podman-compose.yml up -d</code>. Set{' '}
                    <code className="font-mono">SPRING_PROFILES_ACTIVE=qa</code> or <code className="font-mono">prod</code>.{' '}
                    <code className="font-mono">SeaweedFsBlobStorageAdapter</code> streams images to SeaweedFS Filer (<code className="font-mono">:8888</code>) backed by a persistent local Podman volume (<code className="font-mono">gha-seaweed-data</code>).
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="font-mono font-semibold text-slate-900">
                    Option C: Save Full Codebase Locally
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Click the <strong>Download</strong> button in the top AI Studio toolbar (or sync to GitHub) to save the entire project—including <code className="font-mono">/backend-java/</code> and the React Desktop app—directly onto your local machine.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <Database className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-semibold text-slate-900">
                    MongoDB Database: {gatewayConfig?.mongoDatabase || 'event'} (Collection: landing_sections)
                  </h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  Collection <code className="font-mono">landing_sections</code> stores the section description, category, <code className="font-mono">event_year</code>, publish state, <code className="font-mono">history[]</code>, and <code className="font-mono">images[]</code>.
                </p>
                <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto max-h-[420px]">
                  <code>
                    {JSON.stringify(
                      adminSections.map((s) => ({
                        _id: s.id,
                        category: s.category,
                        event_year: s.eventYear,
                        title: s.title,
                        description: s.description,
                        url: s.url,
                        images: s.images?.map((i) => ({
                          blob_path: i.blobPath,
                          file_name: i.fileName,
                          size_bytes: i.sizeBytes,
                        })),
                        image_blob_path: s.imageBlobPath,
                        published: s.published,
                        created_at: s.createdAt,
                        updated_at: s.updatedAt,
                      })),
                      null,
                      2
                    )}
                  </code>
                </pre>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <HardDrive className="w-5 h-5 text-slate-800" />
                  <h2 className="text-base font-semibold text-slate-900">
                    Stored Multi-Image Blob Paths ({gatewayConfig?.blobProvider || 'local-fs'})
                  </h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  Active profile <code className="font-mono">{gatewayConfig?.activeProfile}</code> base path:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {gatewayConfig?.blobStoreBasePath}
                  </span>
                </p>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-[420px] overflow-y-auto">
                  {adminSections.map((s) => (
                    <div key={s.id} className="p-3.5 text-xs font-mono space-y-1.5">
                      <div className="flex items-center justify-between text-slate-500">
                        <span className="font-semibold text-slate-900">
                          [{s.eventYear} · {s.category}] {s.title}
                        </span>
                        <span>{s.images?.length || 1} image(s)</span>
                      </div>
                      {(s.images || []).map((img, i) => (
                        <div key={img.blobPath + i} className="text-emerald-800 break-all">
                          [{i + 1}] {img.blobPath} ({(img.sizeBytes / 1024).toFixed(1)} KB)
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PROFILES (dev/qa/prod), DEBUG LOGS & JAVA 17 CODEBASE */}
        {activeTab === 'java-code' && (
          <JavaBackendInspector
            gatewayConfig={gatewayConfig}
            onSwitchProfile={handleSwitchProfile}
            onUpdateBlobBasePath={handleUpdateBlobBasePath}
          />
        )}
      </main>
    </div>
  );
}
