const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query.q || req.query.query;
  if (!query) {
    return res.status(400).json({ error: "Missing query parameter 'q'" });
  }

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  ];

  const headers = {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://animepahe.ru/'
  };

  try {
    const searchUrl = `https://animepahe.ru/api?m=search&q=${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, { headers, timeout: 8000 });
    return res.status(200).json(response.data);
  } catch (error) {
    // Fallback mirror if main fails
    try {
      const fallbackUrl = `https://animepahe.org/api?m=search&q=${encodeURIComponent(query)}`;
      const fallbackRes = await axios.get(fallbackUrl, { headers, timeout: 8000 });
      return res.status(200).json(fallbackRes.data);
    } catch (e) {
      return res.status(500).json({
        error: "Failed to search AnimePahe",
        message: error.message
      });
    }
  }
};
