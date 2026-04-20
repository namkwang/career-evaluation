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

const normalize = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");

let rankingDataPromise: Promise<Map<number, RankingEntry[]>> | null = null;

function loadRankingData(): Promise<Map<number, RankingEntry[]>> {
  if (!rankingDataPromise) {
    rankingDataPromise = (async () => {
      const filePath = path.join(process.cwd(), "기간별 순위 취합.xlsx");
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<{ 연도: number; 순위: number; 회사명: string }>(sheet);

      const data = new Map<number, RankingEntry[]>();
      for (const row of rows) {
        const year = row["연도"];
        const entry: RankingEntry = {
          rank: row["순위"],
          company: row["회사명"],
        };
        if (!data.has(year)) {
          data.set(year, []);
        }
        data.get(year)!.push(entry);
      }
      return data;
    })();
  }
  return rankingDataPromise;
}

export async function filterRankings(
  companies: { name: string; years: number[] }[]
): Promise<RankingMatch[]> {
  const data = await loadRankingData();
  const results: RankingMatch[] = [];

  for (const company of companies) {
    for (const year of company.years) {
      const yearEntries = data.get(year);
      if (!yearEntries) continue;

      // Exact match only (법인 표기 차이 무시)
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

export async function getRankingsForYear(year: number): Promise<RankingEntry[]> {
  const data = await loadRankingData();
  return data.get(year) ?? [];
}

export async function getAvailableYears(): Promise<number[]> {
  const data = await loadRankingData();
  return Array.from(data.keys()).sort((a, b) => b - a);
}
