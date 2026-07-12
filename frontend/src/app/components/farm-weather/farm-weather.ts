import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
  current_units?: Record<string, string>;
  daily_units?: Record<string, string>;
}

interface ForecastDay {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  isToday: boolean;
}

@Component({
  selector: 'app-farm-weather',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './farm-weather.html',
  styleUrl: './farm-weather.css'
})
export class FarmWeatherComponent implements OnChanges, OnDestroy {
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() locationLabel = '';

  private destroy$ = new Subject<void>();

  loading = false;
  error: string | null = null;
  current: OpenMeteoResponse['current'] | null = null;
  forecast: ForecastDay[] = [];
  rainfallTotal30d = 0;
  rainyDays30d = 0;
  rainfallUnit = 'mm';
  tempUnit = '°C';
  fetchedAt: Date | null = null;

  constructor(private http: HttpClient) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['latitude'] || changes['longitude']) {
      this.loadWeather();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadWeather(): void {
    if (!this.hasCoords) {
      this.current = null;
      this.forecast = [];
      this.error = null;
      return;
    }

    this.loading = true;
    this.error = null;

    const params = new URLSearchParams({
      latitude: String(this.latitude),
      longitude: String(this.longitude),
      current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
      past_days: '30',
      forecast_days: '7',
      timezone: 'auto'
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

    this.http.get<OpenMeteoResponse>(url)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.applyResponse(response);
          this.loading = false;
          this.fetchedAt = new Date();
        },
        error: () => {
          this.loading = false;
          this.error = 'Could not load weather data right now.';
        }
      });
  }

  private applyResponse(response: OpenMeteoResponse): void {
    this.current = response.current || null;
    this.tempUnit = response.current_units?.['temperature_2m'] || '°C';
    this.rainfallUnit = response.daily_units?.['precipitation_sum'] || 'mm';

    const daily = response.daily;
    if (!daily) {
      this.forecast = [];
      this.rainfallTotal30d = 0;
      this.rainyDays30d = 0;
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayIndex = daily.time.findIndex((d) => d === today);

    const forecastStart = todayIndex >= 0 ? todayIndex : 0;
    this.forecast = daily.time
      .slice(forecastStart, forecastStart + 7)
      .map((date, i) => ({
        date,
        weatherCode: daily.weather_code[forecastStart + i],
        tempMax: daily.temperature_2m_max[forecastStart + i],
        tempMin: daily.temperature_2m_min[forecastStart + i],
        precipitation: daily.precipitation_sum[forecastStart + i] ?? 0,
        isToday: date === today
      }));

    const past30Start = Math.max(0, (todayIndex >= 0 ? todayIndex : daily.time.length) - 30);
    const past30End = todayIndex >= 0 ? todayIndex : daily.time.length;
    const past30 = daily.precipitation_sum.slice(past30Start, past30End);
    this.rainfallTotal30d = past30.reduce((sum, v) => sum + (v || 0), 0);
    this.rainyDays30d = past30.filter((v) => (v || 0) >= 1).length;
  }

  get hasCoords(): boolean {
    return this.latitude != null
      && this.longitude != null
      && Math.abs(this.latitude) <= 90
      && Math.abs(this.longitude) <= 180;
  }

  retry(): void {
    this.loadWeather();
  }

  weatherLabel(code: number): string {
    return WEATHER_LABELS[code] || 'Unknown';
  }

  weatherIcon(code: number): string {
    return WEATHER_ICONS[code] || 'fa-cloud';
  }

  shortDay(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
}

// WMO Weather interpretation codes (https://open-meteo.com/en/docs)
const WEATHER_LABELS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm'
};

const WEATHER_ICONS: Record<number, string> = {
  0: 'fa-sun',
  1: 'fa-sun',
  2: 'fa-cloud-sun',
  3: 'fa-cloud',
  45: 'fa-smog',
  48: 'fa-smog',
  51: 'fa-cloud-rain',
  53: 'fa-cloud-rain',
  55: 'fa-cloud-showers-heavy',
  56: 'fa-cloud-rain',
  57: 'fa-cloud-showers-heavy',
  61: 'fa-cloud-rain',
  63: 'fa-cloud-rain',
  65: 'fa-cloud-showers-heavy',
  66: 'fa-cloud-rain',
  67: 'fa-cloud-showers-heavy',
  71: 'fa-snowflake',
  73: 'fa-snowflake',
  75: 'fa-snowflake',
  77: 'fa-snowflake',
  80: 'fa-cloud-showers-heavy',
  81: 'fa-cloud-showers-heavy',
  82: 'fa-cloud-showers-heavy',
  85: 'fa-snowflake',
  86: 'fa-snowflake',
  95: 'fa-bolt',
  96: 'fa-bolt',
  99: 'fa-bolt'
};
