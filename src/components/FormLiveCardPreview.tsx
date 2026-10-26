import React from 'react';
import { LandingCategory, SectionImageAsset, PendingImageUpload } from '../types/gha';
import { ResilientSectionImage } from './ResilientSectionImage';
import { Smartphone, ExternalLink } from 'lucide-react';

interface FormLiveCardPreviewProps {
  category: LandingCategory;
  eventYear: number;
  published: boolean;
  retainedImages: SectionImageAsset[];
  pendingUploads: PendingImageUpload[];
}

export const FormLiveCardPreview: React.FC<FormLiveCardPreviewProps> = ({
  category,
  eventYear,
  published,
  retainedImages,
  pendingUploads,
}) => {
  const previewItems = [
    ...retainedImages.map((image, index) => ({
      id: `retained-${index}-${image.blobPath}`,
      previewUrl: image.previewUrl,
      fileName: image.fileName,
      title: image.title || '',
      description: image.description || '',
      url: image.url || '',
    })),
    ...pendingUploads.map((image) => ({
      id: image.id,
      previewUrl: image.previewUrl,
      fileName: image.fileName,
      title: image.title,
      description: image.description,
      url: image.url,
    })),
  ];

  const categoryLabel = category === 'AHS' ? 'Course / AHS' : category;
  const categoryColor = category === 'CME' ? 'bg-blue-600' : category === 'GSI' ? 'bg-emerald-600' : category === 'AHS' ? 'bg-purple-600' : 'bg-amber-600';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs sticky top-32 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-slate-700" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Live Mobile Card Preview</h3>
        </div>
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
          {published ? '● PUBLISHED' : '○ DRAFT'}
        </span>
      </div>

      <div className="w-full max-w-[360px] mx-auto bg-slate-900 rounded-[2.5rem] p-3.5 shadow-2xl border-4 border-slate-800 flex flex-col h-[650px]">
        <div className="w-24 h-4 bg-slate-950 rounded-full mx-auto mb-2 shrink-0" />
        <div className="bg-slate-900 text-white px-3 pb-1.5 flex justify-between text-[10px] font-mono text-slate-400 shrink-0">
          <span>09:41</span><span className="tracking-widest">GHA MOBILE</span><span>100% ⚡</span>
        </div>
        <div className="bg-slate-900 text-white px-3.5 py-2 border-b border-slate-800 shrink-0">
          <div className="text-xs font-bold tracking-wide">Global Health Academy</div>
          <div className="text-[10px] text-slate-400">Mobile Landing Feed</div>
        </div>
        <div className="flex-1 overflow-y-auto bg-slate-100 p-3 space-y-3 rounded-b-[1.5rem]">
          {previewItems.length === 0 ? (
            <div className="bg-white rounded-xl p-4 text-xs text-slate-500">Upload an image and add its title and description to preview the content card.</div>
          ) : previewItems.map((item) => (
            <article key={item.id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
              <div className="relative aspect-[16/9] bg-slate-900">
                <ResilientSectionImage src={item.previewUrl} alt={item.title || item.fileName} category={category} />
                <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded text-[10px] font-bold text-white ${categoryColor}`}>
                  {categoryLabel}
                </span>
                {item.url.trim() ? <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px]">LINK</span> : null}
              </div>
              <div className="p-3.5 space-y-2 bg-white">
                <div className="text-[10px] font-mono text-slate-500">{categoryLabel} · Year {eventYear}</div>
                <h4 className="text-sm font-bold text-slate-900 leading-snug">{item.title || 'Content title'}</h4>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{item.description || 'Content description'}</p>
                {item.url.trim() ? <div className="text-[10px] text-emerald-700 truncate flex items-center gap-1"><ExternalLink className="w-3 h-3 shrink-0" />{item.url}</div> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">Each image and its details become a separate card, shown one below another in the mobile app.</p>
    </div>
  );
};
