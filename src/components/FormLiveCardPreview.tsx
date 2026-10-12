import React, { useState } from 'react';
import { LandingCategory, SectionImageAsset, PendingImageUpload } from '../types/gha';
import { ResilientSectionImage } from './ResilientSectionImage';
import {
  Smartphone,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Images,
  Globe,
  Sparkles,
  Layers,
} from 'lucide-react';

interface FormLiveCardPreviewProps {
  category: LandingCategory;
  eventYear: number;
  title: string;
  description: string;
  url: string;
  published: boolean;
  retainedImages: SectionImageAsset[];
  pendingUploads: PendingImageUpload[];
}

export const FormLiveCardPreview: React.FC<FormLiveCardPreviewProps> = ({
  category,
  eventYear,
  title,
  description,
  url,
  published,
  retainedImages,
  pendingUploads,
}) => {
  const [activeImageIdx, setActiveImageIdx] = useState<number>(0);

  // Combine retained images and pending uploads into single preview list
  const previewImages: Array<{
    id: string;
    previewUrl?: string;
    fileName: string;
    isPending?: boolean;
    sizeKb?: number;
  }> = [
    ...retainedImages.map((img, i) => ({
      id: `retained-${i}-${img.blobPath}`,
      previewUrl: img.previewUrl,
      fileName: img.fileName,
      isPending: false,
    })),
    ...pendingUploads.map((u) => ({
      id: u.id,
      previewUrl: u.previewUrl,
      fileName: u.fileName,
      isPending: true,
      sizeKb: Math.round(u.sizeBytes / 1024),
    })),
  ];

  const totalImages = previewImages.length;
  const safeIdx = totalImages > 0 ? (activeImageIdx % totalImages + totalImages) % totalImages : 0;
  const currentImage = totalImages > 0 ? previewImages[safeIdx] : null;

  const displayTitle =
    title.trim() ||
    (category === 'AHS'
      ? `Course / AHS Clinical Section (${eventYear})`
      : `${category} Clinical Section (${eventYear})`);

  const displayDesc =
    description.trim() ||
    'Provide a section description in the form to see how it renders on the mobile app landing card...';

  const categoryColorClass =
    category === 'CME'
      ? 'bg-blue-600 text-white'
      : category === 'GSI'
      ? 'bg-emerald-600 text-white'
      : category === 'AHS'
      ? 'bg-purple-600 text-white'
      : 'bg-amber-600 text-white';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs sticky top-24 space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-slate-700" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Live Mobile Card Preview
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {published ? '● PUBLISHED' : '○ DRAFT'}
          </span>
        </div>
      </div>

      {/* Phone Screen Mockup Container (Lengthy 650px with vertical scrollbar) */}
      <div className="w-full max-w-[360px] mx-auto bg-slate-900 rounded-[2.5rem] p-3.5 shadow-2xl border-4 border-slate-800 flex flex-col h-[650px]">
        {/* Dynamic Island / Speaker notch */}
        <div className="w-24 h-4 bg-slate-950 rounded-full mx-auto mb-2 flex items-center justify-center shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
        </div>

        {/* Mobile Status Bar */}
        <div className="bg-slate-900 text-white px-3 pb-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400 shrink-0">
          <span>09:41</span>
          <span className="tracking-widest">GHA MOBILE</span>
          <span>100% ⚡</span>
        </div>

        {/* In-App Mobile Header */}
        <div className="bg-slate-900 text-white px-3.5 py-2 border-b border-slate-800 shrink-0">
          <div className="text-xs font-bold text-white tracking-wide">
            Global Health Academy
          </div>
          <div className="text-[10px] text-slate-400">
            Mobile Landing Feed
          </div>
        </div>

        {/* Mobile Viewport Screen — Lengthy with Vertical Scroll Bar */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-3 space-y-3 rounded-b-[1.5rem] select-none">
          {/* Active Live Mobile Section Card */}
          <div className="bg-white rounded-2xl overflow-hidden border border-slate-200/90 shadow-sm">
            {/* Card Top: Banner Image or Carousel (Clean image without overlay covering it) */}
            <div className="relative aspect-[16/9] bg-slate-900 overflow-hidden select-none">
              <ResilientSectionImage
                src={currentImage?.previewUrl}
                alt={displayTitle}
                category={category}
              />

              {/* Category badge overlay */}
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-20">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide shadow-xs ${categoryColorClass}`}>
                  {category === 'AHS' ? 'Course / AHS' : category}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono">
                  {eventYear}
                </span>
              </div>

              {/* Multi-image carousel controls & badge */}
              {totalImages > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveImageIdx((prev) => (prev - 1 + totalImages) % totalImages)}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-colors cursor-pointer z-20"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveImageIdx((prev) => (prev + 1) % totalImages)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center transition-colors cursor-pointer z-20"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <div className="absolute bottom-2 right-2.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-mono flex items-center gap-1 z-20">
                    <Images className="w-2.5 h-2.5" />
                    <span>
                      {safeIdx + 1}/{totalImages}
                    </span>
                  </div>
                </>
              )}

              {/* Redirect URL indicator chip */}
              {url.trim() && (
                <div className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded bg-emerald-600/90 text-white text-[9px] font-medium flex items-center gap-1 z-20 backdrop-blur-xs">
                  <Globe className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[100px]">Link</span>
                </div>
              )}
            </div>

            {/* Card Body: Heading & Description details clearly displayed */}
            <div className="p-3.5 space-y-2.5 bg-white">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-800">{category}</span>
                  <span>·</span>
                  <span>Year {eventYear}</span>
                </div>
                <span className={published ? 'text-emerald-700 font-semibold' : 'text-slate-400 font-semibold'}>
                  {published ? '● Published' : '○ Draft'}
                </span>
              </div>

              {/* Heading / Title */}
              <h4 className="text-sm font-bold text-slate-900 leading-snug">
                {displayTitle}
              </h4>

              {/* Description / Details */}
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                {displayDesc}
              </p>

              {/* Redirect URL bar if set */}
              {url.trim() && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-mono text-emerald-800 flex items-center justify-between gap-1">
                  <span className="truncate">Tapping image opens: {url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 text-emerald-600" />
                </div>
              )}

              {/* Interactive action buttons row inside mobile card */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-500">
                  {totalImages === 0 ? 'Default banner' : `${totalImages} photo${totalImages > 1 ? 's' : ''}`}
                </span>
                {url.trim() ? (
                  <span className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-0.5">
                    <span>Open Details</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">View Details</span>
                )}
              </div>
            </div>
          </div>

          {/* Context Feed Item below to enable vertical scroll demonstration */}
          <div className="bg-white/80 border border-slate-200/80 rounded-xl p-3 space-y-1.5 opacity-75">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>CME CLINICAL MODULE</span>
              <span>2026</span>
            </div>
            <div className="text-xs font-semibold text-slate-800">
              Cardiovascular &amp; Interventional Workshop
            </div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              Global Health Academy Continuing Medical Education accredited credits.
            </div>
          </div>

          <div className="text-center py-2 text-[10px] font-mono text-slate-400">
            — Scrollable Mobile Preview Feed —
          </div>
        </div>

        {/* Home bar line */}
        <div className="w-24 h-1 bg-slate-700 rounded-full mx-auto mt-2.5 shrink-0" />
      </div>

      {/* Helper metadata below phone */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] font-mono text-slate-600 space-y-1">
        <div className="flex items-center justify-between text-slate-500">
          <span>Vertical:</span>
          <span className="text-slate-900 font-semibold">{category} ({eventYear})</span>
        </div>
        <div className="flex items-center justify-between text-slate-500">
          <span>Images attached:</span>
          <span className="text-slate-900 font-semibold">{totalImages}</span>
        </div>
        <div className="flex items-center justify-between text-slate-500">
          <span>Redirect in App:</span>
          <span className={url.trim() ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
            {url.trim() ? 'Configured' : 'None (Opens modal)'}
          </span>
        </div>
      </div>
    </div>
  );
};
