const UNIT_WORDS = new Map([
  ["cm", "cm"], ["centimetar", "cm"], ["centimetara", "cm"], ["centimetre", "cm"], ["centimeters", "cm"], ["centimeter", "cm"],
  ["mm", "mm"], ["milimetar", "mm"], ["milimetara", "mm"], ["milimetre", "mm"], ["millimeters", "mm"], ["millimeter", "mm"],
  ["g", "gr"], ["gr", "gr"], ["gram", "gr"], ["grama", "gr"], ["grami", "gr"], ["grams", "gr"],
  ["kg", "kg"], ["kilogram", "kg"], ["kilograma", "kg"], ["kilograms", "kg"],
  ["ml", "ml"], ["cl", "cl"], ["l", "l"], ["litar", "l"], ["litara", "l"], ["litre", "l"], ["liter", "l"], ["liters", "l"],
]);
const NUMBER_WORDS = new Map();
const addNumber = (value, words) => words.forEach((word) => NUMBER_WORDS.set(word, String(value)));
addNumber(1, ["jedan", "jedna", "jedno", "jednu", "one"]);
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
const NUMBER_TOKEN = /^\d+(?:\.\d+)?$/;
const MEASURE_TOKEN = /^\d+(?:\.\d+)?(?:cm|mm|ml|cl|l|gr|kg)$/;

function latin(value) {
  const cyrillic = { а:"a", б:"b", в:"v", г:"g", д:"d", ђ:"dj", е:"e", ж:"z", з:"z", и:"i", ј:"j", к:"k", л:"l", љ:"lj", м:"m", н:"n", њ:"nj", о:"o", п:"p", р:"r", с:"s", т:"t", ћ:"c", у:"u", ф:"f", х:"h", ц:"c", ч:"c", џ:"dz", ш:"s" };
  return String(value ?? "").toLowerCase().replace(/[а-яђжљњћџчш]/g, (letter) => cyrillic[letter] || letter)
    .replace(/p\*{2,}[a-z]*/g, " pizza ")
    .replace(/đ/g, "dj").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function canonical(value) {
  if (value === "jaja") return "jaje";
  if (["pica", "picca", "piza", "pitsa", "p***"].includes(value)) return "pizza";
  if (["pavlake", "pavlaku", "pavlaci"].includes(value)) return "pavlaka";
  if (["feferona", "feferone", "feferon"].includes(value)) return "feferoni";
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
function menuWords(menu) {
  const result = new Set();
  for (const item of menu || []) for (const token of tokens(item.name).map((entry) => entry.value)) {
    if (!isNumber(token) && !isMeasure(token)) result.add(token);
  }
  return result;
}
function appearsInMenu(value, words) {
  for (const word of words) if (word === value || word.includes(value) || value.includes(word) || similarity(value, word) >= 0.9) return true;
  return false;
}
function dynamicConnectors(source, menu) {
  const known = menuWords(menu);
  const skip = new Set();
  source.forEach((token, index) => {
    const value = token.value;
    if (!/^[a-z]+$/.test(value) || IGNORED.has(value) || appearsInMenu(value, known)) return;
    const hasCountBefore = source.slice(Math.max(0, index - 3), index)
      .some((entry) => isNumber(entry.value) && !isMeasure(entry.value));
    if (!hasCountBefore) return;
    const hasMenuWordAfter = source.slice(index + 1, index + 4)
      .some((entry) => appearsInMenu(entry.value, known));
    if (hasMenuWordAfter) skip.add(index);
  });
  return skip;
}

function titlePositions(source, itemName, dynamicSkip) {
  const title = tokens(itemName).map((entry) => entry.value);
  const found = [];
  if (!title.length) return found;
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
function similarity(a, b) {
  a = canonical(a); b = canonical(b);
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return 0.82;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length, 1);
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
  let selected = null; let bestDistance = Infinity;
  source.forEach((entry, index) => {
    if (used.has(index) || ownTitle.has(index) || !isNumber(entry.value) || isMeasure(entry.value)) return;
    const distance = index < bounds.start ? bounds.start - index : index > bounds.end ? index - bounds.end : 0;
    if (distance === 0 || distance > 3) return;
    if (index > bounds.end && distance > 1) return;
    if (index < bounds.start && distance > 2) return;

    // A number followed by a connector/count word and another item belongs to that next item.
    const nextSpan = allSpans.filter((candidate) => candidate.start > index && candidate.start > span.start
      && candidate.start - index <= 4).sort((a, b) => a.start - b.start)[0];
    if (nextSpan && nextSpan.start !== span.start) {
      let prefixPhrase = true;
      for (let between = index + 1; between < nextSpan.start; between += 1) {
        const word = source[between].value;
        if (dynamicSkip.has(between) || CONNECTORS.has(word) || COUNT_WORDS.has(word)
            || COMMANDS.has(word) || isMeasure(word)) continue;
        prefixPhrase = false; break;
      }
      if (prefixPhrase) return;
    }

    if (distance < bestDistance || (distance === bestDistance && index < bounds.start)) {
      selected = { index, value: Number(entry.value) }; bestDistance = distance;
    }
  });
  if (selected) used.add(selected.index);
  return selected;
}
function isAllowedExtra(value) {
  return isNumber(value) || isMeasure(value) || IGNORED.has(value) || CONNECTORS.has(value) || UNIT_WORDS.has(value) || COMMANDS.has(value);
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
    // A single spoken word that is only a weak sound-alike should open choices, not auto-add.
    return { matches: [], suggestions: suggest([heard[0].value], menu) };
  }

  const matchedSpans = [];
  const consumedHeard = new Set();
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
    if (!candidates.length) { cursor += 1; continue; }
    const top = candidates[0];
    const tied = candidates.filter((entry) => top.score - entry.score <= 0.06);
    const span = { start: heard[cursor].sourceIndex, end: heard[cursor + top.length - 1].sourceIndex };
    if (tied.length > 1 || top.score < 0.80) return { matches: [], suggestions: suggest(heard.slice(cursor, cursor + top.length).map((entry) => entry.value), candidates.slice(0, 8).map((entry) => entry.item)) };
    for (let index = cursor; index < cursor + top.length; index += 1) consumedHeard.add(index);
    matchedSpans.push({ item: top.item, span });
    cursor += top.length;
  }
  const unmatchedTerms = heard.filter((_, index) => !consumedHeard.has(index)).map((entry) => entry.value);
  if (unmatchedTerms.length) return { matches: [], suggestions: suggest(unmatchedTerms, menu) };
  const matches = [];
  const usedQuantities = new Set();
  for (const match of matchedSpans) {
    const quantity = quantityFor(source, match.span, match.item, dynamicSkip,
      matchedSpans.map((entry) => entry.span), usedQuantities);
    const amount = quantity?.value || 1;
    const existing = matches.find((entry) => entry.item.id === match.item.id);
    if (existing) existing.quantity = Math.min(99, existing.quantity + amount);
    else matches.push({ item: match.item, quantity: amount });
  }
  return { matches, suggestions: matches.length ? [] : suggest(heard.map((entry) => entry.value), menu) };
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
