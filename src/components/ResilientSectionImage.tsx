import React, { useState, useEffect } from 'react';
import { LandingCategory } from '../types/gha';

interface ResilientSectionImageProps {
  src?: string;
  alt: string;
  category: LandingCategory;
  className?: string;
}

export const ResilientSectionImage: React.FC<ResilientSectionImageProps> = ({
  src,
  alt,
  category,
  className = 'w-full h-full object-cover',
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError || !src) {
    const gradient =
      category === 'CME'
        ? 'from-blue-900 via-slate-900 to-indigo-950'
        : category === 'GSI'
        ? 'from-emerald-950 via-slate-900 to-teal-950'
        : category === 'AHS'
        ? 'from-purple-950 via-slate-900 to-indigo-950'
        : 'from-amber-950 via-slate-900 to-stone-900';

    return (
      <div
        className={`flex flex-col justify-between p-3.5 bg-gradient-to-br ${gradient} text-slate-100 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>GHA · {category}</span>
          <span className="text-[9px] uppercase tracking-wider text-slate-400">
            {hasError ? 'Image Offline' : 'Category Banner'}
          </span>
        </div>
        <div className="my-auto py-1">
          <p className="text-xs font-semibold text-white/95 line-clamp-2">{alt}</p>
        </div>
        <div className="text-[10px] font-mono text-slate-400 truncate">
          GHA Mobile Card
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
};
