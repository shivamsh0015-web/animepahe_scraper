const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { q, episodeId } = req.query;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  try {
    if (q) {
      // Direct search from Anitaku / Gogoanime
      const searchUrl = `https://anitaku.pe/search.html?keyword=${encodeURIComponent(q)}`;
      const searchRes = await axios.get(searchUrl, { headers, timeout: 8000 });
      const matches = [...searchRes.data.matchAll(/<a href="\/category\/([^"]+)" title="([^"]+)"/gi)];
      
      const results = matches.map(m => ({
        id: m[1],
        title: m[2],
        url: `/category/${m[1]}`
      }));

      return res.status(200).json({ query: q, results });
    }

    if (episodeId) {
      const epUrl = `https://anitaku.pe/${episodeId}`;
      const epRes = await axios.get(epUrl, { headers, timeout: 8000 });
      const embedMatches = [...epRes.data.matchAll(/data-video="([^"]+)"/gi)];
      
      const sources = embedMatches.map(m => ({
        url: m[1].startsWith('//') ? 'https:' + m[1] : m[1]
      }));

      return res.status(200).json({ episodeId, sources });
    }

    return res.status(400).json({ error: "Missing parameter: 'q' for search or 'episodeId' for video extraction." });

  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch stream", message: error.message });
  }
};
