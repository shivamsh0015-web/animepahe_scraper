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

    // 1. Visit AnimePahe homepage to pass Cloudflare challenge
    await page.goto('https://animepahe.ru', { waitUntil: 'domcontentloaded', timeout: 12000 });

    // 2. Perform search via in-page fetch using browser session cookies
    const searchQuery = String(anime).trim();
    const searchData = await page.evaluate(async (q) => {
      try {
        const r = await fetch(`/api?m=search&q=${encodeURIComponent(q)}`);
        return await r.json();
      } catch (e) {
        return null;
      }
    }, searchQuery);

    if (searchData && searchData.data && searchData.data.length > 0) {
      const animeSession = searchData.data[0].session;
      const epNum = Number(episode);

      // 3. Fetch episode list
      const releaseData = await page.evaluate(async (sess) => {
        try {
          const r = await fetch(`/api?m=release&id=${sess}&sort=episode_asc&page=1`);
          return await r.json();
        } catch (e) {
          return null;
        }
      }, animeSession);

      if (releaseData && releaseData.data && releaseData.data.length > 0) {
        const foundEp = releaseData.data.find(e => Number(e.episode) === epNum) || releaseData.data[0];
        if (foundEp && foundEp.session) {
          // 4. Navigate to play page
          await page.goto(`https://animepahe.ru/play/${animeSession}/${foundEp.session}`, { waitUntil: 'domcontentloaded', timeout: 12000 });
          const content = await page.content();
          const kwikMatches = [...content.matchAll(/href="(https:\/\/[^"]*kwik[^"]*)"/gi)];

          if (kwikMatches.length > 0) {
            let chosenKwik = kwikMatches[0][1];
            if (type === 'dub' && kwikMatches.length > 1) {
              chosenKwik = (kwikMatches.find(m => m[0].toLowerCase().includes('dub')) || kwikMatches[kwikMatches.length - 1])[1];
            }

            // 5. Navigate to Kwik embed page inside browser
            await page.goto(chosenKwik, { waitUntil: 'domcontentloaded', timeout: 12000 });
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
              url: chosenKwik
            });
          }
        }
      }
    }

    await browser.close();
  } catch (err) {
    if (browser) await browser.close();
    console.error("Headless chromium error:", err.message);
  }

  // Backup HD stream if title was not found on Pahe
  return res.status(200).json({
    success: true,
    provider: 'AnimePahe HD Stream',
    url: `https://megaplay.buzz/stream/search/${encodeURIComponent(anime)}/${episode}/${type || 'sub'}`
  });
};
