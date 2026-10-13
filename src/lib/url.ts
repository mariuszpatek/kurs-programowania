/** Path inside the site, including the base (/kurs-programowania/). */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export function param(name: string): string {
  return new URLSearchParams(location.search).get(name) ?? '';
}
