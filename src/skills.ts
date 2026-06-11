import type { SkChatSkill } from './types';

export const DEFAULT_SK_CHAT_SKILLS: SkChatSkill[] = [
  {
    name: 'explain-lesson',
    label: 'Giải thích bài',
    description:
      'Explain the current lesson clearly with examples, step-by-step reasoning, and references to page context.',
    content: `# Explain Lesson

Use this skill when the student wants to understand the current lesson.

## Workflow
1. Identify the key topic from the page context and the student's question.
2. Explain the idea in simple Vietnamese.
3. Give one short example or analogy.
4. For math or science, show each reasoning step.
5. End with a quick check-for-understanding question.

Do not invent facts that are not supported by the page context.`,
  },
  {
    name: 'summarize-content',
    label: 'Tóm tắt',
    description:
      'Summarize the current page into concise main ideas and important details.',
    content: `# Summarize Content

Use this skill when the student asks for a summary.

## Workflow
1. Read the page context before summarizing.
2. Start with a 1-2 sentence overview.
3. List the most important points in Vietnamese.
4. Keep the summary compact and faithful to the source.
5. Mention if the available page context is incomplete.`,
  },
  {
    name: 'practice-questions',
    label: 'Câu hỏi luyện tập',
    description:
      'Create practice questions based on the current lesson, with answer keys or hints.',
    content: `# Practice Questions

Use this skill when the student wants exercises or review questions.

## Workflow
1. Determine the lesson topic and difficulty from the page context.
2. Create 3-5 questions with mixed difficulty.
3. Include the answer key.
4. For calculation questions, include solution hints or short worked steps.
5. Avoid content outside the current lesson unless the student asks for expansion.`,
  },
  {
    name: 'solve-step-by-step',
    label: 'Giải từng bước',
    description:
      'Solve a student question step by step, especially math, logic, and exercise explanations.',
    content: `# Solve Step By Step

Use this skill when the student asks how to solve a problem.

## Workflow
1. Restate the problem briefly.
2. Identify known information and what must be found.
3. Solve one step at a time.
4. Explain why each step is valid.
5. Give the final answer clearly and invite the student to ask about any unclear step.`,
  },
];

export function buildSkillsPrompt(skills: SkChatSkill[]) {
  if (skills.length === 0) return '';

  const skillList = skills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join('\n');

  return `## Skills

Use the load_skill tool when the user's request would benefit from specialized instructions.
The user may explicitly select one skill in the chat UI. If selectedSkillName is present, load that skill before answering.

Available skills:
${skillList}`;
}

export function stripSkillFrontmatter(content: string) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}
