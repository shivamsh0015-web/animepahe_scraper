const axios = require('axios');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const id = req.query.id || req.query.session;
  const page = req.query.page || 1;

  if (!id) {
    return res.status(400).json({ error: "Missing anime session parameter 'id'" });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://animepahe.ru/'
  };

  try {
    const releaseUrl = `https://animepahe.ru/api?m=release&id=${id}&sort=episode_asc&page=${page}`;
    const response = await axios.get(releaseUrl, { headers, timeout: 8000 });
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch episode list",
      message: error.message
    });
  }
};
