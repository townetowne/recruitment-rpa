export function extractVerifiedBossCandidatesFromJsonl(jsonlText) {
  const latestByJobKey = new Map();

  for (const line of String(jsonlText || '').split('\n')) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record?.kind !== 'job_decision' || !record.jobKey) continue;
    latestByJobKey.set(record.jobKey, record);
  }

  return [...latestByJobKey.values()]
    .filter((record) => record.status === 'verified')
    .map((record) => record.candidate)
    .filter((candidate) => candidate && typeof candidate === 'object');
}
