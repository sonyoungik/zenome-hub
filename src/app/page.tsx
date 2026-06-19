"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

type PubMedArticle = {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  authors: string;
  url: string;
};

const templates = [
  {
    title: "논문 목록 정리",
    prompt:
      "Microneedle drug delivery 관련 핵심 논문 10개를 저자, 논문 제목, 저널, 연도, 핵심 내용, 연구적 의의 순서로 표 형태로 정리해줘.",
  },
  {
    title: "논문 초안 구조",
    prompt:
      "Microneedle drug delivery 주제로 리뷰 논문 초안을 작성하려고 한다. Introduction, Technology, Applications, Challenges, Future Perspectives, Conclusion 구조로 상세 목차를 만들어줘.",
  },
  {
    title: "강의자료 초안",
    prompt:
      "박사과정 대학원생을 대상으로 microneedle drug delivery 강의를 준비하려고 한다. 90분 강의용 목차와 슬라이드 구성을 작성해줘.",
  },
  {
    title: "자문 보고서",
    prompt:
      "기업 자문용 보고서 형식으로 microneedle 기반 약물전달 기술의 시장성, 기술성, 규제 리스크, 개발 전략을 정리해줘.",
  },
  {
    title: "실험계획",
    prompt:
      "Microneedle formulation 연구를 위한 실험계획을 작성해줘. 목적, 변수, 대조군, 평가방법, 예상 결과, 리스크를 포함해줘.",
  },
];

export default function Home() {
  const { data: session, status } = useSession();

  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

	const [driveFiles, setDriveFiles] = useState<any[]>([]);
	const [driveLoading, setDriveLoading] = useState(false);

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("google");

  if (connected === "connected") {
    setGoogleConnected(true);
  }
}, []);

  const [pubmedQuery, setPubmedQuery] = useState("microneedle drug delivery");
  const [pubmedLoading, setPubmedLoading] = useState(false);
  const [pubmedResults, setPubmedResults] = useState<PubMedArticle[]>([]);

  if (status === "loading") {
    return (
      <main className="min-h-screen bg-black text-yellow-400 p-8">
        Loading...
      </main>
    );
  }

  if (!session) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return null;
  }

  async function askAI() {
    if (!message.trim()) return;

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      setResult(data.result || data.error || "응답 없음");
    } catch {
      setResult("AI response failed.");
    } finally {
      setLoading(false);
    }
  }

  async function searchPubMed() {
    if (!pubmedQuery.trim()) return;

    setPubmedLoading(true);
    setPubmedResults([]);

    try {
      const res = await fetch("/api/pubmed/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: pubmedQuery,
          maxResults: 10,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setResult(data.error);
      } else {
        setPubmedResults(data.results || []);
      }
    } catch {
      setResult("PubMed search failed.");
    } finally {
      setPubmedLoading(false);
    }
  }

async function loadDriveFiles() {
  setDriveLoading(true);

  try {
    const res = await fetch("/api/google/files");
    const data = await res.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    setDriveFiles(data.files || []);
  } catch (error) {
    console.error(error);
    alert("Drive file loading failed.");
  } finally {
    setDriveLoading(false);
  }
}


  function sendPubMedResultsToAI() {
    if (pubmedResults.length === 0) return;

    const list = pubmedResults
      .map(
        (item, index) =>
          `${index + 1}. ${item.title}\nAuthors: ${item.authors}\nJournal: ${
            item.journal
          }\nYear: ${item.year}\nPMID: ${item.pmid}\nURL: ${item.url}`
      )
      .join("\n\n");

    setMessage(
      `다음 PubMed 검색 결과를 바탕으로 박사과정 대학원생이 공부할 수 있도록 핵심 주제, 연구 동향, 주요 논문 우선순위, 리뷰 논문 작성 방향을 정리해줘.\n\n${list}`
    );
  }

  return (
    <main className="min-h-screen bg-black text-yellow-400 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-4 border-b border-yellow-500 pb-6">
          <img src="/logo.png" className="w-20 h-20" alt="ADD Logo" />
          <div>
            <h1 className="text-4xl font-bold">zenome Lab AI Hub</h1>
            <p className="text-yellow-200">
              Prof. Son AI Orchestration System
            </p>
          </div>

<div className="ml-auto flex gap-3">
  <button
    onClick={() => signOut()}
    className="px-4 py-2 bg-yellow-400 text-black rounded font-semibold"
  >
    Logout
  </button>

  {googleConnected ? (


<button
  onClick={loadDriveFiles}
  className="px-4 py-2 bg-green-600 text-white rounded font-semibold"
>
  {driveLoading ? "Loading..." : "Google Drive Connected"}
</button>


  ) : (
    <a
      href="/api/google/auth"
      className="px-4 py-2 bg-yellow-400 text-black rounded font-semibold"
    >
      Connect Google Drive
    </a>
  )}
</div>

        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div className="border border-yellow-500 rounded-xl p-5">
            <h2 className="text-xl font-semibold">Research / Paper</h2>
            <p className="mt-2 text-yellow-200">논문 분석 및 작성</p>
          </div>

          <div className="border border-yellow-500 rounded-xl p-5">
            <h2 className="text-xl font-semibold">Lecture / Book</h2>
            <p className="mt-2 text-yellow-200">강의 및 교재 제작</p>
          </div>

          <div className="border border-yellow-500 rounded-xl p-5">
            <h2 className="text-xl font-semibold">Consulting</h2>
            <p className="mt-2 text-yellow-200">자문 및 보고서 작성</p>
          </div>
        </section>

        <section className="mt-8 border border-yellow-500 rounded-xl p-5">
          <h2 className="text-2xl font-semibold">PubMed Search</h2>

          <div className="flex gap-3 mt-4">
            <input
              className="flex-1 p-3 rounded bg-neutral-900 border border-yellow-500 text-yellow-100"
              value={pubmedQuery}
              onChange={(e) => setPubmedQuery(e.target.value)}
              placeholder="예: microneedle drug delivery"
            />

            <button
              onClick={searchPubMed}
              disabled={pubmedLoading}
              className="px-6 py-3 bg-yellow-400 text-black rounded font-semibold disabled:opacity-50"
            >
              {pubmedLoading ? "Searching..." : "Search PubMed"}
            </button>
          </div>

          {pubmedResults.length > 0 && (
            <div className="mt-6">
              <button
                onClick={sendPubMedResultsToAI}
                className="mb-4 px-5 py-2 bg-yellow-400 text-black rounded font-semibold"
              >
                Send Results to AI Command
              </button>

              <div className="space-y-4">
                {pubmedResults.map((item, index) => (
                  <div
                    key={item.pmid}
                    className="border border-yellow-500 rounded-lg p-4 bg-neutral-950"
                  >
                    <p className="text-sm text-yellow-200">
                      {index + 1}. PMID: {item.pmid} | {item.year}
                    </p>
                    <h3 className="text-lg font-semibold mt-1">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-yellow-100">
                      Authors: {item.authors}
                    </p>
                    <p className="mt-1 text-yellow-100">
                      Journal: {item.journal}
                    </p>
                    <a
                      className="inline-block mt-2 underline text-yellow-300"
                      href={item.url}
                      target="_blank"
                    >
                      Open in PubMed
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>



{driveFiles.length > 0 && (
  <section className="mt-8 border border-green-500 rounded-xl p-5">
    <h2 className="text-2xl font-semibold text-green-400">
      Google Drive Files
    </h2>

    <div className="space-y-4 mt-4">
      {driveFiles.map((file) => (
        <div
          key={file.id}
          className="border border-green-500 rounded-lg p-4 bg-neutral-950"
        >
          <h3 className="text-lg font-semibold text-green-300">
            {file.name}
          </h3>

          <p className="mt-1 text-sm text-green-100">
            Type: {file.mimeType}
          </p>

          <p className="mt-1 text-sm text-green-100">
            Modified: {file.modifiedTime}
          </p>

          {file.webViewLink && (
            <a
              href={file.webViewLink}
              target="_blank"
              className="inline-block mt-2 underline text-green-300"
            >
              Open in Google Drive
            </a>
          )}
        </div>
      ))}
    </div>
  </section>
)}



        <section className="mt-8 border border-yellow-500 rounded-xl p-5">
          <h2 className="text-2xl font-semibold">Prompt Templates</h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
            {templates.map((item) => (
              <button
                key={item.title}
                onClick={() => setMessage(item.prompt)}
                className="border border-yellow-500 rounded-lg p-3 text-left hover:bg-yellow-400 hover:text-black transition"
              >
                {item.title}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 border border-yellow-500 rounded-xl p-5">
          <h2 className="text-2xl font-semibold">AI Command</h2>

          <textarea
            className="w-full mt-4 p-4 rounded bg-neutral-900 border border-yellow-500 text-yellow-100"
            rows={8}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="원하는 연구, 논문, 강의, 자문 업무를 입력하세요."
          />

          <button
            onClick={askAI}
            disabled={loading || message.trim() === ""}
            className="mt-4 px-6 py-3 bg-yellow-400 text-black rounded font-semibold disabled:opacity-50"
          >
            {loading ? "Running..." : "Run AI"}
          </button>

          <pre className="mt-6 whitespace-pre-wrap bg-neutral-900 p-4 rounded border border-yellow-500 text-yellow-100">
            {result}
          </pre>
        </section>
      </div>
    </main>
  );
}