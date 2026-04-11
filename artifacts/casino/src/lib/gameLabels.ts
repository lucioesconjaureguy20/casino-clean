const LABELS: Record<string, Record<string, string>> = {
  chips:          { es:"Fichas",              en:"Chips",             pt:"Fichas",                de:"Chips",                 fr:"Jetons",                id:"Chip",              it:"Fiches",                ko:"칩",         nl:"Chips",             pl:"Żetony",        ru:"Фишки",             tr:"Jetonlar" },
  totalBet:       { es:"APUESTA TOTAL",       en:"TOTAL BET",         pt:"APOSTA TOTAL",          de:"GESAMTEINSATZ",         fr:"MISE TOTALE",           id:"TOTAL TARUHAN",     it:"PUNTATA TOTALE",        ko:"총 베팅",    nl:"TOTALE INZET",      pl:"ŁĄCZNY ZAKŁAD", ru:"ИТОГО СТАВКА",      tr:"TOPLAM BAHİS" },
  numRounds:      { es:"Número de rondas",    en:"Number of rounds",  pt:"Número de rodadas",     de:"Anzahl der Runden",     fr:"Nombre de tours",       id:"Jumlah putaran",    it:"Numero di giri",        ko:"라운드 수",  nl:"Aantal rondes",     pl:"Liczba rund",   ru:"Количество раундов",tr:"Tur sayısı" },
  liveStats:      { es:"Estadísticas en vivo",en:"Live Statistics",   pt:"Estatísticas ao vivo",  de:"Live-Statistiken",      fr:"Statistiques en direct",id:"Statistik langsung",it:"Statistiche in diretta",ko:"실시간 통계",nl:"Live statistieken",  pl:"Statystyki",    ru:"Живая статистика",  tr:"Canlı istatistikler" },
  liveStatsTitle: { es:"Estadísticas en Vivo",en:"Live Statistics",   pt:"Estatísticas ao Vivo",  de:"Live-Statistiken",      fr:"Statistiques en Direct",id:"Statistik Langsung",it:"Statistiche in Diretta",ko:"실시간 통계",nl:"Live Statistieken",  pl:"Statystyki",    ru:"Живая Статистика",  tr:"Canlı İstatistikler" },
  noHistoryShort: { es:"Sin historial",       en:"No history",        pt:"Sem histórico",         de:"Kein Verlauf",          fr:"Aucun historique",      id:"Tidak ada riwayat", it:"Nessuno storico",       ko:"기록 없음",  nl:"Geen geschiedenis", pl:"Brak historii", ru:"Нет истории",       tr:"Geçmiş yok" },
  lastResult:     { es:"Último",              en:"Last",              pt:"Último",                de:"Letztes",               fr:"Dernier",               id:"Terakhir",          it:"Ultimo",                ko:"마지막",     nl:"Laatste",           pl:"Ostatni",       ru:"Последний",         tr:"Son" },
};

export function gt(lang: string | undefined, key: string): string {
  const l = lang ?? "es";
  return LABELS[key]?.[l] ?? LABELS[key]?.["en"] ?? key;
}
