export interface CityLocation {
  id: string;
  city: string;
  country: string;
  displayName: string;
}

export interface LocationSuggestion extends CityLocation {
  state?: string;
}

/**
 * Searches global cities & countries using Open-Meteo Geocoding API with Photon fallback.
 * Strictly formats as "City, Country" (or Country name if country queried).
 * Does not collect street addresses, coordinates or postal codes.
 * Requires no secret API keys, supports worldwide locations, zero Firestore cost.
 */
export async function searchCities(
  query: string,
  signal?: AbortSignal
): Promise<CityLocation[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];

  // Primary: Open-Meteo Global Geocoding (specialized in cities/settlements)
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=10&language=en&format=json`,
      { signal }
    );

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        const results: CityLocation[] = [];
        const seen = new Set<string>();

        for (const item of data.results) {
          const rawCity = item.name ? item.name.trim() : '';
          const rawCountry = item.country ? item.country.trim() : '';

          if (!rawCity && !rawCountry) continue;

          let city = rawCity;
          let country = rawCountry;
          let displayName = '';

          // If the feature is a whole country or city equals country
          if (!country || city.toLowerCase() === country.toLowerCase() || item.feature_code === 'PCLI') {
            displayName = country || city;
            city = '';
            country = displayName;
          } else {
            displayName = `${city}, ${country}`;
          }

          const dedupKey = displayName.toLowerCase();
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            results.push({
              id: `om_${item.id || displayName}`,
              city: city || country,
              country,
              displayName,
            });
          }

          if (results.length >= 8) break;
        }

        if (results.length > 0) {
          return results;
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return [];
    console.warn('Open-Meteo city search error, trying Photon fallback:', err);
  }

  // Fallback: Photon API with place tag filtering
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=10&lang=en`,
      { signal }
    );

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.features) && data.features.length > 0) {
        const results: CityLocation[] = [];
        const seen = new Set<string>();

        for (let i = 0; i < data.features.length; i++) {
          const p = data.features[i].properties;
          if (!p) continue;

          const rawCity = (p.city || p.name || '').trim();
          const rawCountry = (p.country || '').trim();

          if (!rawCity && !rawCountry) continue;

          let city = rawCity;
          let country = rawCountry;
          let displayName = '';

          if (!country || city.toLowerCase() === country.toLowerCase()) {
            displayName = country || city;
            city = '';
            country = displayName;
          } else {
            displayName = `${city}, ${country}`;
          }

          const dedupKey = displayName.toLowerCase();
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            results.push({
              id: `ph_${p.osm_id || i}_${dedupKey}`,
              city: city || country,
              country,
              displayName,
            });
          }

          if (results.length >= 8) break;
        }

        if (results.length > 0) {
          return results;
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') return [];
    console.warn('Photon fallback error:', err);
  }

  return [];
}

/**
 * Backward compatibility alias
 */
export const searchLocations = searchCities;

