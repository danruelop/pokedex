const pokedex = document.getElementById("pokedex");
const generationSelect = document.getElementById("generation");
const searchInput = document.getElementById("search");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
const closeModal = document.getElementById("closeModal");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");

const PAGE_SIZE = 50;

const gens = {
  1:[1,151],2:[152,251],3:[252,386],4:[387,493],
  5:[494,649],6:[650,721],7:[722,809],
  8:[810,905],9:[906,1025]
};

const iconMap = {
  "Normal": "⚪",
  "Pseudo-legendario": "🔷",
  "Legendario": "⭐",
  "Mítico": "✨",
  "Mega": "💥"
};

/* ========= COMPETITIVO ========= */

const EVIOLITE_COMPETITIVE = new Set([
  "chansey",
  "porygon2",
  "dusclops",
  "magneton",
  "rhydon",
  "electabuzz",
  "magmar",
  "clefairy",
  "sneasel"
]);


let allPokemon = [];
let filteredPokemon = [];
let currentPage = 0;
let currentPokemon = null;
let currentVarieties = [];
let currentSpecies = null;
let currentEvolutionChain = null;

/* ========= UTIL ========= */

const cap = t => t.charAt(0).toUpperCase()+t.slice(1);
const pretty = n => n.split("-").map(cap).join(" ");
const typeTag = t => `<span class="type type-${t}">${cap(t)}</span>`;

/* ========= LOAD ========= */

async function loadGen(gen) {

  localStorage.clear();

  allPokemon = [];
  currentPage = 0;
  pokedex.innerHTML = "Cargando Pokémon...";

  const ranges = gen === "all" ? Object.values(gens) : [gens[gen]];
  const promises = [];

  for (const [s, e] of ranges) {
    for (let i = s; i <= e; i++) {
      promises.push(fetchPokemon(i)); // 👈 AQUÍ
    }
  }

  allPokemon = await Promise.all(promises);

  allPokemon.sort((a, b) => a.id - b.id);
  applyFilters();
}

/* ========= FILTER ========= */

function applyFilters() {
  const txt = searchInput.value.toLowerCase();
  filteredPokemon = allPokemon.filter(p => p.name.includes(txt));
  currentPage = 0;
  renderPage();
}

/* ========= PAGINATION ========= */

function renderPage() {
  pokedex.innerHTML = "";
  const start = currentPage * PAGE_SIZE;
  const slice = filteredPokemon.slice(start, start + PAGE_SIZE);

  slice.forEach(renderCard);

  const total = Math.max(1, Math.ceil(filteredPokemon.length / PAGE_SIZE));
  pageInfo.textContent = `Página ${currentPage+1} / ${total}`;
  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage >= total-1;
}

prevPageBtn.onclick = () => { if(currentPage>0){currentPage--;renderPage();} };
nextPageBtn.onclick = () => {
  const total = Math.ceil(filteredPokemon.length / PAGE_SIZE);
  if(currentPage < total-1){currentPage++;renderPage();}
};

/* ========= CARD ========= */

function renderCard(p) {
  const c = document.createElement("div");
  c.className = "card";
  c.innerHTML = `
    <div class="card-header">
      <span>#${String(p.id).padStart(3,"0")}</span>
      <span>${pretty(p.name)}</span>
    </div>
    <img src="${p.sprites.front_default}">
    <div class="types">${p.types.map(t=>typeTag(t.type.name)).join("")}</div>
  `;
  c.onclick = ()=> openModal(p);
  pokedex.appendChild(c);
}

/* ========= MODAL ========= */

async function openModal(p) {

  currentPokemon = p;
  modal.classList.remove("hidden");

  currentSpecies = await fetch(p.species.url).then(r => r.json());
  currentVarieties = currentSpecies.varieties;

  const evoData = await fetch(currentSpecies.evolution_chain.url).then(r => r.json());
  currentEvolutionChain = evoData.chain;

  await showMainView(p);
}


async function showMainView(p) {
  modalBody.innerHTML = `
    <h2>#${String(p.id).padStart(3,"0")} ${pretty(p.name)}</h2>
    <img src="${p.sprites.front_default}">
    <div class="types">${p.types.map(t=>typeTag(t.type.name)).join("")}</div>

    ${currentSpecies ? (() => {
      const category = getPokemonCategory(p, currentSpecies);
      const cls = category
        .toLowerCase()
        .replace("í", "i")
        .replace(/\s+/g, "-");

      return `
        <div class="pokemon-category category-${cls}">
          ${iconMap[category] || "🏷️"} <strong>Categoría:</strong> ${category}
        </div>
      `;
    })() : ""}

    <h3>Formas</h3>
    ${currentVarieties.map(v=>`
      <button onclick="loadForm('${v.pokemon.url}')">${pretty(v.pokemon.name)}</button>
    `).join("")}

    <h3>Estadísticas</h3>
    ${p.stats.map(renderStat).join("")}

    <div class="bst-total">
      📊 <strong>BST total:</strong> ${getBST(p)}
    </div>

    ${await renderAbilities(p.abilities)}


    <div class="modal-buttons">
      <button onclick="toggleMatchups()">🛡️ Debilidades y resistencias</button>
      <button onclick="showMoves('level-up')">📈 Por nivel</button>
      <button onclick="showMoves('machine')">💿 Por MT</button>
      <button onclick="toggleCobbleverseBiomes()">🌍 Biomas (Cobbleverse)</button>
    </div>

    <div id="matchupsContainer" style="display:none;"></div>
    <div id="cobbleverseContainer" style="display:none;"></div>

    ${currentSpecies && currentEvolutionChain && shouldShowSmogonLink(p, currentSpecies, currentEvolutionChain) ? `
      <div class="competitive-link">
        <a href="${getSmogonUrl(p, currentSpecies)}" target="_blank" rel="noopener">
          🧠 Guía competitiva (Smogon)
        </a>
      </div>
    ` : ""}
  `
  ;
}

window.loadForm = async url => {
  const p = await fetch(url).then(r=>r.json());
  currentPokemon = p;
  await showMainView(p);
};

/* ========= MOVES (VISTAS SEPARADAS) ========= */

async function showMoves(method) {
  const moveMap = new Map();

  for (const m of currentPokemon.moves) {
    for (const d of m.version_group_details) {
      if (d.move_learn_method.name === method) {
        if (!moveMap.has(m.move.name)) {
          moveMap.set(m.move.name, {
            move: m.move,
            level: d.level_learned_at
          });
        }
      }
    }
  }

  const moveEntries = [...moveMap.values()];

  modalBody.innerHTML = `
    <h2>${pretty(currentPokemon.name)}</h2>
    <h3>${method === "level-up" ? "📈 Movimientos por nivel" : "💿 Movimientos por MT"}</h3>
    <div id="movesContainer">Cargando movimientos...</div>
    <button onclick="showMainView(currentPokemon)">⬅ Volver</button>
  `;

  const container = document.getElementById("movesContainer");
  container.innerHTML = "";

  for (const entry of moveEntries) {
    const data = await fetch(entry.move.url).then(r => r.json());

    const description =
      data.flavor_text_entries.find(e => e.language.name === "es") ||
      data.flavor_text_entries.find(e => e.language.name === "en");

    container.innerHTML += `
    <div class="move type-${data.type.name}">
      <strong>${pretty(entry.move.name)}</strong>
      ${method === "level-up" ? ` <span>(Nv. ${entry.level})</span>` : ""}
      <br>
      <span>${cap(data.type.name)}</span> ·
      <span>${cap(data.damage_class.name)}</span>
      <br>
      <small>
        ${description ? description.flavor_text.replace(/\\n|\\f/g, " ") : "Sin descripción"}
      </small>
    </div>
    `;
  }
}

closeModal.onclick = ()=> modal.classList.add("hidden");

/* ========= STATS ========= */

function renderStat(stat) {
  const map = {
    hp:"stat-hp",attack:"stat-attack",defense:"stat-defense",
    "special-attack":"stat-spatk","special-defense":"stat-spdef",speed:"stat-speed"
  };
  return `
    <div class="stat ${map[stat.stat.name]}">
      <div class="stat-label">
        <span>${pretty(stat.stat.name)}</span>
        <span>${stat.base_stat}</span>
      </div>
      <div class="bar">
        <span style="width:${Math.min(stat.base_stat,200)/2}%"></span>
      </div>
    </div>
  `;
}

function getBST(pokemon) {
  return pokemon.stats.reduce(
    (total, stat) => total + stat.base_stat,
    0
  );
}


/* ========= ABILITIES ========= */
async function renderAbilities(abilities) {
  let html = "<h3>Habilidades</h3>";

  for (const a of abilities) {
    const data = await fetch(a.ability.url).then(r => r.json());

    const entry =
      data.flavor_text_entries.find(e => e.language.name === "es") ||
      data.flavor_text_entries.find(e => e.language.name === "en");

    html += `
      <div class="ability">
        <strong>${pretty(a.ability.name)}</strong>
        ${a.is_hidden ? "<em>(Oculta)</em>" : ""}
        <p>${entry ? entry.flavor_text.replace(/\n|\f/g, " ") : "Sin descripción"}</p>
      </div>
    `;
  }

  return html;
}

/* ========= COMPATIBILIDAD DE TIPOS ========= */
async function getTypeEffectiveness(types) {
  const result = {};

  for (const t of types) {
    const data = await fetch(t.type.url).then(r => r.json());

    data.damage_relations.double_damage_from.forEach(x => {
      result[x.name] = (result[x.name] || 1) * 2;
    });

    data.damage_relations.half_damage_from.forEach(x => {
      result[x.name] = (result[x.name] || 1) * 0.5;
    });

    data.damage_relations.no_damage_from.forEach(x => {
      result[x.name] = 0;
    });
  }

  return result;
}

async function renderTypeMatchups(pokemon) {
  const effectiveness = await getTypeEffectiveness(pokemon.types);

  const weak = [];
  const resist = [];
  const immune = [];

  for (const [type, value] of Object.entries(effectiveness)) {
    if (value >= 2) weak.push(type);
    else if (value === 0) immune.push(type);
    else if (value < 1) resist.push(type);
  }

  return `
    <div class="matchups">
      <h3>🔴 Débil contra</h3>
      <div class="types">${weak.map(typeTag).join("") || "—"}</div>

      <h3>🟢 Resiste</h3>
      <div class="types">${resist.map(typeTag).join("") || "—"}</div>

      <h3>⚫ Inmune</h3>
      <div class="types">${immune.map(typeTag).join("") || "—"}</div>
    </div>
  `;
}

async function toggleMatchups() {
  const container = document.getElementById("matchupsContainer");

  if (container.style.display === "block") {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  container.style.display = "block";
  container.innerHTML = "Calculando compatibilidad…";

  container.innerHTML = await renderTypeMatchups(currentPokemon);
}

/* ========= BIOMAS COBBLEVERSE ========= */
let cobbleverseData = null;

async function loadCobbleverseData() {
  if (cobbleverseData) return cobbleverseData;

  const url =
    "https://docs.google.com/spreadsheets/d/1DJT7Hd0ldgVUjJbN0kYQFAyNBP6JGG_Clkipax98x-g/gviz/tq?tqx=out:json";

  const text = await fetch(url).then(r => r.text());

  // Google envía JSON envuelto en texto
  const json = JSON.parse(
    text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)
  );

  const cols = json.table.cols.map(c => c.label.toLowerCase());
  const rows = json.table.rows;

  cobbleverseData = rows.map(r => {
    const obj = {};
    r.c.forEach((cell, i) => {
      obj[cols[i]] = cell ? cell.v : "";
    });
    return obj;
  });

  return cobbleverseData;
}

async function getCobbleverseBiomes(pokemon) {
  const data = await loadCobbleverseData();

  const name = pokemon.name
    .toLowerCase()
    .replace(/-/g, " ")
    .trim();

  const normalize = str =>
  str
    .toLowerCase()
    .normalize("NFD")                 // separa acentos
    .replace(/[\u0300-\u036f]/g, "")  // elimina acentos
    .replace(/[^a-z0-9 ]/g, "")       // limpia caracteres raros
    .trim();

  const target = normalize(name);

  const entries = data.filter(row => {
    if (!row["pokémon"]) return false;
    return normalize(row["pokémon"]) === target;
  });

  if (!entries.length) {
    return {
      biomes: [],
      times: [],
      rarity: []
    };
  }

let biomes = [];
let times = [];
let rarity = [];

for (const entry of entries) {

  // Biomas permitidos en ESTA fila
  let allowed = [];

  if (entry["biomes"]) {
    allowed = entry["biomes"]
      .split(/[,;]+/)
      .map(b => b.replace(/^"+|"+$/g, "").trim())
      .filter(Boolean);
  }

  // Biomas excluidos SOLO para esta fila
  if (entry["excluded biomes"]) {
    const excluded = entry["excluded biomes"]
      .split(/[,;]+/)
      .map(b => b.replace(/^"+|"+$/g, "").trim())
      .filter(Boolean);

    allowed = allowed.filter(b => !excluded.includes(b));
  }

  // Añadimos los biomas válidos de esta fila
  biomes.push(...allowed);

  // Time
  if (entry["time"]) {
    const raw = entry["time"].toLowerCase();
    if (raw.includes("day")) times.push("Day");
    if (raw.includes("night")) times.push("Night");
    if (raw.includes("any")) times.push("Any");
  }

  // Rareza
  // Rareza (bucket)
  if (entry["bucket"]) {
  rarity.push(
    entry["bucket"]
      .replace(/_/g, " ")
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim()
  );
}

}

  return {
    biomes: [...new Set(biomes)],
    times: [...new Set(times)],
    rarity: [...new Set(rarity)]
  };
}

async function toggleCobbleverseBiomes() {
  const container = document.getElementById("cobbleverseContainer");

  if (container.style.display === "block") {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  container.style.display = "block";
  container.innerHTML = "Cargando biomas…";

  const data = await getCobbleverseBiomes(currentPokemon);

  container.innerHTML = `
    <h3>🌍 Biomas (Cobbleverse)</h3>
    <div class="biomes-list">
      ${
        data.biomes.length
          ? data.biomes.map(b => `<span class="biome-tag">${b}</span>`).join("")
          : "—"
      }
    </div>

    <h3>⏰ Momento del día</h3>
    <div>${data.times.length ? data.times.join(", ") : "—"}</div>

    <h3>⭐ Rareza</h3>
    <div>${data.rarity.length ? data.rarity.join(", ") : "—"}</div>
  `;
}

/* COMPETITIVO */

function shouldShowSmogonLink(pokemon, species, evolutionChain) {
  // Si no hay datos suficientes, no mostramos nada
  if (!pokemon || !species || !evolutionChain) return false;

  // Caso 1: Eviolite competitivo
  if (EVIOLITE_COMPETITIVE.has(pokemon.name)) return true;

  // Caso 2: no evoluciona en absoluto
  if (!species.evolves_from_species && evolutionChain.evolves_to.length === 0) {
    return true;
  }

  // Caso 3: fase final real
  if (isFinalEvolution(species, evolutionChain)) {
    return true;
  }

  return false;
}

function getSmogonUrl(pokemon, species) {
  const name = species ? species.name : pokemon.name;

  const gen = species?.generation?.name;

  // Prioridad: Sun & Moon si existía
  if (gen && ["generation-i","generation-ii","generation-iii","generation-iv","generation-v","generation-vi","generation-vii"].includes(gen)) {
    return `https://www.smogon.com/dex/sm/pokemon/${name}/`;
  }

  // Gen 8
  if (gen === "generation-viii") {
    return `https://www.smogon.com/dex/ss/pokemon/${name}/`;
  }

  // Gen 9
  if (gen === "generation-ix") {
    return `https://www.smogon.com/dex/sv/pokemon/${name}/`;
  }

  // Fallback seguro
  return `https://www.smogon.com/dex/sm/pokemon/${name}/`;
}

function getSmogonName(pokemon, species) {
  return species.name;
}

function isFinalEvolution(species, chain) {
  function traverse(node) {
    if (!node || !node.species) return null;

    if (node.species.name === species.name) {
      return !node.evolves_to || node.evolves_to.length === 0;
    }

    if (!node.evolves_to) return null;

    for (const next of node.evolves_to) {
      const result = traverse(next);
      if (result !== null) return result;
    }

    return null;
  }

  return traverse(chain) === true;
}

function getPokemonCategory(pokemon, species) {
  // Mega tiene prioridad absoluta
  if (pokemon.name.includes("mega")) {
    return "Mega";
  }

  if (species.is_mythical) return "Mítico";
  if (species.is_legendary) return "Legendario";

  const bst = pokemon.stats.reduce((sum, s) => sum + s.base_stat, 0);

  if (bst >= 600) return "Pseudo-legendario";

  return "Normal";
}

/* ========= EVENTS ========= */

generationSelect.onchange = e => loadGen(e.target.value);
searchInput.oninput = applyFilters;
closeModal.onclick = ()=> modal.classList.add("hidden");

/* ========= CACHE ========= */

async function fetchPokemon(id) {
  const key = `pokemon-${id}`;
  const cached = localStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  const data = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
    .then(r => r.json());

  try {
  localStorage.setItem(key, JSON.stringify({
    id: data.id,
    name: data.name,
    sprites: data.sprites,
    types: data.types,
    stats: data.stats,
    abilities: data.abilities,
    moves: data.moves
  }));
  } catch (e) {
    console.warn("Cache lleno, limpiando cache y reintentando");

    localStorage.clear();

    try {
      localStorage.setItem(key, JSON.stringify({
        id: data.id,
        name: data.name,
        sprites: data.sprites,
        types: data.types,
        stats: data.stats,
        abilities: data.abilities,
        moves: data.moves
      }));
  } catch {
    // si aun así no cabe, lo ignoramos
  }
}
  return data;
}


/* ========= START ========= */

loadGen(1);
