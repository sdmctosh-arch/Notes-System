export default function YouTubeEmbed({ videoId }) {
  return (
    <div className="w-full rounded-2xl overflow-hidden mb-5" style={{ aspectRatio: '16 / 9' }}>
      <iframe
        className="w-full h-full"
        // youtube-nocookie.com is YouTube's own privacy-enhanced embed
        // domain - it skips setting tracking cookies until playback
        // actually starts. It does not remove ads: embedded ad display
        // follows the viewer's own YouTube session (e.g. no ads if
        // they're signed into YouTube Premium in that browser), which is
        // not something the embedding page can control either way.
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
        title="Embedded video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        frameBorder="0"
      />
    </div>
  );
}
