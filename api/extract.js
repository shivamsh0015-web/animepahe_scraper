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

  const domains = ['https://animepahe.ru', 'https://animepahe.org', 'https://animepahe.com', 'https://animepahe.net'];

  // 1. If anime & episode parameters are exact session hashes (32 chars)
  const isSessionHash = /^[a-f0-9]{32}$/i.test(anime) && /^[a-f0-9]{32}$/i.test(episode);

  if (isSessionHash) {
    for (const domain of domains) {
      try {
        const playUrl = `${domain}/play/${anime}/${episode}`;
        const playRes = await axios.get(playUrl, { headers, timeout: 8000 });

        const kwikMatches = [...playRes.data.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];
        if (kwikMatches.length === 0) continue;

        const kwikEmbedUrl = kwikMatches[0][1];
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
                provider: 'AnimePahe',
                url: m3u8Match[1],
                referrer: 'https://kwik.cx/'
              });
            }
          }
        } catch (e) {}

        // If .m3u8 unpack was protected, return AnimePahe's official Kwik embed player URL directly
        return res.status(200).json({
          success: true,
          provider: 'AnimePahe Kwik Embed',
          url: kwikEmbedUrl
        });

      } catch (error) {}
    }
  }

  // 2. Title-based AnimePahe search & episode extraction flow
  for (const domain of domains) {
    try {
      // Step A: Search for anime session on AnimePahe
      const searchRes = await axios.get(`${domain}/api?m=search&q=${encodeURIComponent(anime)}`, { headers, timeout: 7000 });
      if (searchRes.data && searchRes.data.data && searchRes.data.data.length > 0) {

        // Find best title match or take first result
        const cleanQuery = String(anime).toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchedAnime = searchRes.data.data.find(item => {
          const itemTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          return itemTitle.includes(cleanQuery) || cleanQuery.includes(itemTitle);
        }) || searchRes.data.data[0];

        const animeSession = matchedAnime.session;

        // Step B: Search pages of episode releases to find matching episode number
        const epNum = Number(episode);
        let foundEpSession = null;

        for (let page = 1; page <= 5; page++) {
          const epListRes = await axios.get(`${domain}/api?m=release&id=${animeSession}&sort=episode_asc&page=${page}`, { headers, timeout: 7000 });
          if (epListRes.data && epListRes.data.data && epListRes.data.data.length > 0) {
            const targetEp = epListRes.data.data.find(e => Number(e.episode) === epNum);
            if (targetEp) {
              foundEpSession = targetEp.session;
              break;
            }
            if (page >= epListRes.data.last_page) break;
          } else {
            break;
          }
        }

        if (foundEpSession) {
          const playRes = await axios.get(`${domain}/play/${animeSession}/${foundEpSession}`, { headers, timeout: 7000 });
          const kwikMatches = [...playRes.data.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];

          if (kwikMatches.length > 0) {
            // Pick requested audio type (sub vs dub if available)
            let chosenKwikMatch = kwikMatches[0];
            if (type === 'dub' && kwikMatches.length > 1) {
              chosenKwikMatch = kwikMatches.find(m => m[0].toLowerCase().includes('dub')) || kwikMatches[kwikMatches.length - 1];
            } else if (type === 'sub' && kwikMatches.length > 1) {
              chosenKwikMatch = kwikMatches.find(m => !m[0].toLowerCase().includes('dub')) || kwikMatches[0];
            }

            const kwikEmbedUrl = chosenKwikMatch[1];

            try {
              const kwikRes = await axios.get(kwikEmbedUrl, {
                headers: { ...headers, 'Referer': `${domain}/` },
                timeout: 7000
              });

              const unpacked = unpackKwikJs(kwikRes.data);
              if (unpacked) {
                const m3u8Match = unpacked.match(/const\s+source\s*=\s*'([^']+\.m3u8[^']*)'/);
                if (m3u8Match) {
                  return res.status(200).json({
                    success: true,
                    provider: 'AnimePahe',
                    url: m3u8Match[1],
                    referrer: 'https://kwik.cx/'
                  });
                }
              }
            } catch (e) {}

            // Return official AnimePahe Kwik embed URL
            return res.status(200).json({
              success: true,
              provider: 'AnimePahe Kwik Embed',
              url: kwikEmbedUrl
            });
          }
        }
      }
    } catch (err) {}
  }

  // If no match found or domain timeout, return error (do NOT return non-AnimePahe players!)
  return res.status(404).json({
    success: false,
    error: "AnimePahe stream unavailable for this title/episode.",
    provider: "AnimePahe"
  });
};
