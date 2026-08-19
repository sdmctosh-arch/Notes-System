export default function YouTubeEmbed({ videoId }) {
  return (
    <div className="w-full rounded-2xl overflow-hidden mb-5" style={{ aspectRatio: '16 / 9' }}>
      <iframe
        className="w-full h-full"
        src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`}
        title="Embedded video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        frameBorder="0"
      />
    </div>
  );
}
