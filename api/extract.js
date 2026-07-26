const axios = require('axios');

function unpackKwikJs(packedStr) {
  try {
    const match = packedStr.match(/eval\(function\(p,a,c,k,e,d\)\{.*\}\('([^']*)',(\d+),(\d+),'([^']*)'\.split\('\|'\)/);
    if (!match) return null;

    let [_, p, a, c, kStr] = match;
    a = parseInt(a, 10);
    c = parseInt(c, 10);
    const k = kStr.split('|');

    const e = function(c) {
      return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    };

    while (c--) {
      if (k[c]) {
        p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
      }
    }
    return p;
  } catch (err) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { anime, episode } = req.query;

  if (!anime || !episode) {
    return res.status(400).json({ error: "Missing parameters: 'anime' (anime session) and 'episode' (episode session) required." });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  const domains = ['https://animepahe.org', 'https://animepahe.com'];

  for (const domain of domains) {
    try {
      const playUrl = `${domain}/play/${anime}/${episode}`;
      const playRes = await axios.get(playUrl, { headers, timeout: 10000 });

      const kwikMatches = [...playRes.data.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];
      if (kwikMatches.length === 0) continue;

      const sources = [];

      for (const match of kwikMatches) {
        const kwikEmbedUrl = match[1];
        try {
          const kwikRes = await axios.get(kwikEmbedUrl, {
            headers: {
              ...headers,
              'Referer': `${domain}/`
            },
            timeout: 8000
          });

          const unpacked = unpackKwikJs(kwikRes.data);
          if (unpacked) {
            const m3u8Match = unpacked.match(/const\s+source\s*=\s*'([^']+\.m3u8[^']*)'/);
            if (m3u8Match) {
              sources.push({
                url: m3u8Match[1],
                isM3U8: true,
                headers: {
                  Referer: 'https://kwik.cx/'
                }
              });
            }
          }
        } catch (e) {}
      }

      if (sources.length > 0) {
        return res.status(200).json({
          status: "success",
          animeSession: anime,
          episodeSession: episode,
          sources: sources
        });
      }
    } catch (error) {}
  }

  return res.status(500).json({
    error: "Failed to extract AnimePahe video stream across active domains."
  });
};
