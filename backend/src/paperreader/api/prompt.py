"""
Prompt templates for paper summarization using LLM.
"""

# Prompt template for section selection
SELECT_IMPORTANT_SECTIONS_PROMPT = """
You are given the section titles of a scientific paper.

Your task: Select the sections essential for summarizing the paper.

Rules for section selection:
- Keep only sections that help summarize the problem, the proposed solution, the method, experiments, and conclusions.
- Exclude sections that contain background, theory, related work, dataset details, implementation details, or minor training tricks.

Return a JSON object with an 'important_sections' key containing an array of section title strings.

SECTIONS:
{section_titles_json}
"""


SELECT_IMPORTANT_SECTIONS_SYSTEM_PROMPT = (
    "You are a JSON generator. Return ONLY a JSON object with an 'important_sections' key "
    "containing an array of strings (section titles). Do not include markdown code blocks or additional text."
)


# Prompt template for summary template generation
SUMMARY_TEMPLATE_PROMPT = """
Based on the selected important sections below, propose a concise scientific summary template with empty fields.

Rules for summary template:
- DO NOT copy or imitate the section names.
- The template must contain 6–10 high-level, non-redundant fields.
- Merge overlapping concepts (e.g., Proposed Solution and Methodology → Method).
- Use the selected important sections as guidance to create meaningful field names.
- Examples of allowed fields: Motivation, Problem Statement, Objective, Contribution, Method, Experiments, Results, Limitations, Conclusion.
- Only include fields that are relevant to the paper.

Return a JSON object with a 'summary_template' key containing an object with 6-10 string fields, each with empty string value.

IMPORTANT SECTIONS:
{important_sections_json}
"""


SUMMARY_TEMPLATE_SYSTEM_PROMPT = (
    "You are a JSON generator. Return ONLY a JSON object with a 'summary_template' key. "
    "The 'summary_template' must be an object (dictionary) with 6-10 string fields, each with empty string value. "
    "Do not include markdown code blocks or additional text."
)

# Prompt template for filling the summary
FINAL_FILL_PROMPT_TEMPLATE = """
You are given the essential parts of a scientific paper.

Your task:
- Fill the summary template below using the provided content.
- Include numeric results, performance metrics, improvements, or percentages if they are clearly stated.
- Only update values if the information is explicitly present in the content.
- Do NOT add new keys to the template.
- Keep empty strings where information is missing.
- Use concise, factual language. Do not make assumptions.

Template:
{template_json}

Content:
\"\"\"{combined_text}\"\"\"

IMPORTANT: Return ONLY valid JSON with the SAME keys as the template.
The output must be a JSON object with a "summary_template" key containing the filled template.
Do not include any markdown code blocks or additional text. The response must be valid, parseable JSON.
Example format:
{{
  "summary_template": {{
    "key1": "value1",
    "key2": "value2"
  }}
}}
"""


FINAL_SUMMARY_SYSTEM_PROMPT = (
    "You are a JSON generator. Return ONLY valid JSON with the SAME keys as the template.\n"
    "The output must be a JSON object with a 'summary_template' key containing the filled template.\n"
    "Do not include any markdown code blocks or additional text. The response must be valid, parseable JSON."
)

