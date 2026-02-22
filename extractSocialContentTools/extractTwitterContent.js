(async () => {
  const seen = new Map();

  const container = document.querySelector('[style*="height: 100vh"][style*="overflow"]');
  if (!container) {
    alert('Container not found!');
    return;
  }

  const handle = (() => {
    const links = document.querySelectorAll('a[href*="x.com/"]');
    for (const l of links) {
      const m = l.href.match(/x\.com\/([A-Za-z0-9_]+)/);
      if (m && m[1] !== 'i') return m[1];
    }
    return 'unknown';
  })();

  function extractVisible() {
    let newCount = 0;
    const items = container.querySelectorAll('ul > li');
    items.forEach(li => {
      const link = li.querySelector('a[href*="account_analytics/content/"]');
      const postId = link?.href?.match(/content\/(\d+)/)?.[1] || '';
      if (!postId || seen.has(postId)) return;

      const allText = li.querySelectorAll('[dir="auto"]');
      const text = allText.length ? allText[0]?.textContent?.trim() : '';

      let date = '';
      for (const el of li.querySelectorAll('*')) {
        const t = el.textContent.trim();
        if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d/.test(t) && t.length < 20) {
          date = t;
          break;
        }
      }

      const spans = [...li.querySelectorAll('span.font-semibold')];
      const vals = spans.map(s => s.textContent.trim()).filter(v => /^[\d.,]+[KMB]?$/.test(v));
      const half = Math.ceil(vals.length / 2);
      const metrics = vals.slice(half);

      seen.set(postId, {
        postId,
        url: `https://x.com/${handle}/status/${postId}`,
        text,
        date,
        impressions: metrics[0] || vals[0] || '',
        likes:        metrics[1] || vals[1] || '',
        replies:      metrics[2] || vals[2] || '',
        retweets:     metrics[3] || vals[3] || ''
      });
      newCount++;
    });
    return newCount;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Scroll to top and wait ────────────────────────────────────
  container.scrollTop = 0;
  await sleep(1000);
  extractVisible();
  console.log(`🔄 Starting scrape for @${handle}...`);

  // ── Forward pass: scroll down slowly, wait for new content ────
  const STEP = 300;
  let noNewCount = 0;
  const MAX_STALLS = 15; // allow many retries — network can be slow

  while (noNewCount < MAX_STALLS) {
    const prevSize = seen.size;
    const prevScrollHeight = container.scrollHeight;

    // Scroll down one step
    container.scrollTop += STEP;
    await sleep(250);
    extractVisible();

    // Also try scrolling to absolute bottom to trigger lazy load
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
      // We're near the bottom — give extra time for network fetch
      await sleep(1000);
      extractVisible();

      // Force a tiny scroll nudge to trigger intersection observer
      container.scrollTop = container.scrollHeight;
      await sleep(500);
      extractVisible();
    }

    if (seen.size > prevSize || container.scrollHeight > prevScrollHeight) {
      // New content appeared — reset stall counter
      noNewCount = 0;
      console.log(`📝 ${seen.size} posts found so far...`);
    } else {
      noNewCount++;
      // Wait longer on each stall to give network time
      await sleep(500);
    }
  }

  console.log(`⬇️ Forward pass done. ${seen.size} posts found. Starting reverse pass...`);

  // ── Reverse pass: scroll back up to catch anything missed ─────
  let position = container.scrollHeight;
  while (position > 0) {
    container.scrollTop = position;
    await sleep(200);
    extractVisible();
    position -= STEP;
  }

  container.scrollTop = 0;
  await sleep(500);
  extractVisible();

  // ── Second forward pass (catches items missed by virtualization) ──
  console.log(`🔄 Second forward pass...`);
  noNewCount = 0;
  while (noNewCount < 8) {
    const prevSize = seen.size;
    container.scrollTop += STEP;
    await sleep(250);
    extractVisible();

    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
      await sleep(800);
      container.scrollTop = container.scrollHeight;
      await sleep(500);
      extractVisible();
    }

    if (seen.size > prevSize) {
      noNewCount = 0;
    } else {
      noNewCount++;
    }
  }

  console.log(`✅ Scraping complete. ${seen.size} total posts.`);

  // ── Sort & export ─────────────────────────────────────────────
  const parseNum = (s) => {
    if (!s) return 0;
    s = String(s).replace(/,/g, '');
    if (s.endsWith('K')) return parseFloat(s) * 1000;
    if (s.endsWith('M')) return parseFloat(s) * 1000000;
    if (s.endsWith('B')) return parseFloat(s) * 1000000000;
    return parseFloat(s) || 0;
  };

  const posts = [...seen.values()].sort(
    (a, b) => parseNum(b.impressions) - parseNum(a.impressions)
  );

  window.__posts = posts;

  const json = JSON.stringify(posts, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `x_posts_${handle}_${Date.now()}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);

  console.log(`✅ Done! Exported ${posts.length} posts for @${handle}`);
  console.table(posts.slice(0, 10));

})();

