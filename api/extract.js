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

  const { anime, romaji, episode, type } = req.query;

  if ((!anime && !romaji) || !episode) {
    return res.status(400).json({ error: "Missing parameters: 'anime' or 'romaji' and 'episode' required." });
  }

  const domains = ['https://animepahe.pw', 'https://animepahe.org', 'https://animepahe.ru'];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': '__ddg1_=; __ddg2_=;'
  };

  // Build candidate titles
  const rawCandidates = [romaji, anime].filter(Boolean).map(t => String(t).trim());
  const cleanCandidates = rawCandidates.map(t => t.replace(/[:\-!]/g, ' ').replace(/\s+/g, ' ').trim());
  const shortCandidates = cleanCandidates.map(t => t.split(' ').slice(0, 2).join(' '));

  const queries = [...new Set([...rawCandidates, ...cleanCandidates, ...shortCandidates])].filter(Boolean);

  for (const domain of domains) {
    for (const q of queries) {
      try {
        const searchRes = await axios.get(`${domain}/api?m=search&q=${encodeURIComponent(q)}`, {
          headers: { ...headers, 'Referer': `${domain}/` },
          timeout: 4000
        });

        if (searchRes.data && typeof searchRes.data === 'object' && Array.isArray(searchRes.data.data) && searchRes.data.data.length > 0) {
          const cleanQ = q.toLowerCase().replace(/[^a-z0-9]/g, '');
          const matched = searchRes.data.data.find(item => {
            const itemTitle = String(item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return itemTitle.includes(cleanQ) || cleanQ.includes(itemTitle);
          }) || searchRes.data.data[0];

          const animeSession = matched.session;
          const epNum = Number(episode);

          // Fetch episode list
          for (let p = 1; p <= 5; p++) {
            const epRes = await axios.get(`${domain}/api?m=release&id=${animeSession}&sort=episode_asc&page=${p}`, {
              headers: { ...headers, 'Referer': `${domain}/` },
              timeout: 4000
            });

            if (epRes.data && typeof epRes.data === 'object' && Array.isArray(epRes.data.data) && epRes.data.data.length > 0) {
              const targetEp = epRes.data.data.find(e => Number(e.episode) === epNum);
              if (targetEp && targetEp.session) {
                const playUrl = `${domain}/play/${animeSession}/${targetEp.session}`;
                const playRes = await axios.get(playUrl, {
                  headers: { ...headers, 'Referer': `${domain}/` },
                  timeout: 4000
                });

                if (typeof playRes.data === 'string') {
                  const kwikMatches = [...playRes.data.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];
                  if (kwikMatches.length > 0) {
                    let chosenKwik = kwikMatches[0][1];
                    if (type === 'dub' && kwikMatches.length > 1) {
                      const dubMatch = kwikMatches.find(m => m[0].toLowerCase().includes('dub'));
                      if (dubMatch) chosenKwik = dubMatch[1];
                    }

                    try {
                      const kwikRes = await axios.get(chosenKwik, {
                        headers: { ...headers, 'Referer': `${domain}/` },
                        timeout: 4000
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

                    return res.status(200).json({
                      success: true,
                      provider: 'AnimePahe Kwik Embed',
                      url: chosenKwik
                    });
                  }
                }
              }
              if (p >= epRes.data.last_page) break;
            } else {
              break;
            }
          }
        }
      } catch (err) {}
    }
  }

  return res.status(200).json({
    success: false,
    error: "This title is not currently available on AnimePahe servers. Please try Server 1 or Server 2.",
    provider: "AnimePahe"
  });
};
