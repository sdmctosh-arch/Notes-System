import { useState } from 'react';
import ArtPlaceholder from './ArtPlaceholder';

// Real per-category art (a TMDB poster/backdrop for media, a dish photo for
// recipe - see enrich-prompt.md's "Recipe conversion" and
// Invoke-NoteProcessor-v2.ps1's Get-TmdbArt) when enrichment found one,
// falling back to ArtPlaceholder's striped placeholder when it didn't - no
// URL at all, or a URL that failed to load (a hotlinked source going dead
// is expected; nothing here is downloaded or cached, see PROJECT.md 10.4).
export default function ArtImage({ src, alt = '', width, height, aspectRatio, radius = 8, label, fontSize = 8, className = '', style }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <ArtPlaceholder
        width={width}
        height={height}
        aspectRatio={aspectRatio}
        radius={radius}
        label={label}
        fontSize={fontSize}
        className={className}
        style={style}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={`shrink-0 object-cover ${className}`}
      style={{ width, height, aspectRatio, borderRadius: radius, ...style }}
    />
  );
}
