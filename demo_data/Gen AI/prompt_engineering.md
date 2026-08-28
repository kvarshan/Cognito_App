# Guide to Advanced Prompt Engineering

Prompt engineering is the practice of structuring text inputs to Generative AI models to achieve the most accurate and high-quality outputs. Since local offline models have fixed knowledge, prompt quality is critical for performance.

## 1. Core Prompting Techniques
- **Zero-Shot Prompting**: Asking the model a question directly without providing any examples. E.g., "Translate 'Hello' to French."
- **Few-Shot Prompting**: Providing a few high-quality input-output demonstrations before asking the target question. This helps the model align with the desired format and style.
- **Chain of Thought (CoT)**: Instructing the model to break down its reasoning step-by-step before answering. This is highly effective for mathematical, logical, and symbolic reasoning tasks.

## 2. Best Practices for System Prompts
- Define the persona and role explicitly (e.g., "You are an expert AI software architect").
- Specify constraints clearly (e.g., "Use only offline resources," "Keep the response under 3 sentences").
- Use structured formats (Markdown tables, JSON outputs, bullet points).
