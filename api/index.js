module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    status: 'online',
    service: 'AnimePahe & Kwik Stream Proxy API',
    endpoints: {
      search: '/api/search?q={title}',
      episodes: '/api/episodes?id={animeSessionId}',
      extract: '/api/extract?anime={animeSessionId}&episode={episodeSessionId}'
    }
  });
};
