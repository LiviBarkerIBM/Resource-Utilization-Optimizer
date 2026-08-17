/**
 * Scoring Engine
 * Returns a full scored result for a consultant against a role.
 * All dimension scores are 0-100. Final score is a weighted composite.
 */

const WEIGHTS = {
  skills: 0.35,
  band: 0.20,
  availability: 0.18,
  location: 0.10,
  jrs: 0.10,
  certifications: 0.07,
};

// ---------- helpers ----------

function daysBetween(dateStrA, dateStrB) {
  return (new Date(dateStrA) - new Date(dateStrB)) / (1000 * 60 * 60 * 24);
}

function normalizeSkill(s) {
  return s.toLowerCase().trim();
}

// ---------- dimension scorers ----------

export function scoreSkills(consultant, role) {
  const required = role.requiredSkills.map(normalizeSkill);
  const niceToHave = role.niceToHaveSkills.map(normalizeSkill);
  const consultantSkills = consultant.skills.map(normalizeSkill);

  const requiredMatched = required.filter((s) => consultantSkills.includes(s));
  const niceMatched = niceToHave.filter((s) => consultantSkills.includes(s));

  const requiredScore =
    required.length > 0 ? (requiredMatched.length / required.length) * 100 : 100;
  const niceScore =
    niceToHave.length > 0 ? (niceMatched.length / niceToHave.length) * 20 : 0; // bonus up to 20

  // CV recency penalty
  let cvPenalty = 0;
  if (!consultant.cvExists) cvPenalty = 15;
  else if (consultant.cvRecencyMonths > 12) cvPenalty = 10;
  else if (consultant.cvRecencyMonths > 6) cvPenalty = 5;

  const raw = Math.min(100, requiredScore + niceScore - cvPenalty);
  return {
    score: Math.max(0, Math.round(raw)),
    requiredMatched: requiredMatched.length,
    requiredTotal: required.length,
    niceMatched: niceMatched.length,
    niceTotal: niceToHave.length,
    missingRequired: required.filter((s) => !consultantSkills.includes(s)),
  };
}

export function scoreBand(consultant, role) {
  const { band } = consultant;
  const { bandMin, bandMax } = role;

  if (band >= bandMin && band <= bandMax) {
    return { score: 100, note: "Exact band range match" };
  }
  if (band === bandMin - 1) {
    return { score: 75, note: "One band below minimum — acceptable if skills sufficient" };
  }
  if (band === bandMax + 1) {
    return { score: 70, note: "One band above maximum — may be overqualified" };
  }
  if (band < bandMin - 1) {
    return { score: Math.max(0, 50 - (bandMin - 1 - band) * 20), note: "Band significantly below requirement" };
  }
  return { score: Math.max(0, 40 - (band - bandMax - 1) * 20), note: "Band significantly above requirement" };
}

export function scoreAvailability(consultant, role) {
  const days = daysBetween(consultant.availabilityDate, role.startDate);
  // days < 0 → consultant available before role starts (ideal range: 0-30 days early)
  // days > 0 → consultant available after role starts (gap)

  if (days <= 0 && days >= -30) {
    return { score: 100, note: "Available within 30 days of role start", daysGap: Math.abs(days) };
  }
  if (days < -30 && days >= -60) {
    return { score: 85, note: "Available 30-60 days early", daysGap: Math.abs(days) };
  }
  if (days < -60) {
    return { score: 65, note: "Available well before role start (potential gap risk)", daysGap: Math.abs(days) };
  }
  if (days > 0 && days <= 14) {
    return { score: 80, note: "Available within 2 weeks after start", daysGap: days };
  }
  if (days > 14 && days <= 30) {
    return { score: 60, note: "Available 2-4 weeks after start", daysGap: days };
  }
  return { score: Math.max(0, Math.round(40 - days * 0.5)), note: "Availability significantly misaligned", daysGap: days };
}

export function scoreLocation(consultant, role) {
  if (!role.travelRequired && !consultant.travelWillingness) {
    // Both are local-only — check same city/state
    const cCity = consultant.location.split(",")[1]?.trim();
    const rCity = role.location.split(",")[1]?.trim();
    if (cCity && rCity && cCity === rCity) return { score: 100, note: "Same state, no travel required" };
    return { score: 55, note: "Different location, travel not possible" };
  }
  if (role.travelRequired && !consultant.travelWillingness) {
    return { score: 40, note: "Travel required but consultant unwilling to travel" };
  }
  const cState = consultant.location.split(",")[1]?.trim();
  const rState = role.location.split(",")[1]?.trim();
  if (cState && rState && cState === rState) {
    return { score: 100, note: "Same state" };
  }
  // Different states but travel willing
  if (consultant.travelWillingness) {
    return { score: 85, note: "Different location, travel willing" };
  }
  return { score: 60, note: "Different location" };
}

export function scoreJRS(consultant, role) {
  if (consultant.jrs === role.jrs) {
    return { score: 100, note: "Exact JRS match" };
  }
  // Partial match heuristic (shared keywords)
  const consultantWords = consultant.jrs.toLowerCase().split(/\s+/);
  const roleWords = role.jrs.toLowerCase().split(/\s+/);
  const shared = consultantWords.filter((w) => roleWords.includes(w) && w.length > 3);
  if (shared.length > 0) {
    return { score: 50 + shared.length * 10, note: `Partial JRS overlap: ${shared.join(", ")}` };
  }
  return { score: 20, note: "No JRS alignment" };
}

export function scoreCertifications(consultant, role) {
  if (role.certifications.length === 0) return { score: 100, note: "No certifications required", missing: [] };
  const consultantCerts = consultant.certifications.map((c) => c.toLowerCase());
  const required = role.certifications.map((c) => c.toLowerCase());
  const matched = required.filter((c) => consultantCerts.includes(c));
  const missing = role.certifications.filter(
    (c) => !consultant.certifications.map((x) => x.toLowerCase()).includes(c.toLowerCase())
  );
  const score = Math.round((matched.length / required.length) * 100);
  return { score, note: matched.length === required.length ? "All certifications met" : `Missing ${missing.length} certification(s)`, missing };
}

// ---------- gap & risk analysis ----------

export function buildRisks(consultant, role, dimensions) {
  const risks = [];

  if (dimensions.certifications.missing?.length > 0) {
    risks.push({
      type: "Missing Certifications",
      severity: "medium",
      detail: `Missing: ${dimensions.certifications.missing.join(", ")}`,
    });
  }
  if (dimensions.skills.missingRequired?.length > 0) {
    risks.push({
      type: "Missing Required Skills",
      severity: dimensions.skills.missingRequired.length > 2 ? "high" : "medium",
      detail: `Missing: ${dimensions.skills.missingRequired.join(", ")}`,
    });
  }
  if (!consultant.cvExists) {
    risks.push({ type: "No CV on File", severity: "high", detail: "No CV found for this consultant" });
  } else if (consultant.cvRecencyMonths > 12) {
    risks.push({
      type: "Outdated CV",
      severity: "medium",
      detail: `CV is ${consultant.cvRecencyMonths} months old`,
    });
  }
  if (dimensions.availability.daysGap > 30) {
    risks.push({
      type: "Availability Risk",
      severity: dimensions.availability.daysGap > 60 ? "high" : "medium",
      detail: dimensions.availability.note,
    });
  }
  if (dimensions.location.score < 60) {
    risks.push({
      type: "Location Conflict",
      severity: "medium",
      detail: dimensions.location.note,
    });
  }
  if (dimensions.band.score < 75) {
    risks.push({
      type: "Band Mismatch",
      severity: "low",
      detail: dimensions.band.note,
    });
  }
  return risks;
}

// ---------- AI narrative ----------

export function generateNarrative(consultant, role, dimensions, overallScore, risks) {
  const strengths = [];
  const gaps = [];

  if (dimensions.skills.score >= 80) strengths.push(`strong skills alignment (${dimensions.skills.requiredMatched}/${dimensions.skills.requiredTotal} required skills matched)`);
  else if (dimensions.skills.score >= 55) strengths.push(`partial skills match (${dimensions.skills.requiredMatched}/${dimensions.skills.requiredTotal} required skills)`);
  else gaps.push(`limited skills match (only ${dimensions.skills.requiredMatched} of ${dimensions.skills.requiredTotal} required skills)`);

  if (dimensions.band.score === 100) strengths.push("band level within the specified range");
  else if (dimensions.band.score >= 70) strengths.push(`acceptable band level (Band ${consultant.band} vs. required Band ${role.bandMin}–${role.bandMax})`);
  else gaps.push(`band level concern (Band ${consultant.band} vs. required Band ${role.bandMin}–${role.bandMax})`);

  if (dimensions.availability.score >= 85) strengths.push("availability aligns with role start date");
  else if (dimensions.availability.score >= 65) gaps.push("availability slightly misaligned with role start");
  else gaps.push(`availability risk — ${dimensions.availability.note.toLowerCase()}`);

  if (dimensions.location.score >= 85) strengths.push("location is compatible with role requirements");
  else if (dimensions.location.score < 60) gaps.push("location may pose a challenge");

  if (dimensions.certifications.score === 100 && role.certifications.length > 0)
    strengths.push("all required certifications are held");
  else if (dimensions.certifications.missing?.length > 0)
    gaps.push(`missing certification(s): ${dimensions.certifications.missing.join(", ")}`);

  let narrative = "";
  if (overallScore >= 80) {
    narrative = `${consultant.name} is a strong candidate for this role`;
  } else if (overallScore >= 60) {
    narrative = `${consultant.name} is a reasonable candidate for this role`;
  } else {
    narrative = `${consultant.name} may be a stretch for this role`;
  }

  if (strengths.length > 0) {
    narrative += ` due to ${strengths.join(", ")}`;
  }
  if (gaps.length > 0) {
    narrative += `. Key gaps to consider: ${gaps.join("; ")}`;
  }
  narrative += ".";

  return narrative;
}

// ---------- composite scorer ----------

export function scoreConsultant(consultant, role) {
  const dimensions = {
    skills: scoreSkills(consultant, role),
    band: scoreBand(consultant, role),
    availability: scoreAvailability(consultant, role),
    location: scoreLocation(consultant, role),
    jrs: scoreJRS(consultant, role),
    certifications: scoreCertifications(consultant, role),
  };

  const overallScore = Math.round(
    dimensions.skills.score * WEIGHTS.skills +
    dimensions.band.score * WEIGHTS.band +
    dimensions.availability.score * WEIGHTS.availability +
    dimensions.location.score * WEIGHTS.location +
    dimensions.jrs.score * WEIGHTS.jrs +
    dimensions.certifications.score * WEIGHTS.certifications
  );

  const risks = buildRisks(consultant, role, dimensions);
  const narrative = generateNarrative(consultant, role, dimensions, overallScore, risks);

  return {
    consultant,
    role,
    overallScore,
    dimensions,
    risks,
    narrative,
  };
}

export function rankConsultantsForRole(consultants, role) {
  return consultants
    .map((c) => scoreConsultant(c, role))
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((result, idx) => ({ ...result, rank: idx + 1 }));
}
