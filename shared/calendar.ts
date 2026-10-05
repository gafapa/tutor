// Calendar days, rather than elapsed 24-hour periods, keep reviews stable across DST.
export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(day: string, count: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, month - 1, date, 12);
  value.setDate(value.getDate() + count);
  return dayKey(value);
}
export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split('-').map(Number);
  return year >= 2000 && year <= 2100 && dayKey(new Date(year, month - 1, date, 12)) === day;
}
