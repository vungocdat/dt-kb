/**
 * Vietnamese lunar calendar (âm lịch) for the calendar route.
 *
 * This is Hồ Ngọc Đức's algorithm — the one Vietnamese calendars are built on —
 * computed for UTC+7 (the 105°E meridian). That matters: the Chinese calendar is
 * computed for UTC+8, and when a new moon falls between 16:00 and 17:00 UTC the
 * two calendars start a month on different days (Tết 2007 was 17 Feb in Vietnam
 * but 18 Feb in China; Tết 1985 was a whole month apart). So ICU's `chinese`
 * calendar can't be used here.
 *
 * Everything works on Julian day numbers built from (y, m, d) triples — no Date
 * objects, so the browser's own timezone can't shift a result by a day.
 */

const TZ = 7

const { PI, sin, floor } = Math
const dr = PI / 180

// ── Astronomy ─────────────────────────────────────────────────────────────────

/** Julian day number of a Gregorian (or pre-1582 Julian) calendar date. */
export function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = floor((14 - mm) / 12)
  const y = yy + 4800 - a
  const m = mm + 12 * a - 3
  let jd = dd + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - floor(y / 100) + floor(y / 400) - 32045
  if (jd < 2299161) jd = dd + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - 32083
  return jd
}

/** Julian day (with fraction) of the k-th new moon after 1900-01-01. */
function newMoon(k: number): number {
  const T = k / 1236.85
  const T2 = T * T
  const T3 = T2 * T
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3
  jd1 += 0.00033 * sin((166.56 + 132.87 * T - 0.009173 * T2) * dr)
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3
  let C1 = (0.1734 - 0.000393 * T) * sin(M * dr) + 0.0021 * sin(2 * dr * M)
  C1 = C1 - 0.4068 * sin(Mpr * dr) + 0.0161 * sin(dr * 2 * Mpr)
  C1 = C1 - 0.0004 * sin(dr * 3 * Mpr)
  C1 = C1 + 0.0104 * sin(dr * 2 * F) - 0.0051 * sin(dr * (M + Mpr))
  C1 = C1 - 0.0074 * sin(dr * (M - Mpr)) + 0.0004 * sin(dr * (2 * F + M))
  C1 = C1 - 0.0004 * sin(dr * (2 * F - M)) - 0.0006 * sin(dr * (2 * F + Mpr))
  C1 = C1 + 0.001 * sin(dr * (2 * F - Mpr)) + 0.0005 * sin(dr * (2 * Mpr + M))
  const deltaT =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2
  return jd1 + C1 - deltaT
}

/** Sun's longitude in radians, [0, 2π), at a Julian day (with fraction). */
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525
  const T2 = T * T
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * sin(dr * M)
  DL = DL + (0.019993 - 0.000101 * T) * sin(dr * 2 * M) + 0.00029 * sin(dr * 3 * M)
  const L = (L0 + DL) * dr
  return L - PI * 2 * floor(L / (PI * 2))
}

/** Local day number on which the k-th new moon falls. */
const newMoonDay = (k: number) => floor(newMoon(k) + 0.5 + TZ / 24)

/** Sun longitude at the start of a local day, as a 30° sector 0-11. */
const sunSector = (dayNumber: number) => floor((sunLongitude(dayNumber - 0.5 - TZ / 24) / PI) * 6)

/** Day number of the start of lunar month 11 (the month containing Đông chí) of year yy. */
function lunarMonth11(yy: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021
  const k = floor(off / 29.530588853)
  const nm = newMoonDay(k)
  return sunSector(nm) >= 9 ? newMoonDay(k - 1) : nm
}

/** Which month after month 11 is the leap one: the first with no major solar term. */
function leapMonthOffset(a11: number): number {
  const k = floor((a11 - 2415021.076998695) / 29.530588853 + 0.5)
  let i = 1
  let arc = sunSector(newMoonDay(k + i))
  let last: number
  do {
    last = arc
    i++
    arc = sunSector(newMoonDay(k + i))
  } while (arc !== last && i < 14)
  return i - 1
}

function solarToLunar(dd: number, mm: number, yy: number) {
  const dayNumber = jdFromDate(dd, mm, yy)
  const k = floor((dayNumber - 2415021.076998695) / 29.530588853)
  let monthStart = newMoonDay(k + 1)
  if (monthStart > dayNumber) monthStart = newMoonDay(k)

  let a11 = lunarMonth11(yy)
  let b11 = a11
  let year: number
  if (a11 >= monthStart) {
    year = yy
    a11 = lunarMonth11(yy - 1)
  } else {
    year = yy + 1
    b11 = lunarMonth11(yy + 1)
  }

  const day = dayNumber - monthStart + 1
  const diff = floor((monthStart - a11) / 29)
  let leap = false
  let month = diff + 11
  // 13 lunar months between two month-11s → one of them is a leap month.
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11)
    if (diff >= leapDiff) {
      month = diff + 10
      if (diff === leapDiff) leap = true
    }
  }
  if (month > 12) month -= 12
  if (month >= 11 && diff < 4) year -= 1

  return { day, month, year, leap, jd: dayNumber }
}

// ── Names ─────────────────────────────────────────────────────────────────────

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý']
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi']
/** Vietnamese zodiac: Trâu not Ox, and the Mèo (cat) where China has the rabbit. */
const CON_GIAP = ['Chuột', 'Trâu', 'Hổ', 'Mèo', 'Rồng', 'Rắn', 'Ngựa', 'Dê', 'Khỉ', 'Gà', 'Chó', 'Lợn']

const MONTH_NAMES = ['Giêng', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'Một', 'Chạp']

/** 24 tiết khí, indexed by the sun's longitude / 15°, starting at Xuân phân (0°). */
const TIET_KHI = [
  'Xuân phân', 'Thanh minh', 'Cốc vũ', 'Lập hạ', 'Tiểu mãn', 'Mang chủng',
  'Hạ chí', 'Tiểu thử', 'Đại thử', 'Lập thu', 'Xử thử', 'Bạch lộ',
  'Thu phân', 'Hàn lộ', 'Sương giáng', 'Lập đông', 'Tiểu tuyết', 'Đại tuyết',
  'Đông chí', 'Tiểu hàn', 'Đại hàn', 'Lập xuân', 'Vũ thủy', 'Kinh trập',
]

/** Keyed by `month-day` of a *non-leap* lunar month: [short cell label, full name]. */
const FESTIVALS: Record<string, [string, string]> = {
  '1-1': ['Tết', 'Tết Nguyên Đán'],
  '1-2': ['Mùng 2 Tết', 'Mùng 2 Tết'],
  '1-3': ['Mùng 3 Tết', 'Mùng 3 Tết'],
  '1-15': ['Rằm Giêng', 'Tết Nguyên Tiêu (Rằm tháng Giêng)'],
  '3-3': ['Hàn Thực', 'Tết Hàn Thực'],
  '3-10': ['Giỗ Tổ', 'Giỗ Tổ Hùng Vương'],
  '4-15': ['Phật Đản', 'Lễ Phật Đản'],
  '5-5': ['Đoan Ngọ', 'Tết Đoan Ngọ'],
  '7-15': ['Vu Lan', 'Lễ Vu Lan (Rằm tháng Bảy)'],
  '8-15': ['Trung Thu', 'Tết Trung Thu'],
  '12-23': ['Ông Táo', 'Tiễn Ông Công Ông Táo'],
}

const canChi = (canIdx: number, chiIdx: number) =>
  `${CAN[((canIdx % 10) + 10) % 10]} ${CHI[((chiIdx % 12) + 12) % 12]}`

// ── Public API ────────────────────────────────────────────────────────────────

export interface LunarDay {
  day: number
  month: number
  year: number
  isLeapMonth: boolean
  /** "Bính Ngọ" */
  yearName: string
  /** "Ngựa" */
  conGiap: string
  /** "Tám", "Giêng", "Chạp" — for "tháng Tám" */
  monthName: string
  /** Can Chi of the month / day, e.g. "Đinh Dậu" */
  monthCanChi: string
  dayCanChi: string
  tietKhi?: string
  festival?: string
  /** Full festival name for tooltips/headers. */
  festivalFull?: string
  /** What a grid cell shows: festival → tiết khí → "1/8" on mùng 1 → day number. */
  label: string
  kind: 'festival' | 'term' | 'newMonth' | 'fullMoon' | 'day'
  /** "Ngày 19 tháng Tám năm Bính Ngọ" (with "nhuận" for a leap month) */
  full: string
}

const cache = new Map<string, LunarDay>()

/** Lunar details for an ISO (local) date "YYYY-MM-DD". */
export function lunarFor(iso: string): LunarDay {
  const hit = cache.get(iso)
  if (hit) return hit

  const [yy, mm, dd] = iso.split('-').map(Number)
  const { day, month, year, leap, jd } = solarToLunar(dd, mm, yy)

  // Tiết khí: the day on which the sun crosses a 15° boundary (local time).
  const start = floor((sunLongitude(jd - 0.5 - TZ / 24) / PI) * 12)
  const end = floor((sunLongitude(jd + 0.5 - TZ / 24) / PI) * 12)
  const tietKhi = start !== end ? TIET_KHI[end % 24] : undefined

  // Festivals never fall in a leap month (mùng 5 tháng 5 nhuận isn't Đoan Ngọ).
  let fest = leap ? undefined : FESTIVALS[`${month}-${day}`]
  // Giao thừa is "the day before Tết" — the 29th or 30th of tháng Chạp.
  if (!fest && month === 12 && !leap && day >= 29) {
    const next = solarToLunar(dd + 1, mm, yy) // jdFromDate normalizes day overflow
    if (next.month === 1 && next.day === 1) fest = ['Giao thừa', 'Giao thừa (Tất niên)']
  }

  const monthLabel = `${MONTH_NAMES[month - 1]}${leap ? ' nhuận' : ''}`
  const yearName = canChi(year + 6, year + 8)

  const kind: LunarDay['kind'] = fest
    ? 'festival'
    : tietKhi
    ? 'term'
    : day === 1
    ? 'newMonth'
    : day === 15
    ? 'fullMoon'
    : 'day'

  const result: LunarDay = {
    day,
    month,
    year,
    isLeapMonth: leap,
    yearName,
    conGiap: CON_GIAP[(((year + 8) % 12) + 12) % 12],
    monthName: monthLabel,
    monthCanChi: canChi(year * 12 + month + 3, month + 1),
    dayCanChi: canChi(jd + 9, jd + 1),
    tietKhi,
    festival: fest?.[0],
    festivalFull: fest?.[1],
    label: fest?.[0] ?? tietKhi ?? (day === 1 ? `${day}/${month}${leap ? 'N' : ''}` : String(day)),
    kind,
    full: `Ngày ${day} tháng ${monthLabel} năm ${yearName}`,
  }
  cache.set(iso, result)
  return result
}

/**
 * Heading text for the lunar months a Gregorian month spans, e.g.
 * "Tháng Bảy – Tám · Bính Ngọ (Ngựa)".
 */
export function lunarMonthSpan(firstISO: string, lastISO: string): string {
  const a = lunarFor(firstISO)
  const b = lunarFor(lastISO)
  const months = a.monthName === b.monthName ? a.monthName : `${a.monthName} – ${b.monthName}`
  const years =
    a.yearName === b.yearName
      ? `${a.yearName} (${a.conGiap})`
      : `${a.yearName} – ${b.yearName} (${b.conGiap})`
  return `Tháng ${months} · ${years}`
}
