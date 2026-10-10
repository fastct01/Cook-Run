// Loads all game data (pure JSON) — the Unity port imports these same files as ScriptableObjects/TextAssets.
const FILES = ['route', 'lab', 'rules', 'van'];

export async function loadData() {
  const out = {};
  await Promise.all(FILES.map(async (name) => {
    const res = await fetch(new URL(`./${name}.json`, import.meta.url));
    if (!res.ok) throw new Error(`Failed to load ${name}.json (${res.status})`);
    out[name] = await res.json();
  }));
  return out; // { route, lab, rules, van }
}

// Node-side loader (tests / tools). Dynamic import keeps the browser bundle free of 'fs'.
export async function loadDataNode() {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('./', import.meta.url));
  const out = {};
  for (const name of FILES) out[name] = JSON.parse(readFileSync(dir + name + '.json', 'utf8'));
  return out;
}
