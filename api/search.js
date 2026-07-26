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

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://animepahe.org/'
  };

  const domains = ['https://animepahe.org', 'https://animepahe.com'];

  for (const domain of domains) {
    try {
      const searchUrl = `${domain}/api?m=search&q=${encodeURIComponent(query)}`;
      const response = await axios.get(searchUrl, { headers, timeout: 8000 });
      if (response.status === 200 && response.data) {
        return res.status(200).json(response.data);
      }
    } catch (e) {
      // try next domain
    }
  }

  return res.status(500).json({
    error: "Failed to search AnimePahe across active domains",
    message: "AnimePahe domains (org/com) require active session headers or are under maintenance."
  });
};
