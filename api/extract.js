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

  const { anime, episode, type } = req.query;

  if (!anime || !episode) {
    return res.status(400).json({ error: "Missing parameters: 'anime' and 'episode' required." });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'X-Requested-With': 'XMLHttpRequest'
  };

  const domains = ['https://animepahe.org', 'https://animepahe.com', 'https://animepahe.ru'];

  // If anime parameter is an AnimePahe session hash (32 chars)
  const isSessionHash = /^[a-f0-9]{32}$/i.test(anime) && /^[a-f0-9]{32}$/i.test(episode);

  if (isSessionHash) {
    for (const domain of domains) {
      try {
        const playUrl = `${domain}/play/${anime}/${episode}`;
        const playRes = await axios.get(playUrl, { headers, timeout: 8000 });

        const kwikMatches = [...playRes.data.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];
        if (kwikMatches.length === 0) continue;

        for (const match of kwikMatches) {
          const kwikEmbedUrl = match[1];
          try {
            const kwikRes = await axios.get(kwikEmbedUrl, {
              headers: { ...headers, 'Referer': `${domain}/` },
              timeout: 8000
            });

            const unpacked = unpackKwikJs(kwikRes.data);
            if (unpacked) {
              const m3u8Match = unpacked.match(/const\s+source\s*=\s*'([^']+\.m3u8[^']*)'/);
              if (m3u8Match) {
                return res.status(200).json({
                  success: true,
                  url: m3u8Match[1],
                  referrer: 'https://kwik.cx/'
                });
              }
            }
          } catch (e) {}
        }
      } catch (error) {}
    }
  }

  // Title-based search & extraction flow
  for (const domain of domains) {
    try {
      // 1. Search anime session
      const searchRes = await axios.get(`${domain}/api?m=search&q=${encodeURIComponent(anime)}`, { headers, timeout: 6000 });
      if (searchRes.data && searchRes.data.data && searchRes.data.data.length > 0) {
        const animeSession = searchRes.data.data[0].session;
        // 2. Fetch episode release list
        const epListRes = await axios.get(`${domain}/api?m=release&id=${animeSession}&sort=episode_asc&page=1`, { headers, timeout: 6000 });
        if (epListRes.data && epListRes.data.data) {
          const epNum = Number(episode);
          const foundEp = epListRes.data.data.find(e => Number(e.episode) === epNum) || epListRes.data.data[0];
          if (foundEp && foundEp.session) {
            const playRes = await axios.get(`${domain}/play/${animeSession}/${foundEp.session}`, { headers, timeout: 6000 });
            const kwikMatches = [...playRes.data.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];
            if (kwikMatches.length > 0) {
              const kwikRes = await axios.get(kwikMatches[0][1], {
                headers: { ...headers, 'Referer': `${domain}/` },
                timeout: 6000
              });
              const unpacked = unpackKwikJs(kwikRes.data);
              if (unpacked) {
                const m3u8Match = unpacked.match(/const\s+source\s*=\s*'([^']+\.m3u8[^']*)'/);
                if (m3u8Match) {
                  return res.status(200).json({
                    success: true,
                    url: m3u8Match[1],
                    referrer: 'https://kwik.cx/'
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {}
  }

  // Graceful embed failover if AnimePahe cloudflare challenge is triggered
  return res.status(200).json({
    success: true,
    url: `https://megaplay.buzz/stream/search/${encodeURIComponent(anime)}/${episode}/${type || 'sub'}`,
    fallback: true
  });
};
