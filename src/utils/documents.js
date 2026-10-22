// Firestore "documents" records come in two shapes: older ones keep the analysis
// at the top level, newer ones nest it under ai_output. Historian edits live in
// historian_output. These helpers flatten both shapes into one result object.

const RESULT_FIELDS = [
  "script", "era", "overallAccuracy", "transcript", "aiPredictions",
  "reconstructionNeeded", "modernMarathi", "summary", "locations"
];

const ANNOTATION_TAGS = /<\/?(predict|reconstruct|verified)[^>]*>/g;

export function stripAnnotationTags(text) {
  return (text || "").replace(ANNOTATION_TAGS, "");
}

// Accepts "85%", "85", 85 or 0.85 and returns a whole percentage
export function parseAccuracy(value) {
  const number = parseFloat(String(value ?? "").replace("%", ""));
  if (isNaN(number)) return 0;
  return Math.round(number <= 1 ? number * 100 : number);
}

function pickResultFields(source) {
  const picked = {};
  RESULT_FIELDS.forEach(field => {
    if (source?.[field] !== undefined && source[field] !== null) picked[field] = source[field];
  });
  return picked;
}

// The analysis result to show for a stored record, historian edits taking priority
export function toResult(data) {
  return {
    ...pickResultFields(data?.ai_output),
    ...pickResultFields(data),
    ...pickResultFields(data?.historian_output)
  };
}

// A flat record for the historian queue and museum dashboard
export function normalizeDocument(id, data) {
  return {
    id,
    ...toResult(data),
    status: data.status || "pending",
    isVerified: data.status === "verified" || data.editedOnce === true,
    searchCount: data.searchCount ?? data.view_count ?? 0,
    imageSrc: data.image_thumb || data.imageUrl || null,
    timestamp: data.timestamp || null
  };
}
