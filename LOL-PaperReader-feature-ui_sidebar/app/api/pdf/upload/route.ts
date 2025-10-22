import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // TODO: Implement actual PDF parsing logic
    // For now, return mock parsed data with DOI/URL links
    const mockParsedData = {
      title: file.name,
      sections: [
        {
          id: "abstract",
          title: "Abstract",
          content: "This is the abstract section of the document...",
          page: 1,
        },
        {
          id: "introduction",
          title: "Introduction",
          content: "This is the introduction section...",
          page: 2,
        },
        {
          id: "methodology",
          title: "Methodology",
          content: "This section describes the methodology...",
          page: 3,
        },
        {
          id: "results",
          title: "Results",
          content: "The results of the study are presented here...",
          page: 5,
        },
        {
          id: "conclusion",
          title: "Conclusion",
          content: "In conclusion, this study demonstrates...",
          page: 7,
        },
      ],
      references: [
        {
          id: "ref1",
          number: 1,
          text: "Smith, J., & Johnson, A. (2023). Machine Learning Approaches to Natural Language Processing. Journal of AI Research, 45(2), 123-145. DOI: 10.1234/jair.2023.12345",
          authors: "Smith, J., & Johnson, A.",
          title: "Machine Learning Approaches to Natural Language Processing",
          year: "2023",
          journal: "Journal of AI Research, 45(2), 123-145",
          doi: "10.1234/jair.2023.12345",
          url: "https://doi.org/10.1234/jair.2023.12345",
        },
        {
          id: "ref2",
          number: 2,
          text: "Brown, M., Davis, K., & Wilson, R. (2022). Deep Learning for Document Understanding. Proceedings of ACL 2022, pp. 456-478.",
          authors: "Brown, M., Davis, K., & Wilson, R.",
          title: "Deep Learning for Document Understanding",
          year: "2022",
          journal: "Proceedings of ACL 2022, pp. 456-478",
          // No DOI/URL - will trigger fallback search
        },
        {
          id: "ref3",
          number: 3,
          text: "Chen, L., & Zhang, Y. (2024). Transformer Models in Information Retrieval. Nature Machine Intelligence, 6(1), 89-102. DOI: 10.1038/s42256-023-00789-1",
          authors: "Chen, L., & Zhang, Y.",
          title: "Transformer Models in Information Retrieval",
          year: "2024",
          journal: "Nature Machine Intelligence, 6(1), 89-102",
          doi: "10.1038/s42256-023-00789-1",
          url: "https://doi.org/10.1038/s42256-023-00789-1",
        },
        {
          id: "ref4",
          number: 4,
          text: "Anderson, P., et al. (2023). Attention Mechanisms for Text Analysis. IEEE Transactions on Neural Networks, 34(5), 234-256. https://ieeexplore.ieee.org/document/9876543",
          authors: "Anderson, P., et al.",
          title: "Attention Mechanisms for Text Analysis",
          year: "2023",
          journal: "IEEE Transactions on Neural Networks, 34(5), 234-256",
          url: "https://ieeexplore.ieee.org/document/9876543",
        },
        {
          id: "ref5",
          number: 5,
          text: "Taylor, S., & Martinez, C. (2022). Neural Architectures for Semantic Understanding. arXiv preprint arXiv:2203.12345.",
          authors: "Taylor, S., & Martinez, C.",
          title: "Neural Architectures for Semantic Understanding",
          year: "2022",
          journal: "arXiv preprint arXiv:2203.12345",
          arxivId: "2203.12345",
          url: "https://arxiv.org/abs/2203.12345",
        },
      ],
      metadata: {
        pages: 8,
        author: "Sample Author",
        date: "2024",
      },
    };

    return NextResponse.json(mockParsedData);
  } catch (error) {
    console.error("[v0] PDF upload error:", error);
    return NextResponse.json(
      { error: "Failed to process PDF" },
      { status: 500 }
    );
  }
}
