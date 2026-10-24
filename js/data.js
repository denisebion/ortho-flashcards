// Loads topics.json + cards.json (both produced/edited outside the app).

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

export async function loadData() {
  const [config, data] = await Promise.all([fetchJson('topics.json'), fetchJson('cards.json')]);
  const cards = data.cards;

  // Show the "Unsorted" topic only if some card actually landed there.
  const topics = [...config.topics];
  if (cards.some((c) => c.topic === config.unsorted.id)) topics.push(config.unsorted);

  const topicById = Object.fromEntries(topics.map((t) => [t.id, t]));
  return { topics, topicById, cards };
}
