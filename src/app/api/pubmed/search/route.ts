import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { query, maxResults } = await req.json();

    if (!query || query.trim() === "") {
      return NextResponse.json(
        { error: "검색어를 입력하세요." },
        { status: 400 }
      );
    }

    const retmax = maxResults || 10;
    const encodedQuery = encodeURIComponent(query);

    const searchUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
      `?db=pubmed&term=${encodedQuery}&retmode=json&retmax=${retmax}`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    const ids: string[] = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const summaryUrl =
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi` +
      `?db=pubmed&id=${ids.join(",")}&retmode=json`;

    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();

    const results = ids.map((id) => {
      const item = summaryData.result[id];

      return {
        pmid: id,
        title: item?.title || "",
        journal: item?.fulljournalname || item?.source || "",
        year: item?.pubdate?.slice(0, 4) || "",
        authors:
          item?.authors?.map((a: { name: string }) => a.name).join(", ") || "",
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    });

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("PUBMED ERROR:", error);
    return NextResponse.json(
      { error: error.message || "PubMed search failed." },
      { status: 500 }
    );
  }
}