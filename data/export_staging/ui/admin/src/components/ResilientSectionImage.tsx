import React, { useState } from 'react';
import { LandingCategory } from '../types/gha';

interface ResilientSectionImageProps {
  src: string;
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

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col justify-between p-4 bg-slate-900 text-slate-100 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
          <span>GHA · {category}</span>
          <span>SEAWEEDFS BLOB</span>
        </div>
        <div className="my-auto py-2">
          <p className="text-sm font-semibold text-white line-clamp-2">{alt}</p>
        </div>
        <div className="text-[11px] font-mono text-slate-400 truncate">
          event_db.landing_sections
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
