const UNIT_WORDS = new Map([
  ["cm", "cm"], ["centimetar", "cm"], ["centimetara", "cm"], ["centimetre", "cm"], ["centimeters", "cm"], ["centimeter", "cm"],
  ["mm", "mm"], ["milimetar", "mm"], ["milimetara", "mm"], ["milimetre", "mm"], ["millimeters", "mm"], ["millimeter", "mm"],
  ["g", "gr"], ["gr", "gr"], ["gram", "gr"], ["grama", "gr"], ["grami", "gr"], ["grams", "gr"],
  ["kg", "kg"], ["kilogram", "kg"], ["kilograma", "kg"], ["kilograms", "kg"],
  ["ml", "ml"], ["cl", "cl"], ["l", "l"], ["litar", "l"], ["litara", "l"], ["litre", "l"], ["liter", "l"], ["liters", "l"],
]);
const NUMBER_WORDS = new Map();
const addNumber = (value, words) => words.forEach((word) => NUMBER_WORDS.set(word, String(value)));
addNumber(1, ["jedan", "jedna", "jedno", "jednu", "jednom", "one"]);
addNumber(2, ["dva", "dvije", "dve", "dvoje", "two"]);
addNumber(3, ["tri", "three"]);
addNumber(4, ["cetiri", "cetri", "four"]);
addNumber(5, ["pet", "five"]);
addNumber(6, ["sest", "six"]);
addNumber(7, ["sedam", "seven"]);
addNumber(8, ["osam", "eight"]);
addNumber(9, ["devet", "nine"]);
addNumber(10, ["deset", "ten"]);
const TENS = new Map([["dvadeset", 20], ["trideset", 30], ["cetrdeset", 40], ["pedeset", 50], ["sezdeset", 60], ["sedamdeset", 70], ["osamdeset", 80], ["devedeset", 90]]);
const IGNORED = new Set([
  "i", "and", "plus", "pa", "te", "molim", "please", "daj", "dajte", "dodaj", "dodajte", "zelim", "hocu", "moze", "poruci", "porucite",
  "kom", "komad", "komada", "komadici", "komadica", "komadima", "piece", "pieces", "porcija", "porcije", "porciju", "porcijom", "porciji", "porcijama",
  "portion", "portions", "serving", "servings", "of", "x", "hrana", "food", "pice", "drink", "drinks",
]);
const COMMANDS = new Set(["molim", "please", "daj", "dajte", "dodaj", "dodajte", "zelim", "hocu", "moze", "poruci", "porucite"]);
const CONNECTORS = new Set(["i", "and", "plus", "pa", "te"]);
const COUNT_WORDS = new Set(["kom", "komad", "komada", "komadici", "komadica", "komadima", "piece", "pieces", "porcija", "porcije", "porciju", "porcijom", "porciji", "porcijama", "portion", "portions", "serving", "servings"]);
const CONTAINER_WORDS = new Set([
  "flasa", "flase", "flasu", "flasom", "casa", "case", "casu", "casom", "boca", "boce", "bocu", "bocom",
  "krigla", "krigle", "kriglu", "kriglom", "solja", "solje", "solju", "soljom"
]);
const NUMBER_TOKEN = /^\d+(?:\.\d+)?$/;
const MEASURE_TOKEN = /^\d+(?:\.\d+)?(?:cm|mm|ml|cl|l|gr|kg)$/;

function latin(value) {
  const cyrillic = { а:"a", б:"b", в:"v", г:"g", д:"d", ђ:"dj", е:"e", ж:"z", з:"z", и:"i", ј:"j", к:"k", л:"l", љ:"lj", м:"m", н:"n", њ:"nj", о:"o", п:"p", р:"r", с:"s", т:"t", ћ:"c", у:"u", ф:"f", х:"h", ц:"c", ч:"c", џ:"dz", ш:"s" };
  return String(value ?? "").toLowerCase().replace(/[а-яђжљњћџчш]/g, (letter) => cyrillic[letter] || letter)
    .replace(/p\*{2,}[a-z]*/g, " pizza ")
    .replace(/đ/g, "dj").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function stemWord(word) {
  if (!word || word.length <= 2) return word;

  // Specific restaurant / product canonicalizations
  if (word === "coca" || word === "koka") return "coca";
  if (word === "cola" || word === "kole" || word === "kolu" || word === "kola") return "cola";
  if (word === "kokakola" || word === "cocacola") return "coca cola";
  if (["pica", "picca", "piza", "pitsa", "pice", "pize", "picu"].includes(word)) return "pizza";
  if (["feferona", "feferone", "feferoni", "feferon"].includes(word)) return "feferon";
  if (["kifla", "kifle", "kiflu", "kifli"].includes(word)) return "kifl";
  if (["pivo", "piva", "pive", "pivom"].includes(word)) return "piv";
  if (["kafa", "kafe", "kafu", "kafi", "kava", "kave", "kavu"].includes(word)) return "kaf";
  if (["caj", "caja", "cajevi", "cajeve"].includes(word)) return "caj";
  if (["sok", "soka", "sokovi", "sokove"].includes(word)) return "sok";
  if (["vino", "vina", "vine", "vinom"].includes(word)) return "vin";
  if (["voda", "vode", "vodu", "vodom"].includes(word)) return "vod";
  if (["kisela", "kisele", "kiselu"].includes(word)) return "kisel";
  if (["corba", "corbe", "corbu"].includes(word)) return "corb";
  if (["teleca", "telece", "telecu"].includes(word)) return "telec";
  if (["cevap", "cevapi", "cevapa", "cevape"].includes(word)) return "cevap";
  if (["pljeskavica", "pljeskavice", "pljeskavicu"].includes(word)) return "pljeskavic";
  if (["palacinka", "palacinke", "palacinku"].includes(word)) return "palacink";
  if (["sendvic", "sendvica", "sendvice", "sendvici"].includes(word)) return "sendvic";
  if (["pomfrit", "pomfrita"].includes(word)) return "pomfrit";
  if (["pavlaka", "pavlake", "pavlaku", "pavlaci"].includes(word)) return "pavlak";
  if (word === "jaja") return "jaje";

  // Generic stemming rules for regular Serbian case endings (length >= 4)
  if (word.length >= 4) {
    if (word.endsWith("ovima") || word.endsWith("evima")) return word.slice(0, -5);
    if (word.endsWith("ama") || word.endsWith("ima") || word.endsWith("ovi") || word.endsWith("ove")) return word.slice(0, -3);
    if (word.endsWith("om") || word.endsWith("em")) return word.slice(0, -2);
    if (word.endsWith("a") || word.endsWith("e") || word.endsWith("i") || word.endsWith("o") || word.endsWith("u")) {
      return word.slice(0, -1);
    }
  }
  return word;
}

function canonical(value) {
  if (value === "jaja") return "jaje";
  if (["pica", "picca", "piza", "pitsa", "p***", "pizza"].includes(value)) return "pizza";
  if (["pavlake", "pavlaku", "pavlaci"].includes(value)) return "pavlaka";
  if (["feferona", "feferone", "feferon"].includes(value)) return "feferoni";
  if (value === "koka") return "coca";
  if (["kole", "kolu", "kola"].includes(value)) return "cola";
  if (value === "bjanka" || value === "bianca") return "bianca";
  return UNIT_WORDS.get(value) || value;
}

function tokens(text) {
  const normalized = latin(text).replace(/(?<=\d),(?=\d)/g, ".");
  const raw = normalized.match(/\d+(?:\.\d+)?|[a-z]+/g) || [];
  const expanded = [];
  for (let i = 0; i < raw.length; i += 1) {
    const part = raw[i];
    if (TENS.has(part)) {
      const next = NUMBER_WORDS.get(raw[i + 1]);
      if (next && Number(next) < 10) { expanded.push(String(TENS.get(part) + Number(next))); i += 1; continue; }
      expanded.push(String(TENS.get(part))); continue;
    }
    let fused = false;
    for (const [ten, value] of TENS) {
      if (part.startsWith(ten) && NUMBER_WORDS.has(part.slice(ten.length))) {
        const unit = Number(NUMBER_WORDS.get(part.slice(ten.length)));
        if (unit > 0 && unit < 10) { expanded.push(String(value + unit)); fused = true; break; }
      }
    }
    if (!fused) expanded.push(NUMBER_WORDS.get(part) || UNIT_WORDS.get(part) || part);
  }
  const result = [];
  for (let i = 0; i < expanded.length; i += 1) {
    const value = expanded[i];
    const nextUnit = UNIT_WORDS.get(expanded[i + 1]);
    if (NUMBER_TOKEN.test(value) && nextUnit) {
      result.push({ value: `${value}${nextUnit}`, rawIndex: i });
      i += 1;
    } else {
      result.push({ value: canonical(value), rawIndex: i });
    }
  }
  return result;
}

function isNumber(value) { return NUMBER_TOKEN.test(value); }
function isMeasure(value) { return MEASURE_TOKEN.test(value); }

function appearsInMenu(value, words) {
  for (const word of words) {
    if (word === value || word.includes(value) || value.includes(word) || similarity(value, word) >= 0.80) return true;
  }
  return false;
}

function dynamicConnectors(source, menu) {
  const skip = new Set();
  source.forEach((token, index) => {
    const value = token.value;
    // Only treat as dynamic connector if it's explicitly a container word or count word
    if (CONTAINER_WORDS.has(value) || COUNT_WORDS.has(value)) {
      skip.add(index);
    }
  });
  return skip;
}

function titlePositions(source, itemName, dynamicSkip) {
  const baseTitle = tokens(itemName).map((entry) => entry.value);
  const found = [];
  if (!baseTitle.length) return found;

  // Generate variants for word order variations (e.g. "Pizza 4 u 1 45cm" vs "4 u 1 Pizza 45cm")
  const titleVariants = [baseTitle];
  if (baseTitle.length > 1 && ["pizza", "pica"].includes(baseTitle[0])) {
    const withoutPizza = baseTitle.slice(1);
    titleVariants.push([...withoutPizza, baseTitle[0]]);
    if (baseTitle.length >= 3) {
      titleVariants.push([...baseTitle.slice(1, -1), baseTitle[0], baseTitle[baseTitle.length - 1]]);
    }
  }

  for (const title of titleVariants) {
    for (let start = 0; start < source.length; start += 1) {
      let titleIndex = 0;
      let sourceIndex = start;
      const positions = [];
      while (titleIndex < title.length && sourceIndex < source.length) {
        const value = source[sourceIndex].value;
        if (dynamicSkip.has(sourceIndex)) { sourceIndex += 1; continue; }
        if (CONNECTORS.has(value) && value !== title[titleIndex]) { sourceIndex += 1; continue; }
        if (["pizza", "pica"].includes(canonical(value))
            && !["pizza", "pica"].includes(canonical(title[titleIndex]))) { sourceIndex += 1; continue; }
        const heard = canonical(value); const wanted = canonical(title[titleIndex]);
        if (!(heard === wanted || (!(isNumber(heard) || isMeasure(heard)) && suggestionSimilarity(heard, wanted) >= 0.80))) break;
        positions.push(sourceIndex);
        titleIndex += 1;
        sourceIndex += 1;
      }
      if (titleIndex === title.length) found.push(new Set(positions));
    }
  }
  return found;
}

function coreTokens(text) {
  const core = tokens(text).map((entry) => entry.value).filter((value) => !isNumber(value) && !isMeasure(value) && !IGNORED.has(value));
  return core.length > 1 ? core.filter((value) => !["pizza", "pica"].includes(canonical(value))) : core;
}

function meaningfulTokens(source, skip) {
  let meaningful = source.map((entry, index) => ({ ...entry, sourceIndex: index }))
    .filter((entry, index) => !skip.has(index) && !isNumber(entry.value) && !isMeasure(entry.value) && !IGNORED.has(entry.value));
  if (meaningful.length > 1) meaningful = meaningful.filter((entry) => !["pizza", "pica"].includes(canonical(entry.value)));
  return meaningful;
}

export function similarity(a, b) {
  a = canonical(a); b = canonical(b);
  if (a === b) return 1;
  const sa = stemWord(a);
  const sb = stemWord(b);
  if (sa === sb) return 1;
  if (sa.length >= 3 && sb.length >= 3 && (sa.includes(sb) || sb.includes(sa))) return 0.85;

  const row = Array.from({ length: sb.length + 1 }, (_, i) => i);
  for (let i = 1; i <= sa.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= sb.length; j += 1) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (sa[i - 1] === sb[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return 1 - row[sb.length] / Math.max(sa.length, sb.length, 1);
}

function suggestionSimilarity(a, b) {
  const spokenKey = canonical(a).replace(/k/g, "c").replace(/qu/g, "c").replace(/ph/g, "f").replace(/w/g, "v").replace(/(.)\1+/g, "$1");
  const menuKey = canonical(b).replace(/k/g, "c").replace(/qu/g, "c").replace(/ph/g, "f").replace(/w/g, "v").replace(/(.)\1+/g, "$1");
  return Math.max(similarity(a, b), similarity(spokenKey, menuKey));
}

function matchTokenLists(heard, wanted, threshold = 0.72) {
  if (heard.length !== wanted.length) return null;
  const used = new Set();
  let total = 0;
  for (const token of heard) {
    let best = -1; let bestScore = 0;
    wanted.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = similarity(token, candidate);
      if (score > bestScore) { best = index; bestScore = score; }
    });
    if (best < 0 || bestScore < threshold) return null;
    used.add(best); total += bestScore;
  }
  return total / Math.max(heard.length, 1);
}

function quantityFor(source, span, item, dynamicSkip, allSpans = [span], used = new Set()) {
  const ownTitle = new Set(titlePositions(source, item.name, dynamicSkip).flatMap((set) => [...set]));
  const titleIndexes = [...ownTitle];
  const bounds = titleIndexes.length ? { start: Math.min(...titleIndexes), end: Math.max(...titleIndexes) } : span;

  // Find the previous and next item spans to establish non-overlapping boundaries
  const otherSpans = allSpans.filter(s => s !== span && !(s.start === span.start && s.end === span.end));
  const prevSpans = otherSpans.filter(s => s.end < bounds.start).sort((a, b) => b.end - a.end);
  const nextSpans = otherSpans.filter(s => s.start > bounds.end).sort((a, b) => a.start - b.start);
  const minBoundary = prevSpans.length ? prevSpans[0].end + 1 : 0;
  const maxBoundary = nextSpans.length ? nextSpans[0].start - 1 : source.length - 1;

  // 1. Check for immediate prefix quantity: e.g. "2 kifle", "dvije telece corbe"
  // If there is a number between minBoundary and bounds.start, it is naturally a prefix quantity for this item!
  for (let i = bounds.start - 1; i >= Math.max(minBoundary, bounds.start - 3); i -= 1) {
    if (used.has(i)) break;
    const valStr = source[i].value;
    if (CONNECTORS.has(valStr) || COUNT_WORDS.has(valStr) || CONTAINER_WORDS.has(valStr)) continue;
    if (isNumber(valStr) && !isMeasure(valStr)) {
      const val = Number(valStr);
      if (val >= 1 && val <= 99) {
        used.add(i);
        return { index: i, value: val };
      }
    }
    break;
  }

  // 2. Check for immediate suffix quantity: e.g. "kifle 2", "feferone 3", "teleca corba 2"
  // Only valid if between bounds.end and maxBoundary
  for (let i = bounds.end + 1; i <= Math.min(maxBoundary, bounds.end + 2); i += 1) {
    if (used.has(i)) break;
    const valStr = source[i].value;
    if (CONNECTORS.has(valStr) || COUNT_WORDS.has(valStr)) continue;
    if (isNumber(valStr) && !isMeasure(valStr)) {
      const val = Number(valStr);
      if (val >= 1 && val <= 99) {
        used.add(i);
        return { index: i, value: val };
      }
    }
    break;
  }

  // 3. Fallback search within [minBoundary, maxBoundary]
  let selected = null; let bestDistance = Infinity;
  for (let index = minBoundary; index <= maxBoundary; index += 1) {
    const entry = source[index];
    if (used.has(index) || ownTitle.has(index) || !isNumber(entry.value) || isMeasure(entry.value)) continue;
    const distance = index < bounds.start ? bounds.start - index : index > bounds.end ? index - bounds.end : 0;
    if (distance === 0 || distance > 3) continue;

    if (distance < bestDistance || (distance === bestDistance && index < bounds.start)) {
      selected = { index, value: Number(entry.value) }; bestDistance = distance;
    }
  }
  if (selected) used.add(selected.index);
  return selected;
}

function quantityNearSpan(source, span, used = new Set()) {
  let found = null; let bestDistance = Infinity;
  source.forEach((entry, index) => {
    if (used.has(index) || !isNumber(entry.value) || isMeasure(entry.value)) return;
    const distance = index < span.start ? span.start - index : index > span.end ? index - span.end : 0;
    if (!distance || distance > 2 || (index > span.end && distance > 1)) return;
    const value = Number(entry.value);
    if (value < 1 || value > 99) return;
    if (distance < bestDistance) { found = { index, value }; bestDistance = distance; }
  });
  if (found) used.add(found.index);
  return found?.value || 1;
}

function isAllowedExtra(value) {
  return isNumber(value) || isMeasure(value) || IGNORED.has(value) || CONNECTORS.has(value) || UNIT_WORDS.has(value) || COMMANDS.has(value) || CONTAINER_WORDS.has(value);
}

function suggest(query, menu, limit = 6) {
  if (!query.length) return menu.slice(0, limit).map((item) => ({ item, score: 0 }));
  const ranked = [];
  for (const item of menu) {
    const name = coreTokens(item.name);
    if (!name.length) continue;
    const queryMatches = query.map((term) => Math.max(...name.map((word) => suggestionSimilarity(term, word))));
    const coverage = queryMatches.reduce((sum, match) => sum + match, 0) / queryMatches.length;
    const completeness = name.reduce((sum, word) => sum + Math.max(...query.map((term) => suggestionSimilarity(term, word))), 0) / name.length;
    const score = coverage * 0.75 + completeness * 0.25;
    if (Math.max(...queryMatches) >= 0.58 && coverage >= 0.50 && score >= 0.45) {
      ranked.push({ item, score });
    }
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function resolveVoiceOrder(transcript, menu) {
  const source = tokens(transcript);
  if (!source.length || !menu?.length) return { matches: [], suggestions: [] };
  const dynamicSkip = dynamicConnectors(source, menu);
  let exact = [];
  for (const item of menu) for (const positions of titlePositions(source, item.name, dynamicSkip)) {
    const allowed = source.every((entry, index) => positions.has(index) || dynamicSkip.has(index) || isAllowedExtra(entry.value));
    if (allowed) exact.push({ item, positions });
  }
  if (exact.length === 1) {
    const { item, positions } = exact[0];
    const span = { start: Math.min(...positions), end: Math.max(...positions) };
    const quantity = quantityFor(source, span, item, dynamicSkip)?.value || 1;
    return { matches: [{ item, quantity }], suggestions: [] };
  }
  if (exact.length > 1) return { matches: [], suggestions: suggest(coreTokens(transcript), exact.map((entry) => entry.item)) };

  const heard = meaningfulTokens(source, dynamicSkip);
  if (!heard.length) return { matches: [], suggestions: [] };
  if (heard.length === 1 && canonical(heard[0].value) === "pizza") {
    const pizzas = menu.filter((item) => coreTokens(`${item.name || ""} ${item.category || ""}`).includes("pizza"));
    if (pizzas.length) return { matches: [], suggestions: pizzas.map((item) => ({ item, score: 1 })) };
  }

  if (heard.length === 1) {
    const candidates = menu.map((item) => ({ item, score: matchTokenLists([heard[0].value], coreTokens(item.name), 0.80) }))
      .filter((entry) => entry.score !== null)
      .sort((a, b) => b.score - a.score);
    if (candidates.length === 1) {
      const span = { start: heard[0].sourceIndex, end: heard[0].sourceIndex };
      return { matches: [{ item: candidates[0].item, quantity: quantityFor(source, span, candidates[0].item, dynamicSkip)?.value || 1 }], suggestions: [] };
    }
    if (candidates.length > 1) return { matches: [], suggestions: candidates.slice(0, 8) };
    return { matches: [], suggestions: suggest([heard[0].value], menu) };
  }

  const matchedSpans = [];
  const consumedHeard = new Set();
  const unresolvedTerms = [];
  let unresolvedSpan = null;
  let cursor = 0;
  while (cursor < heard.length) {
    const candidates = [];
    for (const item of menu) {
      const name = coreTokens(item.name);
      if (!name.length || cursor + name.length > heard.length) continue;
      const slice = heard.slice(cursor, cursor + name.length).map((entry) => entry.value);
      let score = matchTokenLists(slice, name, 0.55);
      if (score !== null) {
        const sizeMatched = titlePositions(source, item.name, dynamicSkip)
          .some((positions) => [...positions].some((position) => isMeasure(source[position].value)));
        if (sizeMatched) score += 0.22;
        candidates.push({ item, score, length: name.length });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) {
      const entry = heard[cursor];
      unresolvedTerms.push(entry.value);
      if (!unresolvedSpan) unresolvedSpan = { start: entry.sourceIndex, end: entry.sourceIndex };
      cursor += 1;
      continue;
    }
    const top = candidates[0];
    const tied = candidates.filter((entry) => top.score - entry.score <= 0.06);
    const span = { start: heard[cursor].sourceIndex, end: heard[cursor + top.length - 1].sourceIndex };
    if (tied.length > 1 || top.score < 0.80) {
      unresolvedTerms.push(...heard.slice(cursor, cursor + top.length).map((entry) => entry.value));
      if (!unresolvedSpan) unresolvedSpan = span;
      cursor += top.length;
      continue;
    }
    for (let index = cursor; index < cursor + top.length; index += 1) consumedHeard.add(index);
    matchedSpans.push({ item: top.item, span });
    cursor += top.length;
  }
  const unmatchedTerms = heard.filter((_, index) => !consumedHeard.has(index)).map((entry) => entry.value);
  for (const term of unmatchedTerms) if (!unresolvedTerms.includes(term)) unresolvedTerms.push(term);
  const matches = [];
  const usedQuantities = new Set();
  for (const match of matchedSpans) {
    const quantity = quantityFor(source, match.span, match.item, dynamicSkip,
      matchedSpans.map((entry) => entry.span), usedQuantities);
    const amount = quantity?.value || 1;
    const existing = matches.find((entry) => entry.item === match.item || (entry.item.id != null && entry.item.id === match.item.id));
    if (existing) existing.quantity = Math.min(99, existing.quantity + amount);
    else matches.push({ item: match.item, quantity: amount });
  }
  const suggestionQuantity = unresolvedSpan ? quantityNearSpan(source, unresolvedSpan, usedQuantities) : 1;
  return {
    matches,
    suggestions: unresolvedTerms.length ? suggest(unresolvedTerms, menu) : (matches.length ? [] : suggest(heard.map((entry) => entry.value), menu)),
    suggestionQuantity,
    unresolvedTerms,
  };
}

export function displayVoiceTranscript(transcript) {
  return String(transcript ?? "").replace(/p\*{2,}[a-z]*/gi, "pizza");
}

export function inferVoiceQuantity(transcript, item) {
  const source = tokens(transcript);
  const skip = dynamicConnectors(source, item ? [item] : []);
  const positions = new Set(item ? titlePositions(source, item.name, skip).flatMap((set) => [...set]) : []);
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index].value;
    if (positions.has(index) || !isNumber(value) || isMeasure(value)) continue;
    const quantity = Number(value);
    if (quantity >= 1 && quantity <= 99) return quantity;
  }
  return 1;
}
