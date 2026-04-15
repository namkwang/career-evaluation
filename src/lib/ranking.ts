import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

interface RankingEntry {
  rank: number;
  company: string;
}

interface RankingMatch {
  company_name: string;
  year: number;
  rank: number;
  matched_name: string;
}

let rankingData: Map<number, RankingEntry[]> | null = null;

function loadRankingData(): Map<number, RankingEntry[]> {
  if (rankingData) return rankingData;

  const filePath = path.join(process.cwd(), "기간별 순위 취합.xlsx");
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<{ 연도: number; 순위: number; 회사명: string }>(sheet);

  rankingData = new Map();
  for (const row of rows) {
    const year = row["연도"];
    const entry: RankingEntry = {
      rank: row["순위"],
      company: row["회사명"],
    };
    if (!rankingData.has(year)) {
      rankingData.set(year, []);
    }
    rankingData.get(year)!.push(entry);
  }

  return rankingData;
}

export function filterRankings(
  companies: { name: string; years: number[] }[]
): RankingMatch[] {
  const data = loadRankingData();
  const results: RankingMatch[] = [];

  for (const company of companies) {
    for (const year of company.years) {
      const yearEntries = data.get(year);
      if (!yearEntries) continue;

      // Exact match only (법인 표기 차이 무시)
      const normalize = (s: string) =>
        s.replace(/\(주\)|㈜|주식회사|\s/g, "");

      const normalized = normalize(company.name);
      const match = yearEntries.find(
        (e) => normalize(e.company) === normalized
      );
      if (match) {
        results.push({
          company_name: company.name,
          year,
          rank: match.rank,
          matched_name: match.company,
        });
      }
      // 부분 문자열 매칭은 하지 않음 — 사명 변경/합병 등의 퍼지 매칭은 AI(Step 2)가 처리
    }
  }

  return results;
}

export function getRankingsForYear(year: number): RankingEntry[] {
  const data = loadRankingData();
  return data.get(year) ?? [];
}

export function getAvailableYears(): number[] {
  const data = loadRankingData();
  return Array.from(data.keys()).sort((a, b) => b - a);
}
