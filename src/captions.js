// Group word timestamps into readable caption pages: break on a long pause, when
// the page gets too wordy, or when it has been on screen long enough to feel stale.
export const buildPages = (
  words,
  { maxWords = 4, maxGap = 0.45, maxDuration = 2.2 } = {},
) => {
  const pages = [];
  let current = [];

  const flush = () => {
    if (current.length > 0) {
      pages.push({
        words: current,
        start: current[0].start,
        end: current[current.length - 1].end,
      });
      current = [];
    }
  };

  for (const word of words) {
    if (current.length > 0) {
      const previous = current[current.length - 1];
      const gap = word.start - previous.end;
      const pageLength = word.end - current[0].start;
      if (current.length >= maxWords || gap > maxGap || pageLength > maxDuration) {
        flush();
      }
    }
    current.push(word);
  }
  flush();

  return pages;
};

// The page being spoken now; between pages hold the previous one so the screen
// never flashes empty mid-sentence.
export const activePageAt = (pages, time) => {
  const index = pages.findIndex((p) => time >= p.start && time <= p.end);
  if (index !== -1) return pages[index];
  const passed = pages.filter((p) => p.end < time);
  return passed.length > 0 ? passed[passed.length - 1] : pages[0];
};
