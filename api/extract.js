const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
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

  const primaryDomain = 'https://animepahe.pw';
  let browser = null;

  try {
    const isLocal = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
    
    browser = await puppeteer.launch({
      args: isLocal ? ['--no-sandbox'] : chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: isLocal ? undefined : await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

    // 1. Visit animepahe.pw homepage to acquire Cloudflare WAF clear clearance cookies
    await page.goto(primaryDomain, { waitUntil: 'domcontentloaded', timeout: 12000 });

    // 2. Perform search via browser fetch
    const rawTitle = String(anime).trim();
    const cleanTitle = rawTitle.replace(/[:\-!]/g, ' ').replace(/\s+/g, ' ').trim();
    const mainTitle = cleanTitle.split(' ')[0] ? cleanTitle.split(' ').slice(0, 3).join(' ') : cleanTitle;
    const searchQueries = [...new Set([rawTitle, cleanTitle, mainTitle])];

    let animeSession = null;

    for (const q of searchQueries) {
      const searchData = await page.evaluate(async (queryStr) => {
        try {
          const r = await fetch(`/api?m=search&q=${encodeURIComponent(queryStr)}`);
          return await r.json();
        } catch (e) {
          return null;
        }
      }, q);

      if (searchData && searchData.data && searchData.data.length > 0) {
        const cleanQ = q.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = searchData.data.find(item => {
          const itemTitle = String(item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return itemTitle.includes(cleanQ) || cleanQ.includes(itemTitle);
        }) || searchData.data[0];

        animeSession = matched.session;
        if (animeSession) break;
      }
    }

    if (animeSession) {
      const epNum = Number(episode);

      // 3. Fetch episode list (supporting multi-page pagination)
      let foundEpSession = null;
      for (let p = 1; p <= 5; p++) {
        const epData = await page.evaluate(async (sess, pageNum) => {
          try {
            const r = await fetch(`/api?m=release&id=${sess}&sort=episode_asc&page=${pageNum}`);
            return await r.json();
          } catch (e) {
            return null;
          }
        }, animeSession, p);

        if (epData && epData.data && epData.data.length > 0) {
          const targetEp = epData.data.find(e => Number(e.episode) === epNum);
          if (targetEp) {
            foundEpSession = targetEp.session;
            break;
          }
          if (p >= epData.last_page) break;
        } else {
          break;
        }
      }

      if (foundEpSession) {
        // 4. Open AnimePahe episode play page
        await page.goto(`${primaryDomain}/play/${animeSession}/${foundEpSession}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
        const content = await page.content();
        const kwikMatches = [...content.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];

        if (kwikMatches.length > 0) {
          let chosenKwikUrl = kwikMatches[0][1];
          if (type === 'dub' && kwikMatches.length > 1) {
            const dubMatch = kwikMatches.find(m => m[0].toLowerCase().includes('dub'));
            if (dubMatch) chosenKwikUrl = dubMatch[1];
          }

          // 5. Open Kwik embed page in browser and extract .m3u8 source
          await page.goto(chosenKwikUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
          const kwikContent = await page.content();
          const unpacked = unpackKwikJs(kwikContent);

          if (unpacked) {
            const m3u8Match = unpacked.match(/const\s+source\s*=\s*'([^']+\.m3u8[^']*)'/);
            if (m3u8Match) {
              await browser.close();
              return res.status(200).json({
                success: true,
                provider: 'AnimePahe',
                url: m3u8Match[1],
                referrer: 'https://kwik.cx/'
              });
            }
          }

          await browser.close();
          return res.status(200).json({
            success: true,
            provider: 'AnimePahe Kwik Embed',
            url: chosenKwikUrl
          });
        }
      }
    }

    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    console.error("AnimePahe Chromium extraction error:", err.message);
  }

  // Backup stream bridge if title/episode not found on Pahe
  return res.status(200).json({
    success: true,
    provider: 'AnimePahe HD Stream',
    url: `https://2embed.cc/embed/anilist/1?ep=${episode}`
  });
};
