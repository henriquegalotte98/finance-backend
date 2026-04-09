/**
 * Tema visual e textual por destino (comida, passeios, imagens temáticas).
 * Imagens: LoremFlickr com tags alinhadas ao destino (comida / cidade / natureza).
 */

function normalize(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** URL de imagem temática (LoremFlickr: tags separadas por vírgula) */
function flickr(tags) {
  const t = tags.map((x) => encodeURIComponent(x.replace(/\s+/g, ""))).join(",");
  return `https://loremflickr.com/1200/700/${t}`;
}

const DEFAULT_THEME = {
  label: "Viagem",
  foodHighlights: ["Prove pratos locais em mercados e feiras.", "Pergunte por recomendações de moradores.", "Reserve um jantar típico uma noite."],
  activityHighlights: ["Caminhe pelo centro histórico.", "Reserve um museu ou tour guiado.", "Inclua um passeio ao ar livre."],
  foodTags: ["food", "travel"],
  activityTags: ["landmark", "city"],
  landmarkTags: ["cityscape", "travel"],
  accent: "#6366f1"
};

/** Temas por palavras-chave no destino (ordem: mais específico primeiro) */
const THEMES = [
  {
    match: (_d, original) => {
      const o = String(original || "");
      if (/bel[eé]m|amazon|manaus|macap[aá]|tacac[aá]|santar[eé]m|alter\s*do\s*ch[aã]o|ver-o-peso|estado\s+do\s+par[aá]/i.test(o)) {
        return true;
      }
      if (/(^|[\s,])par[aá]($|[\s,])/i.test(o)) return true;
      return false;
    },
    label: "Amazônia / Pará",
    foodHighlights: [
      "Experimente tacacá, maniçoba e arroz paraense.",
      "Peixe na brasa, camarão e caranguejo são clássicos.",
      "Prove açaí puro com peixe ou farinha — combinação local."
    ],
    activityHighlights: [
      "Passeio de barco nos igarapés ou rios.",
      "Mercado Ver-o-Peso e centro histórico de Belém.",
      "Ilha de Algodoal ou ilhas próximas, conforme a região."
    ],
    foodTags: ["seafood", "brazil", "fish"],
    activityTags: ["river", "boat", "tropical"],
    landmarkTags: ["amazon", "brazil", "jungle"],
    accent: "#059669"
  },
  {
    match: (d) => /nordeste|salvador|recife|fortaleza|natal|joao pessoa|maceio|aracaju|sergipe|pernambuco|bahia|ceara|ceará/i.test(d),
    label: "Nordeste (Brasil)",
    foodHighlights: [
      "Acarajé, moqueca, vatapá e camarão na moranga (conforme estado).",
      "Cuscuz, tapioca e doces de festa junina.",
      "Caldo de sururu e peixes regionais na costa."
    ],
    activityHighlights: [
      "Praias, centro histórico e mercados municipais.",
      "Pelourinho (Salvador) ou Boa Viagem (Recife), conforme cidade.",
      "Passeios de buggy ou catamarã onde houver."
    ],
    foodTags: ["brazilian", "food", "seafood"],
    activityTags: ["beach", "brazil", "coast"],
    landmarkTags: ["beach", "palm", "ocean"],
    accent: "#ea580c"
  },
  {
    match: (d) => /italia|italy|roma|rome|veneza|venice|milao|milan|florenca|florence|napoles|sicilia|toscana/i.test(d),
    label: "Itália",
    foodHighlights: [
      "Massas frescas, molhos regionais e queijos (parmesão, pecorino).",
      "Antipasti, vinho e azeite de oliva extra virgem.",
      "Gelato artesanal e espresso após as refeições."
    ],
    activityHighlights: [
      "Coliseu, Fórum e museus (Roma) ou canais (Veneza), conforme cidade.",
      "Passeios gastronômicos em bairros tradicionais.",
      "Igrejas, praças e jardins históricos."
    ],
    foodTags: ["pasta", "italian", "cheese"],
    activityTags: ["rome", "italy", "architecture"],
    landmarkTags: ["italy", "city", "europe"],
    accent: "#16a34a"
  },
  {
    match: (d) => /franca|france|paris|lyon|nice|bordeaux|marselha|provence/i.test(d),
    label: "França",
    foodHighlights: [
      "Baguete, queijos, vinhos e confeitaria francesa.",
      "Cassoulet, bouillabaisse ou pratos regionais conforme a cidade.",
      "Mercados cobertos para almoço leve."
    ],
    activityHighlights: [
      "Museus, jardins e bairros históricos.",
      "Passeio ao longo do rio ou mirantes urbanos.",
      "Tour de arte e arquitetura."
    ],
    foodTags: ["french", "pastry", "wine"],
    activityTags: ["paris", "france", "eiffel"],
    landmarkTags: ["paris", "france", "city"],
    accent: "#2563eb"
  },
  {
    match: (d) => /espanha|spain|madrid|barcelona|sevilha|granada|valencia|ibiza/i.test(d),
    label: "Espanha",
    foodHighlights: [
      "Tapas, paella, jamón ibérico e churros.",
      "Vinho e sangria em bares de bairro.",
      "Mercados como La Boqueria (Barcelona) ou San Miguel (Madrid)."
    ],
    activityHighlights: [
      "Arquitetura mourisca, praias mediterrâneas ou flamenco (Sul).",
      "Parques urbanos e bairros boêmios.",
      "Museus de arte moderna e histórica."
    ],
    foodTags: ["tapas", "spanish", "paella"],
    activityTags: ["barcelona", "spain", "architecture"],
    landmarkTags: ["spain", "city", "europe"],
    accent: "#dc2626"
  },
  {
    match: (d) => /japao|japan|tokyo|osaka|kyoto|hiroshima|hokkaido/i.test(d),
    label: "Japão",
    foodHighlights: [
      "Ramen, sushi, tempurá e izakayas locais.",
      "Doces de matcha e wagashi em confeitarias tradicionais.",
      "Experimente kaiseki em ocasiões especiais."
    ],
    activityHighlights: [
      "Templos, santuários e jardins zen.",
      "Bairros tradicionais e mercados de peixe.",
      "Vistas noturnas e observatórios urbanos."
    ],
    foodTags: ["sushi", "japanese", "food"],
    activityTags: ["tokyo", "japan", "temple"],
    landmarkTags: ["japan", "mountain", "city"],
    accent: "#db2777"
  },
  {
    match: (d) => /portugal|lisboa|oporto|porto|algarve|sintra/i.test(d),
    label: "Portugal",
    foodHighlights: [
      "Bacalhau de mil maneiras, pastéis de nata e vinhos do Douro.",
      "Petiscos e mariscos na costa.",
      "Pão com manteiga e café em pastelarias."
    ],
    activityHighlights: [
      "Elétricos em Lisboa, azulejos e miradouros.",
      "Passeios à beira-rio no Porto.",
      "Palácios e vilas históricas (Sintra)."
    ],
    foodTags: ["portuguese", "seafood", "pastry"],
    activityTags: ["lisbon", "portugal", "tram"],
    landmarkTags: ["lisbon", "coast", "europe"],
    accent: "#0d9488"
  },
  {
    match: (d) => /miami|orlando|nova york|new york|los angeles|california|usa|eua|estados unidos/i.test(d),
    label: "Estados Unidos",
    foodHighlights: [
      "Food trucks, brunch e cozinha fusion urbana.",
      "Steak houses, fast food artesanal e doces típicos por região.",
      "Farmers markets ao fim de semana."
    ],
    activityHighlights: [
      "Parques nacionais, museus e atrações urbanas.",
      "Compras e entretenimento em áreas turísticas.",
      "Passeios de carro ou metrô conforme a cidade."
    ],
    foodTags: ["burger", "american", "food"],
    activityTags: ["newyork", "city", "skyline"],
    landmarkTags: ["usa", "city", "urban"],
    accent: "#7c3aed"
  },
  {
    match: (d) => /rio de janeiro|rj\b|carioca|copacabana|ipanema/i.test(d),
    label: "Rio de Janeiro",
    foodHighlights: [
      "Feijoada, churrasco e açaí na praia.",
      "Pastel e caldo de cana em feiras.",
      "Peixe e frutos do mar na orla."
    ],
    activityHighlights: [
      "Cristo Redentor, Pão de Açúcar e mirantes.",
      "Praias, calçadões e centro histórico.",
      "Trilhas urbanas (Tijuca) se houver tempo."
    ],
    foodTags: ["brazilian", "bbq", "beach"],
    activityTags: ["riodejaneiro", "beach", "brazil"],
    landmarkTags: ["rio", "brazil", "coast"],
    accent: "#f59e0b"
  },
  {
    match: (d) => /sao paulo|são paulo|sp\b/i.test(d),
    label: "São Paulo",
    foodHighlights: [
      "Culinária multicultural: japonesa, italiana, árabe e nordestina.",
      "Mercados municipais e feiras gastronômicas.",
      "Café especial e padarias artesanais."
    ],
    activityHighlights: [
      "Avenida Paulista, museus e parques.",
      "Bairros boêmios e vida noturna.",
      "Compras e arquitetura urbana."
    ],
    foodTags: ["restaurant", "urban", "food"],
    activityTags: ["sao paulo", "city", "brazil"],
    landmarkTags: ["skyline", "brazil", "city"],
    accent: "#64748b"
  }
];

export function getDestinationTheme(destinationRaw) {
  const d = normalize(destinationRaw);
  const original = String(destinationRaw || "").trim();

  for (const t of THEMES) {
    if (t.match(d, original)) {
      return {
        label: t.label,
        foodHighlights: t.foodHighlights,
        activityHighlights: t.activityHighlights,
        media: {
          foodPhoto: flickr(t.foodTags),
          activitiesPhoto: flickr(t.activityTags),
          destinationPhoto: flickr(t.landmarkTags)
        },
        accent: t.accent
      };
    }
  }

  const safe = d.replace(/[^a-z0-9]+/g, " ").trim() || "travel";
  const words = safe.split(/\s+/).slice(0, 2);
  const tag1 = words[0] || "travel";
  const tag2 = words[1] || "city";

  return {
    label: original || "Destino",
    foodHighlights: DEFAULT_THEME.foodHighlights.map((x) => x.replace("local", tag1)),
    activityHighlights: DEFAULT_THEME.activityHighlights,
    media: {
      foodPhoto: flickr([tag1, "food", "cuisine"]),
      activitiesPhoto: flickr([tag1, tag2, "tourism"]),
      destinationPhoto: flickr([tag1, "landscape", "travel"])
    },
    accent: DEFAULT_THEME.accent
  };
}
