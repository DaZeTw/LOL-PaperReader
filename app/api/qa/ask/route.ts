import { type NextRequest, NextResponse } from "next/server"

// Mock Q&A data based on the PaperQA2 research paper
const mockQADatabase: Record<string, Array<{ question: string; answer: string; context: string }>> = {
  "data.pdf": [
    {
      question: "What is PaperQA2?",
      answer:
        "PaperQA2 is a frontier language model agent optimized for improved factuality that matches or exceeds subject matter expert performance on three realistic literature research tasks. It is a RAG (retrieval-augmented generation) agent that treats retrieval and response generation as a multi-step agent task, decomposing RAG into tools that allow it to revise search parameters and generate and examine candidate answers before producing a final answer.",
      context:
        "We show that PaperQA2, a frontier language model agent optimized for improved factuality, matches or exceeds subject matter expert performance on three realistic literature research tasks without any restrictions on humans (i.e., full access to internet, search tools, and time). PaperQA2 decomposes RAG into tools, allowing it to revise its search parameters and to generate and examine candidate answers before producing a final answer.",
    },
    {
      question: "What is LitQA2?",
      answer:
        "LitQA2 is a benchmark dataset consisting of 248 multiple choice questions with answers that require retrieval from scientific literature. The questions are designed to have answers that appear in the main body of a paper, but not in the abstract, and ideally appear only once in the set of all scientific literature.",
      context:
        "To evaluate AI systems on retrieval over the scientific literature, we first generated LitQA2, a set of 248 multiple choice questions with answers that require retrieval from scientific literature. LitQA2 questions are designed to have answers that appear in the main body of a paper, but not in the abstract, and ideally appear only once in the set of all scientific literature.",
    },
    {
      question: "What is RAG in the context of language models?",
      answer:
        "RAG stands for Retrieval-Augmented Generation. It is the current paradigm for eliciting factually-based responses from LLMs by providing additional context to the LLM (e.g., snippets from research papers) to ground the generated response.",
      context:
        "The current paradigm for eliciting factually-based responses from LLMs is to use retrieval-augmented generation (RAG). RAG provides additional context to the LLM (e.g., snippets from research papers) to ground the generated response.",
    },
    {
      question: "How did PaperQA2 perform on LitQA2 compared to humans?",
      answer:
        "PaperQA2 achieved 85.2% ± 1.1% precision and 66.0% ± 1.2% accuracy on LitQA2. Human annotators with PhDs or enrolled in PhD programs achieved 73.8% ± 9.6% precision and 67.7% ± 11.9% accuracy. PaperQA2 thus achieved superhuman precision on this task (p = 0.0036) and did not differ significantly from humans in accuracy.",
      context:
        "Running PaperQA2 on LitQA2 yielded a precision of 85.2% ± 1.1% (mean ± SD, n = 3), and an accuracy of 66.0% ± 1.2% (mean ± SD, n = 3). Human annotators achieved 73.8% ± 9.6% (mean ± SD, n = 9) precision on LitQA2 and 67.7% ± 11.9% (mean ± SD, n = 9) accuracy. PaperQA2 thus achieved superhuman precision on this task (t(8.6) = 3.49, p = 0.0036).",
    },
    {
      question: "What is WikiCrow?",
      answer:
        "WikiCrow is a system that generates cited Wikipedia-style articles about human protein-coding genes by combining several PaperQA2 calls on topics such as the structure, function, interactions, and clinical significance of the gene. WikiCrow generated 240 articles with an average of 1219 words and showed significantly higher accuracy than human-written Wikipedia articles.",
      context:
        "To evaluate PaperQA2 on summarization, we engineered a system called WikiCrow, which generates cited Wikipedia-style articles about human protein-coding genes by combining several PaperQA2 calls on topics such as the structure, function, interactions, and clinical significance of the gene. We found that WikiCrow had significantly fewer 'cited and unsupported' statements than the paired Wikipedia articles (13.5% vs. 24.9%).",
    },
    {
      question: "What is ContraCrow?",
      answer:
        "ContraCrow is a system that automatically detects contradictions in the scientific literature. It first extracts claims from a provided paper using LLM completion calls, and then feeds those claims into PaperQA2 with a contradiction detection prompt. PaperQA2 identified 2.34 ± 1.99 contradictions per paper in a random subset of 93 biology papers, of which 70% were validated by human experts.",
      context:
        "Because PaperQA2 can explore scientific literature at much higher throughput than human scientists, we reasoned that we could deploy it to systematically identify contradictions and inconsistencies in the literature at scale. Thus, we leveraged PaperQA2 to build a system called ContraCrow that automatically detects contradictions in the literature. PaperQA2 identifies 2.34 ± 1.99 (mean ± SD, N = 93 papers) contradictions per paper in a random subset of biology papers, of which 70% are validated by human experts.",
    },
    {
      question: "What are the main tools available to PaperQA2?",
      answer:
        "PaperQA2 has access to four main tools: (1) Paper Search tool - transforms user requests into keyword searches to identify candidate papers, (2) Gather Evidence tool - ranks paper chunks with top-k dense vector retrieval followed by LLM reranking and contextual summarization (RCS), (3) Citation Traversal tool - exploits the citation graph to add additional relevant sources, and (4) Generate Answer tool - uses the top ranked evidence summaries to produce the final response.",
      context:
        "PaperQA2 has access to a 'Paper Search' tool, where the agent model transforms the user request into a keyword search that is used to identify candidate papers. PaperQA2 can use a 'Gather Evidence' tool that first ranks paper chunks with a top-k dense vector retrieval step, followed by an LLM reranking and contextual summarization (RCS) step. PaperQA2 adds a new 'Citation Traversal' tool that exploits the citation graph as a form of hierarchical indexing to add additional relevant sources. Once the PaperQA2 state has summaries, it can call a 'Generate Answer' tool.",
    },
    {
      question: "Why do language models hallucinate?",
      answer:
        "Language models are known to 'hallucinate' by confidently stating information that is not grounded in any existing source or evidence. This is a critical limitation for scientific research where factuality is essential. The paper addresses this through the use of retrieval-augmented generation (RAG) and careful system design to improve factuality.",
      context:
        "Language models are known to 'hallucinate' incorrect information, and it is unclear if they are sufficiently accurate and reliable for use in scientific research. Firstly, factuality is essential in scientific research, and LLMs hallucinate, confidently stating information that is not grounded in any existing source or evidence.",
    },
    {
      question: "How many papers does PaperQA2 typically parse per question?",
      answer:
        "When answering LitQA2 questions, PaperQA2 parsed and utilized an average of 14.5 ± 0.6 (mean ± SD, n = 3) papers per question. The system can iteratively revise its search parameters and traverse the citation graph to gather more relevant papers as needed.",
      context:
        "In answering LitQA2 questions, PaperQA2 parsed and utilized an average of 14.5 ± 0.6 (mean ± SD, n = 3) papers per question. Running PaperQA2 on LitQA2 yielded a precision of 85.2% ± 1.1% (mean ± SD, n = 3), and an accuracy of 66.0% ± 1.2% (mean ± SD, n = 3).",
    },
    {
      question: "What is the cost of running PaperQA2?",
      answer:
        "Although PaperQA2 is expensive compared to lower accuracy commercial systems, it is inexpensive in absolute terms, costing $1 to $3 per query. For WikiCrow article generation, the average cost was $4.48 ± $1.02 per article.",
      context:
        "Although PaperQA2 is expensive compared to lower accuracy commercial systems, it is inexpensive in absolute terms, costing $1 to $3 per query. WikiCrow articles had an average cost of $4.48 ± $1.02 per article (including costs for search and LLM APIs).",
    },
  ],
}

export async function POST(request: NextRequest) {
  try {
    const { question, filename } = await request.json()

    if (!question) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 })
    }

    // Get mock Q&A for the file
    const qaData = mockQADatabase[filename] || mockQADatabase["data.pdf"]

    // Find the best matching Q&A based on question similarity
    let bestMatch = qaData[0]
    let highestSimilarity = 0

    for (const qa of qaData) {
      const similarity = calculateSimilarity(question.toLowerCase(), qa.question.toLowerCase())
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity
        bestMatch = qa
      }
    }

    // If no good match, return a generic response
    if (highestSimilarity < 0.3) {
      return NextResponse.json({
        answer: `Based on the document "${filename}", I couldn't find a specific answer to your question: "${question}". The document primarily discusses PaperQA2, a language model agent system for scientific literature research, its performance on benchmarks like LitQA2, and applications like WikiCrow and ContraCrow. Please try asking about these topics for more detailed information.`,
        context:
          "The paper presents PaperQA2, a frontier language model agent optimized for improved factuality that matches or exceeds subject matter expert performance on realistic literature research tasks. The system uses retrieval-augmented generation (RAG) with multiple tools for paper search, evidence gathering, citation traversal, and answer generation.",
        confidence: 0.5,
      })
    }

    return NextResponse.json({
      answer: bestMatch.answer,
      context: bestMatch.context,
      confidence: Math.min(0.95, 0.7 + highestSimilarity * 0.3),
    })
  } catch (error) {
    console.error("[v0] QA error:", error)
    return NextResponse.json({ error: "Failed to process question" }, { status: 500 })
  }
}

// Simple similarity calculation based on common words
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/).filter((w) => w.length > 3)
  const words2 = str2.split(/\s+/).filter((w) => w.length > 3)

  if (words1.length === 0 || words2.length === 0) return 0

  const commonWords = words1.filter((word) => words2.includes(word)).length
  return (2 * commonWords) / (words1.length + words2.length)
}
