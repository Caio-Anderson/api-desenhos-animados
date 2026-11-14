const API_URL = "https://rickandmortyapi.com/api/character";

const traducoes = {
  status: { Alive: "Vivo", Dead: "Morto", unknown: "Desconhecido" },
  species: { Human: "Humano", Alien: "Alienígena", Robot: "Robô", Animal: "Animal", Humanoid: "Humanoide", Disease: "Doença", Cronenberg: "Cronenberg", Poopybutthole: "Poopybutthole", unknown: "Desconhecida", "Mythological Creature": "Criatura mitológica" },
};

const estado = { pagina: 1, nome: "", status: "", soFavoritos: false, totalPaginas: 1 };
let favoritos = lerFavoritos();
let ultimosPersonagens = [];

const el = {
  cards: document.getElementById("cards"),
  mensagem: document.getElementById("mensagem"),
  total: document.getElementById("total"),
  busca: document.getElementById("busca"),
  status: document.getElementById("status"),
  btnFav: document.getElementById("btn-favoritos"),
  anterior: document.getElementById("anterior"),
  proxima: document.getElementById("proxima"),
  pagina: document.getElementById("pagina"),
};

function lerFavoritos() {
  try { return JSON.parse(localStorage.getItem("favoritos-rm")) || {}; }
  catch (e) { return {}; }
}
function salvarFavoritos() {
  try { localStorage.setItem("favoritos-rm", JSON.stringify(favoritos)); } catch (e) {}
}

let controlador;
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SEM_IMAGEM = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#8fd3f4"/><circle cx="100" cy="100" r="46" fill="none" stroke="#1b1b3a" stroke-width="8"/><circle cx="100" cy="100" r="18" fill="#6ee05b"/></svg>'
);

// fetch com até 3 tentativas, devido a oscilaçoes
function fetchComTentativas(url, opcoes, tentativas = 3) {
  return fetch(url, opcoes)
    .then((resposta) => {
      if (resposta.status !== 404 && !resposta.ok) throw new Error("HTTP " + resposta.status);
      return resposta;
    })
    .catch((erro) => {
      if (erro.name === "AbortError" || tentativas <= 1) throw erro;
      return esperar(1000).then(() => fetchComTentativas(url, opcoes, tentativas - 1));
    });
}

const cache = new Map();
function carregarDados(url, sinal) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  return fetchComTentativas(url, { signal: sinal })
    .then((resposta) => (resposta.status === 404 ? { info: { count: 0, pages: 1 }, results: [] } : resposta.json()))
    .then((dados) => { cache.set(url, dados); return dados; });
}


let origemFalhou = false;
const urlProxy = (url) => "https://wsrv.nl/?url=" + encodeURIComponent(url);

// Consumo da API com fetch + then
function buscarPersonagens() {
  if (controlador) controlador.abort();
  controlador = new AbortController();
  const params = new URLSearchParams({ page: estado.pagina });
  if (estado.nome) params.set("name", estado.nome);
  if (estado.status) params.set("status", estado.status);

  el.mensagem.textContent = "Carregando personagens…";
  el.cards.classList.add("carregando");

  return carregarDados(`${API_URL}?${params}`, controlador.signal)
    .then((dados) => {
      estado.totalPaginas = dados.info.pages || 1;
      ultimosPersonagens = dados.results;
      el.total.textContent = `${dados.info.count} personagens encontrados na API agora.`;
      el.cards.classList.remove("carregando");
      desenharCards(dados.results);
      atualizarPaginacao();
      // pré-carrega a próxima página para a navegação ficar fluida
      if (estado.pagina < estado.totalPaginas) {
        const prox = new URLSearchParams(params);
        prox.set("page", estado.pagina + 1);
        carregarDados(`${API_URL}?${prox}`).catch(() => {});
      }
    })
    .catch((erro) => {
      if (erro.name === "AbortError") return; // busca substituída por outra mais nova
      el.cards.classList.remove("carregando");
      console.error("Falha ao consultar a API:", erro);
      el.total.textContent = "API indisponível.";
      el.mensagem.textContent = "Não foi possível carregar a API (" + erro.message + "). ";
      const tentar = document.createElement("button");
      tentar.type = "button";
      tentar.textContent = "Tentar novamente";
      tentar.addEventListener("click", buscarPersonagens);
      el.mensagem.appendChild(tentar);
    });
}


function criarCard(p) {
  const card = document.createElement("article");
  card.className = "card";

  const img = document.createElement("img");
  img.src = origemFalhou ? urlProxy(p.image) : p.image;
  img.alt = `Retrato de ${p.name}`;
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  let etapa = origemFalhou ? 1 : 0;
  img.addEventListener("error", () => {
    etapa++;
    if (etapa === 1) {
      
      origemFalhou = true;
      img.src = urlProxy(p.image);
    } else {
      img.src = SEM_IMAGEM; 
    }
  });

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "favorito" + (favoritos[p.id] ? " ativo" : "");
  botao.setAttribute("aria-label", `Favoritar ${p.name}`);
  botao.setAttribute("aria-pressed", favoritos[p.id] ? "true" : "false");
  botao.textContent = favoritos[p.id] ? "♥" : "♡";
  botao.addEventListener("click", () => alternarFavorito(p, botao));

  const corpo = document.createElement("div");
  corpo.className = "card-corpo";

  const nome = document.createElement("h2");
  nome.textContent = p.name;

  const status = document.createElement("span");
  status.className = "status " + p.status.toLowerCase();
  status.textContent = traducoes.status[p.status] || p.status;

  const especie = document.createElement("p");
  especie.textContent = "Espécie: " + (traducoes.species[p.species] || p.species);

  const origem = document.createElement("p");
  origem.textContent = "Origem: " + p.origin.name;

  const local = document.createElement("p");
  local.textContent = "Última localização: " + p.location.name;

  corpo.append(nome, status, especie, origem, local);
  card.appendChild(img);
  card.appendChild(botao);
  card.appendChild(corpo);
  return card;
}

function desenharCards(lista) {
  el.cards.replaceChildren();
  const visiveis = estado.soFavoritos ? lista.filter((p) => favoritos[p.id]) : lista;
  visiveis.forEach((p) => el.cards.appendChild(criarCard(p)));
  el.mensagem.textContent = visiveis.length
    ? ""
    : estado.soFavoritos
      ? "Nenhum favorito nesta página. Toque no coração de um card para salvar."
      : "Nenhum personagem encontrado. Tente outro nome ou status.";
}

function alternarFavorito(p, botao) {
  if (favoritos[p.id]) delete favoritos[p.id];
  else favoritos[p.id] = true;
  salvarFavoritos();
  if (estado.soFavoritos) return desenharCards(ultimosPersonagens);
  const ativo = !!favoritos[p.id];
  botao.classList.toggle("ativo", ativo);
  botao.setAttribute("aria-pressed", ativo);
  botao.textContent = ativo ? "♥" : "♡";
}

function atualizarPaginacao() {
  el.pagina.textContent = `Página ${estado.pagina} de ${estado.totalPaginas}`;
  el.anterior.disabled = estado.pagina <= 1;
  el.proxima.disabled = estado.pagina >= estado.totalPaginas;
}


let atraso;
el.busca.addEventListener("input", () => {
  clearTimeout(atraso);
  atraso = setTimeout(() => {
    estado.nome = el.busca.value.trim();
    estado.pagina = 1;
    buscarPersonagens();
  }, 350);
});
el.status.addEventListener("change", () => {
  estado.status = el.status.value;
  estado.pagina = 1;
  buscarPersonagens();
});
el.btnFav.addEventListener("click", () => {
  estado.soFavoritos = !estado.soFavoritos;
  el.btnFav.setAttribute("aria-pressed", estado.soFavoritos);
  desenharCards(ultimosPersonagens);
});
el.anterior.addEventListener("click", () => { estado.pagina--; buscarPersonagens(); window.scrollTo({ top: 0 }); });
el.proxima.addEventListener("click", () => { estado.pagina++; buscarPersonagens(); window.scrollTo({ top: 0 }); });

buscarPersonagens();