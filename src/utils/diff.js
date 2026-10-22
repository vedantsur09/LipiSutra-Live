// Wraps every word the historian changed or added in <verified> tags.
// Uses a word-level longest-common-subsequence diff so inserting or deleting a
// word does not mark the rest of the text as changed, and keeps the edited
// text's own spacing and line breaks.
export function buildDiffTranscript(originalText, editedText) {
  const originalWords = (originalText || "").split(/\s+/).filter(Boolean);
  const editedTokens = (editedText || "").split(/(\s+)/);
  const editedWords = editedTokens.filter(token => token && !/^\s+$/.test(token));

  const rows = originalWords.length + 1;
  const cols = editedWords.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = originalWords.length - 1; i >= 0; i--) {
    for (let j = editedWords.length - 1; j >= 0; j--) {
      lcs[i][j] = originalWords[i] === editedWords[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const changed = new Set();
  let i = 0;
  let j = 0;
  while (j < editedWords.length) {
    if (i < originalWords.length && originalWords[i] === editedWords[j]) {
      i++;
      j++;
    } else if (i < originalWords.length && lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      changed.add(j);
      j++;
    }
  }

  let wordIndex = 0;
  return editedTokens.map(token => {
    if (!token || /^\s+$/.test(token)) return token;
    const isChanged = changed.has(wordIndex++);
    return isChanged ? `<verified>${token}</verified>` : token;
  }).join("");
}
