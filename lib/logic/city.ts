const CANONICAL: { city: string; re: RegExp }[] = [
  { city: "Bengaluru", re: /\b(bengaluru|bangalore|bengalooru|madanayakanahalli|whitefield|yelahanka|hebbal|devanahalli|electronic city|koramangala|indiranagar|marathahalli|jayamahal|domlur|kengeri|hunasamaranahalli|bettahalasur|chikkajala|bidadi)\b/i },
  { city: "Mumbai", re: /\b(navi mumbai|mumbai|bombay|thane)\b/i },
  { city: "Chennai", re: /\b(chennai|madras|chembarambakkam|nandanam|guindy|mahabalipuram|poonamallee)\b/i },
  { city: "Delhi", re: /\b(new delhi|delhi|gurugram|gurgaon|noida|greater noida|faridabad|ncr)\b/i },
  { city: "Pune", re: /\bpune\b/i },
  { city: "Hyderabad", re: /\b(hyderabad|secunderabad)\b/i },
  { city: "Kolkata", re: /\b(kolkata|calcutta)\b/i },
  { city: "Goa", re: /\b(goa|vagator|panaji|anjuna)\b/i },
  { city: "Shillong", re: /\bshillong\b/i },
  { city: "Guwahati", re: /\bguwahati\b/i },
  { city: "Ahmedabad", re: /\bahmedabad\b/i },
  { city: "Jaipur", re: /\bjaipur\b/i },
  { city: "Kochi", re: /\b(kochi|cochin)\b/i },
  { city: "Chandigarh", re: /\bchandigarh\b/i },
  { city: "Indore", re: /\bindore\b/i },
  { city: "Lucknow", re: /\blucknow\b/i },
];

const INDIA_RE =
  /\b(india|karnataka|maharashtra|tamil nadu|telangana|west bengal|goa|meghalaya|assam|gujarat|rajasthan|kerala|punjab|haryana|uttar pradesh|madhya pradesh|andhra pradesh|odisha|bihar|uttarakhand|himachal|jammu|sikkim|nagaland|manipur|mizoram|tripura|chhattisgarh|jharkhand|puducherry|chandigarh)\b/i;

export interface DetectedCity {
  city: string | null;
  inIndia: boolean;
}

/**
 * City from a SerpApi address[] + venue name. The four monitored metros collapse to
 * canonical names (Navi Mumbai → Mumbai, Gurugram/Noida → Delhi); anything else falls
 * back to the locality text from the address.
 */
export function detectCity(address: readonly string[] | undefined, venueName?: string | null): DetectedCity {
  const parts = (address ?? []).filter(Boolean);
  const haystack = [...parts, venueName ?? ""].join(" | ");
  for (const c of CANONICAL) {
    if (c.re.test(haystack)) return { city: c.city, inIndia: true };
  }
  const inIndia = INDIA_RE.test(haystack);
  const last = parts[parts.length - 1];
  const fallback = last ? last.split(",")[0].trim() : null;
  return { city: fallback && fallback.length > 0 ? fallback : null, inIndia };
}

export type CityBucket = "Bengaluru" | "Mumbai" | "Chennai" | "Delhi" | "Other";

export function cityBucket(city: string): CityBucket {
  return city === "Bengaluru" || city === "Mumbai" || city === "Chennai" || city === "Delhi" ? city : "Other";
}
