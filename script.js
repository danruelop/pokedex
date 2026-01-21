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

let allPokemon = [];
let filteredPokemon = [];
let currentPage = 0;
let currentPokemon = null;
let currentVarieties = [];

/* ========= UTIL ========= */

const cap = t => t.charAt(0).toUpperCase()+t.slice(1);
const pretty = n => n.split("-").map(cap).join(" ");
const typeTag = t => `<span class="type type-${t}">${cap(t)}</span>`;

/* ========= LOAD ========= */

async function loadGen(gen) {
  allPokemon = [];
  currentPage = 0;
  pokedex.innerHTML = "Cargando...";

  const ranges = gen==="all" ? Object.values(gens) : [gens[gen]];
  for (const [s,e] of ranges) {
    for (let i=s;i<=e;i++) {
      const p = await fetch(`https://pokeapi.co/api/v2/pokemon/${i}`).then(r=>r.json());
      allPokemon.push(p);
    }
  }

  allPokemon.sort((a,b)=>a.id-b.id);
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

  const species = await fetch(p.species.url).then(r=>r.json());
  currentVarieties = species.varieties;

  await showMainView(p);
}

async function showMainView(p) {
  modalBody.innerHTML = `
    <h2>#${String(p.id).padStart(3,"0")} ${pretty(p.name)}</h2>
    <img src="${p.sprites.front_default}">
    <div class="types">${p.types.map(t=>typeTag(t.type.name)).join("")}</div>

    <h3>Formas</h3>
    ${currentVarieties.map(v=>`
      <button onclick="loadForm('${v.pokemon.url}')">${pretty(v.pokemon.name)}</button>
    `).join("")}

    <h3>Estadísticas</h3>
    ${p.stats.map(renderStat).join("")}

    ${await renderAbilities(p.abilities)}


    <div class="modal-buttons">
      <button onclick="showMoves('level-up')">📈 Por nivel</button>
      <button onclick="showMoves('machine')">💿 Por MT</button>
    </div>
  `;
}

window.loadForm = async url => {
  const p = await fetch(url).then(r=>r.json());
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
        <span>Tipo: ${cap(data.type.name)}</span> |
        <span>Clase: ${cap(data.damage_class.name)}</span>
        <br>
        <small>
          ${description ? description.flavor_text.replace(/\n|\f/g, " ") : "Sin descripción"}
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


/* ========= EVENTS ========= */

generationSelect.onchange = e => loadGen(e.target.value);
searchInput.oninput = applyFilters;
closeModal.onclick = ()=> modal.classList.add("hidden");

/* ========= START ========= */

loadGen("all");
