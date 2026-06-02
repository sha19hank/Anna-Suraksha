export type WeatherTemperatureResult = {
  temperatureC: number;
  source: 'openweather';
};

function hasKey(key?: string): key is string {
  return Boolean(key && key.trim().length > 0);
}

export async function fetchTemperatureC(params: {
  apiKey?: string;
  city?: string;
  lat?: number;
  lon?: number;
}): Promise<WeatherTemperatureResult | null> {
  const { apiKey, city, lat, lon } = params;
  if (!hasKey(apiKey)) return null;

  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('appid', apiKey);
  url.searchParams.set('units', 'metric');

  if (typeof lat === 'number' && typeof lon === 'number') {
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
  } else if (city) {
    url.searchParams.set('q', city);
  } else {
    return null;
  }

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) return null;

  const data = (await res.json()) as any;
  const temp = Number(data?.main?.temp);
  if (!Number.isFinite(temp)) return null;

  return { temperatureC: temp, source: 'openweather' };
}
