import React, { useState, useEffect, useRef } from "react";
import { retro } from "./retro-styles";
import { appStore } from "@/lib/app-store";
import { S_MUTED, S_TEXT, S_SECTION_HDR, S_GREEN_BTN } from "./dm-styles";
import {
  CalendarDays, Plus, Cloud, CloudRain, CloudDrizzle, CloudLightning, CloudFog, Snowflake, Wind,
} from "lucide-react";

const CALENDAR_MONTHS = [
  "Lunara", "Selene", "Artemina", "Diantha", "Solyndra", "Astraeus", "Eosara",
  "Umbriel", "Astralia", "Caelion", "Serevain", "Brimara", "Hiemsyl",
] as const;
const DAYS_PER_MONTH = 28;

interface CalendarDate {
  month: number;
  day: number;
  year: number;
  isStarfall?: boolean;
}

interface WeatherState {
  condition: string;
  temperature: string;
  wind: string;
  description: string;
}

const WEATHER_CONDITIONS = [
  "Drizzle", "Light Rain", "Rain", "Heavy Rain", "Thunderstorm",
  "Overcast", "Dense Fog", "Mist", "Sleet", "Cold Rain", "Haze",
  "Freezing Drizzle", "Gray Skies", "Torrential Downpour",
] as const;

const WEATHER_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>> = {
  "Drizzle": CloudDrizzle, "Light Rain": CloudDrizzle, "Rain": CloudRain,
  "Heavy Rain": CloudRain, "Thunderstorm": CloudLightning, "Overcast": Cloud,
  "Dense Fog": CloudFog, "Mist": CloudFog, "Sleet": Snowflake,
  "Cold Rain": CloudRain, "Haze": Wind, "Freezing Drizzle": Snowflake,
  "Gray Skies": Cloud, "Torrential Downpour": CloudRain,
};

function formatCalendarDate(d: CalendarDate): string {
  if (d.isStarfall) return `Starfall Day${d.day > 1 ? ` ${d.day}` : ""}, Year ${d.year}`;
  const monthName = CALENDAR_MONTHS[d.month - 1] || "Unknown";
  return `${d.day} ${monthName}, Year ${d.year}`;
}

const DEFAULT_CALENDAR: CalendarDate = { month: 1, day: 1, year: 1, isStarfall: false };
const DEFAULT_WEATHER: WeatherState = { condition: "Overcast", temperature: "Cool", wind: "Light breeze", description: "A thick gray blanket of clouds hangs over The Great City. The air is damp and heavy." };


const INPUT_CLS = `${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[13px] w-full outline-none`;

const WEATHER_PRESETS = [
  { label: "Drizzly Day", c: "Drizzle", t: "Cool", w: "Light breeze", d: "A fine, persistent drizzle coats the cobblestones of The Great City. Puddles form in the gutters as gray light filters through the clouds." },
  { label: "Heavy Storm", c: "Thunderstorm", t: "Cold", w: "Strong gusts", d: "Thunder rolls across the skyline of The Great City. Rain hammers the rooftops and lightning briefly illuminates the dark spires above." },
  { label: "Thick Fog", c: "Dense Fog", t: "Chilly", w: "Still", d: "A dense, impenetrable fog has settled over The Great City. Visibility is reduced to a few paces. Sounds are muffled and distant." },
  { label: "Gloomy Overcast", c: "Overcast", t: "Mild", w: "Light breeze", d: "Thick clouds press down over The Great City like a leaden ceiling. The light is flat and gray. It feels like rain could start at any moment." },
  { label: "Cold Rain", c: "Cold Rain", t: "Frigid", w: "Windy", d: "Bitter, cold rain lashes through the streets of The Great City. The wind drives the drops sideways, and few souls brave the outdoors." },
  { label: "Misty Evening", c: "Mist", t: "Cool", w: "Still", d: "A soft mist curls through the alleyways and along the canal banks. Lanterns glow with faint, hazy halos in the quiet evening air." },
] as const;

const TEMPERATURES = ["Frigid", "Cold", "Chilly", "Cool", "Mild", "Warm", "Humid"] as const;
const WIND_OPTIONS = ["Still", "Light breeze", "Breezy", "Windy", "Strong gusts", "Gale-force"] as const;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;



export function DMCalendarWeather() {
  const [calendarDate, setCalendarDate] = useState<CalendarDate>(DEFAULT_CALENDAR);
  const [weather, setWeather] = useState<WeatherState>(DEFAULT_WEATHER);
  const [monthFlavorTexts, setMonthFlavorTexts] = useState<Record<string, string>>({});
  const [dailyForecast, setDailyForecast] = useState<Record<string, { condition: string; temp: string }>>({});
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void appStore.loadCalendarWeatherState({ calendarDate: DEFAULT_CALENDAR, weather: DEFAULT_WEATHER, monthFlavorTexts: {}, dailyForecast: {} }).then((state: any) => {
      if (cancelled) return;
      setCalendarDate(state.calendarDate || DEFAULT_CALENDAR);
      setWeather(state.weather || DEFAULT_WEATHER);
      setMonthFlavorTexts(state.monthFlavorTexts || {});
      setDailyForecast(state.dailyForecast || {});
      hydratedRef.current = true;
    }).catch(() => { hydratedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const handle = setTimeout(() => {
      void appStore.saveCalendarWeatherState({ calendarDate, weather, monthFlavorTexts, dailyForecast }).catch(() => {});
    }, 350);
    return () => clearTimeout(handle);
  }, [calendarDate, weather, monthFlavorTexts, dailyForecast]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <CalendarDays size={20} style={{ color: "#7AB0FF" }} />
        <h2 className="text-[18px] font-bold" style={{ color: "#7AB0FF" }}>Calendar & Weather</h2>
      </div>

      <div className={`${retro.raised} bg-[#0E0E35] p-4`}>
        <div className="text-[10px] mb-2" style={S_SECTION_HDR}>CURRENT DATE & WEATHER (as players see it)</div>
        <div className={`${retro.sunken} bg-[#0C0C2E] p-4 flex items-center gap-6`}>
          <div>
            <div className="text-[16px] mb-1" style={{ color: "#7AB0FF", fontWeight: 600 }}>{formatCalendarDate(calendarDate)}</div>
            <div className="text-[11px]" style={S_MUTED}>
              {calendarDate.isStarfall ? "Outside the regular months" : `Month ${calendarDate.month} of 13 · Day ${calendarDate.day} of ${DAYS_PER_MONTH}`}
            </div>
          </div>
          <div className="h-10 w-px" style={{ background: "#1A1A4B" }} />
          <div className="flex items-center gap-3">
            {(() => { const WIcon = WEATHER_ICONS[weather.condition] || Cloud; return <WIcon size={28} style={{ color: "#6A8ABB" }} />; })()}
            <div>
              <div className="text-[14px]" style={{ color: "#9AAFCF", fontWeight: 600 }}>{weather.condition}</div>
              <div className="text-[11px]" style={S_MUTED}>{weather.temperature} · {weather.wind}</div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
        <div className="text-[12px] mb-4" style={{ color: "#7AB0FF", fontWeight: 600 }}>SET DATE</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-[10px] block mb-1" style={S_MUTED}>Month:</label>
            <select
              value={calendarDate.isStarfall ? "starfall" : calendarDate.month}
              onChange={(e) => {
                if (e.target.value === "starfall") {
                  setCalendarDate(prev => ({ ...prev, month: 13, day: 1, isStarfall: true }));
                } else {
                  setCalendarDate(prev => ({ ...prev, month: parseInt(e.target.value), isStarfall: false, day: Math.min(prev.day, DAYS_PER_MONTH) }));
                }
              }}
              className={INPUT_CLS}
              style={S_TEXT}
            >
              {CALENDAR_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{i + 1}. {m}</option>
              ))}
              <option value="starfall">✦ Starfall</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] block mb-1" style={S_MUTED}>Day:</label>
            {calendarDate.isStarfall ? (
              <select
                value={calendarDate.day}
                onChange={(e) => setCalendarDate(prev => ({ ...prev, day: parseInt(e.target.value) }))}
                className={INPUT_CLS}
                style={S_TEXT}
              >
                <option value={1}>Starfall Day 1</option>
                <option value={2}>Starfall Day 2 (Leap)</option>
              </select>
            ) : (
              <select
                value={calendarDate.day}
                onChange={(e) => setCalendarDate(prev => ({ ...prev, day: parseInt(e.target.value) }))}
                className={INPUT_CLS}
                style={S_TEXT}
              >
                {Array.from({ length: DAYS_PER_MONTH }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-[10px] block mb-1" style={S_MUTED}>Year:</label>
            <input
              type="number" min={1} value={calendarDate.year}
              onChange={(e) => setCalendarDate(prev => ({ ...prev, year: Math.max(1, parseInt(e.target.value) || 1) }))}
              className={INPUT_CLS} style={S_TEXT}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={() => {
                setCalendarDate(prev => {
                  if (prev.isStarfall) {
                    if (prev.day < 2) return { ...prev, day: prev.day + 1 };
                    return { month: 1, day: 1, year: prev.year + 1, isStarfall: false };
                  }
                  if (prev.day < DAYS_PER_MONTH) return { ...prev, day: prev.day + 1 };
                  if (prev.month < 13) return { ...prev, month: prev.month + 1, day: 1 };
                  return { month: 13, day: 1, year: prev.year, isStarfall: true };
                });
              }}
              className={`${retro.button} px-4 py-2 text-[12px] flex items-center gap-1.5`}
              style={{ color: "#4A9A5A" }}
            >
              <Plus size={12} /> Next Day
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-[10px] mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>MONTH REFERENCE</div>
          <div className="grid grid-cols-4 md:grid-cols-7 gap-1">
            {CALENDAR_MONTHS.map((m, i) => (
              <button
                key={m}
                onClick={() => setCalendarDate(prev => ({ ...prev, month: i + 1, isStarfall: false, day: Math.min(prev.day, DAYS_PER_MONTH) }))}
                className={`text-[9px] px-1.5 py-1 ${calendarDate.month === i + 1 && !calendarDate.isStarfall ? retro.sunken : retro.raised + " hover:bg-[#1E1E58]"} transition-colors`}
                style={{ color: calendarDate.month === i + 1 && !calendarDate.isStarfall ? "#7AB0FF" : "#5A6A8A", fontWeight: calendarDate.month === i + 1 && !calendarDate.isStarfall ? 600 : 400 }}
              >{i + 1}. {m}</button>
            ))}
            <button
              onClick={() => setCalendarDate(prev => ({ ...prev, month: 13, day: 1, isStarfall: true }))}
              className={`text-[9px] px-1.5 py-1 ${calendarDate.isStarfall ? retro.sunken : retro.raised + " hover:bg-[#1E1E58]"} transition-colors`}
              style={{ color: calendarDate.isStarfall ? "#FFD700" : "#5A6A8A", fontWeight: calendarDate.isStarfall ? 600 : 400 }}
            >★ Starfall</button>
          </div>
        </div>
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
        <div className="text-[12px] mb-1" style={{ color: "#6A8ABB", fontWeight: 600 }}>WEATHER & FORECAST — The Great City</div>
        <div className="text-[10px] mb-4" style={S_MUTED}>
          Set today's weather below. Changes sync to the current day in the forecast grid. Players see the week's forecast on the Celestial Calendar.
        </div>

        <div className={`${retro.raised} bg-[#0A0A2A] p-4 mb-5`}>
          <div className="text-[10px] mb-3" style={{ color: "#7AB0FF", fontWeight: 600 }}>
            TODAY — {calendarDate.isStarfall ? "Starfall Day" : `${calendarDate.day} ${CALENDAR_MONTHS[calendarDate.month - 1]}, Year ${calendarDate.year}`}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-[10px] block mb-1" style={S_MUTED}>Condition:</label>
              <select
                value={weather.condition}
                onChange={(e) => {
                  const cond = e.target.value;
                  setWeather(prev => ({ ...prev, condition: cond }));
                  if (!calendarDate.isStarfall) {
                    const key = `${calendarDate.year}-${calendarDate.month}-${calendarDate.day}`;
                    setDailyForecast(prev => ({ ...prev, [key]: { condition: cond, temp: prev[key]?.temp || weather.temperature } }));
                  }
                }}
                className={INPUT_CLS}
                style={S_TEXT}
              >
                {WEATHER_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={S_MUTED}>Temperature:</label>
              <select
                value={weather.temperature}
                onChange={(e) => {
                  const temp = e.target.value;
                  setWeather(prev => ({ ...prev, temperature: temp }));
                  if (!calendarDate.isStarfall) {
                    const key = `${calendarDate.year}-${calendarDate.month}-${calendarDate.day}`;
                    setDailyForecast(prev => ({ ...prev, [key]: { condition: prev[key]?.condition || weather.condition, temp } }));
                  }
                }}
                className={INPUT_CLS}
                style={S_TEXT}
              >
                {TEMPERATURES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={S_MUTED}>Wind:</label>
              <select
                value={weather.wind}
                onChange={(e) => setWeather(prev => ({ ...prev, wind: e.target.value }))}
                className={INPUT_CLS}
                style={S_TEXT}
              >
                {WIND_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] block mb-1" style={S_MUTED}>Flavor Description (optional):</label>
            <textarea
              value={weather.description}
              onChange={(e) => setWeather(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the atmosphere..."
              className={`${INPUT_CLS} h-20 resize-none`}
              style={S_TEXT}
            />
          </div>

          <div className="mt-4">
            <div className="text-[10px] mb-2" style={{ color: "#5A6A8A", fontWeight: 600 }}>QUICK PRESETS</div>
            <div className="flex flex-wrap gap-2">
              {WEATHER_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => {
                    setWeather({ condition: p.c, temperature: p.t, wind: p.w, description: p.d });
                    if (!calendarDate.isStarfall) {
                      const key = `${calendarDate.year}-${calendarDate.month}-${calendarDate.day}`;
                      setDailyForecast(prev => ({ ...prev, [key]: { condition: p.c, temp: p.t } }));
                    }
                  }}
                  className={`${retro.raised} px-2.5 py-1 text-[10px] hover:bg-[#1E1E58] transition-colors`}
                  style={{ color: "#6A8ABB" }}
                >
                  {(() => { const WI = WEATHER_ICONS[p.c] || Cloud; return <WI size={10} className="inline mr-1" />; })()}
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-[10px] mb-3" style={S_SECTION_HDR}>
          MONTH FORECAST — {calendarDate.isStarfall ? "Starfall Days" : CALENDAR_MONTHS[calendarDate.month - 1]}
        </div>
        {!calendarDate.isStarfall && (() => {
          const weeks = [1, 2, 3, 4];
          return (
            <div className="space-y-4">
              {weeks.map(week => {
                const weekStart = (week - 1) * 7 + 1;
                const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i);
                return (
                  <div key={week}>
                    <div className="text-[10px] mb-2" style={{ color: "#5A7ABB", fontWeight: 600 }}>
                      Week {week} (Day {weekStart}–{weekStart + 6})
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {weekDays.map((d, i) => {
                        const key = `${calendarDate.year}-${calendarDate.month}-${d}`;
                        const fc = dailyForecast[key];
                        const isToday = calendarDate.day === d;
                        return (
                          <div key={d} className={`${retro.sunken} p-1.5`} style={{
                            background: isToday ? "#0E1A4A" : "#080820",
                            outline: isToday ? "1px solid #3A5AFF" : "none",
                          }}>
                            <div className="text-[8px] text-center mb-1" style={{ color: "#3A4A6A", fontWeight: 600 }}>
                              {DAY_NAMES[i]} {d}
                            </div>
                            <select
                              value={fc?.condition || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDailyForecast(prev => {
                                  if (!val) {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  }
                                  return { ...prev, [key]: { condition: val, temp: prev[key]?.temp || "Cool" } };
                                });
                                if (isToday && val) {
                                  setWeather(prev => ({ ...prev, condition: val }));
                                }
                              }}
                              className={`${retro.sunken} bg-[#0A0A28] text-[9px] w-full outline-none px-0.5 py-0.5 mb-1`}
                              style={S_TEXT}
                            >
                              <option value="">—</option>
                              {WEATHER_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select
                              value={fc?.temp || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!fc) return;
                                setDailyForecast(prev => ({ ...prev, [key]: { ...prev[key], temp: val } }));
                                if (isToday) {
                                  setWeather(prev => ({ ...prev, temperature: val }));
                                }
                              }}
                              className={`${retro.sunken} bg-[#0A0A28] text-[9px] w-full outline-none px-0.5 py-0.5`}
                              style={S_TEXT}
                              disabled={!fc}
                            >
                              {TEMPERATURES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    const conditions = WEATHER_CONDITIONS;
                    const temps = ["Frigid", "Cold", "Chilly", "Cool", "Cool", "Mild"];
                    const newForecast = { ...dailyForecast };
                    for (let d = 1; d <= DAYS_PER_MONTH; d++) {
                      const key = `${calendarDate.year}-${calendarDate.month}-${d}`;
                      if (!newForecast[key]) {
                        newForecast[key] = {
                          condition: conditions[Math.floor(Math.random() * conditions.length)],
                          temp: temps[Math.floor(Math.random() * temps.length)],
                        };
                      }
                    }
                    setDailyForecast(newForecast);
                  }}
                  className={`${retro.raised} px-3 py-1.5 text-[10px] hover:bg-[#1E1E58] transition-colors`}
                  style={{ color: "#6A8ABB" }}
                >
                  Auto-Fill Empty Days
                </button>
                <button
                  onClick={() => {
                    const newForecast = { ...dailyForecast };
                    for (let d = 1; d <= DAYS_PER_MONTH; d++) {
                      delete newForecast[`${calendarDate.year}-${calendarDate.month}-${d}`];
                    }
                    setDailyForecast(newForecast);
                  }}
                  className={`${retro.raised} px-3 py-1.5 text-[10px] hover:bg-[#1E1E58] transition-colors`}
                  style={{ color: "#AA5A5A" }}
                >
                  Clear Month
                </button>
              </div>
            </div>
          );
        })()}
        {calendarDate.isStarfall && (
          <div className="text-[10px] italic" style={S_MUTED}>
            Forecasts are not available during Starfall Days.
          </div>
        )}
      </div>

      <div className={`${retro.sunken} bg-[#0C0C2E] p-5`}>
        <div className="text-[12px] mb-4" style={{ color: "#7AB0FF", fontWeight: 600 }}>MONTH FLAVOR TEXTS</div>
        <div className="text-[10px] mb-4" style={S_MUTED}>
          Set descriptive flavor text for each month. These appear on the Celestial Calendar page.
        </div>
        <div className="space-y-3">
          {CALENDAR_MONTHS.map((month, i) => (
            <div key={month}>
              <label className="text-[10px] block mb-1" style={{ color: "#5A7ABB", fontWeight: 600 }}>
                {i + 1}. {month}
              </label>
              <textarea
                value={monthFlavorTexts[month] || ""}
                onChange={(e) => setMonthFlavorTexts(prev => ({ ...prev, [month]: e.target.value }))}
                placeholder={`Flavor text for ${month}...`}
                className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none h-14 resize-none`}
                style={S_TEXT}
              />
            </div>
          ))}
          <div>
            <label className="text-[10px] block mb-1" style={{ color: "#FFD700", fontWeight: 600 }}>
              ★ Starfall Days
            </label>
            <textarea
              value={monthFlavorTexts["Starfall"] || ""}
              onChange={(e) => setMonthFlavorTexts(prev => ({ ...prev, Starfall: e.target.value }))}
              placeholder="Flavor text for Starfall Days..."
              className={`${retro.sunken} bg-[#0A0A28] px-3 py-2 text-[12px] w-full outline-none h-14 resize-none`}
              style={S_TEXT}
            />
          </div>
        </div>
      </div>
    </div>
  );
}