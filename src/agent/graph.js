// LeadFlow AI Agent — a real LangGraph flow (LangGraph.js) that orchestrates the
// brief's pipeline as a StateGraph, and uses LangChain (ChatOpenAI) to power the
// text-generation steps when an LLM key is configured.
//
//   classify → priority → summarize → questions → draftReply
//
// If OPENAI_API_KEY is not set (or the LLM errors), each node falls back to the
// deterministic rule-based logic in ./analyze.js — so the system always works,
// with or without an LLM, and never blocks a lead from being saved.

const { StateGraph, Annotation, START, END } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { SystemMessage, HumanMessage, AIMessage } = require("@langchain/core/messages");
const rules = require("./analyze");

const LLM_ENABLED = !!process.env.OPENAI_API_KEY;

function getLLM() {
  return new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 600,
    timeout: 20000,
    // LLM_BASE_URL lets you point at any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, local…)
    configuration: process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : undefined
  });
}

async function llmText(prompt) {
  const res = await getLLM().invoke(prompt);
  return String(res.content || "").trim();
}

// ---- Graph state ----
const S = Annotation.Root({
  lead: Annotation(),
  base: Annotation(),          // the full rule-based baseline (used as fallback)
  category: Annotation(),
  priority: Annotation(),
  priorityReason: Annotation(),
  urgencyLabel: Annotation(),
  aiUrgency: Annotation(),
  estimateHours: Annotation(),
  summary: Annotation(),
  questions: Annotation(),
  draftReply: Annotation(),
  llmUsed: Annotation()        // true once any node actually gets an LLM response
});

// Node 1 — classify + compute the rule baseline (deterministic).
async function classifyNode(state) {
  const base = rules.analyzeLead(state.lead);
  return {
    base,
    category: base.category,
    estimateHours: base.estimateHours,
    urgencyLabel: base.urgencyLabel,
    aiUrgency: base.aiUrgency
  };
}

// Node 2 — priority 1–10 (kept deterministic; a numeric score is more reliable
// as a rule than as free-form LLM output, and the reasoning is transparent).
async function priorityNode(state) {
  return { priority: state.base.priority, priorityReason: state.base.priorityReason };
}

// Node 3 — one-line summary for the salesperson (LLM, else rule).
async function summarizeNode(state) {
  if (LLM_ENABLED) {
    try {
      const s = await llmText(
        `You are a sales assistant. In ONE sentence, summarize this IT service request for a busy salesperson. ` +
        `Category: ${state.category}. Customer: ${state.lead.name}. Budget: ${state.lead.budget || "not stated"}.\n\n` +
        `Request: "${state.lead.problem}"`
      );
      if (s) return { summary: s, llmUsed: true };
    } catch (e) { console.error("[graph] summarize LLM failed:", e.message); }
  }
  return { summary: state.base.summary };
}

// Node 4 — follow-up questions (LLM, else rule).
async function questionsNode(state) {
  if (LLM_ENABLED) {
    try {
      const q = await llmText(
        `List exactly 3 concise follow-up questions to qualify this ${state.category} request. ` +
        `Return each question on its own line, no numbering.\n\nRequest: "${state.lead.problem}"`
      );
      const lines = q.split("\n").map((l) => l.replace(/^[\-\d.)\s]+/, "").trim()).filter(Boolean);
      if (lines.length) return { questions: lines.slice(0, 4).join("\n"), llmUsed: true };
    } catch (e) { console.error("[graph] questions LLM failed:", e.message); }
  }
  return { questions: state.base.questions };
}

// Node 5 — ready-to-send draft reply (LLM, else rule).
async function draftReplyNode(state) {
  if (LLM_ENABLED) {
    try {
      const firstName = String(state.lead.name || "there").trim().split(/\s+/)[0];
      const r = await llmText(
        `Write a short, warm, professional reply to a customer who requested help with ${state.category}. ` +
        `Address them as "${firstName}". Acknowledge their problem, say we can help, mention it typically takes ${state.estimateHours}, ` +
        `and ask for the key details needed. Sign off as "The Team". Keep it under 120 words.\n\n` +
        `Their message: "${state.lead.problem}"`
      );
      if (r) return { draftReply: r, llmUsed: true };
    } catch (e) { console.error("[graph] draftReply LLM failed:", e.message); }
  }
  return { draftReply: state.base.draftReply };
}

// ---- Build & compile the graph once ----
const workflow = new StateGraph(S)
  .addNode("n_classify", classifyNode)
  .addNode("n_priority", priorityNode)
  .addNode("n_summarize", summarizeNode)
  .addNode("n_questions", questionsNode)
  .addNode("n_reply", draftReplyNode)
  .addEdge(START, "n_classify")
  .addEdge("n_classify", "n_priority")
  .addEdge("n_priority", "n_summarize")
  .addEdge("n_summarize", "n_questions")
  .addEdge("n_questions", "n_reply")
  .addEdge("n_reply", END);

const app = workflow.compile();

// Public API — same shape as the rule-based analyzeLead, but async.
async function analyzeLeadGraph(lead) {
  try {
    const out = await app.invoke({ lead });
    return {
      category: out.category,
      priority: out.priority,
      priorityReason: out.priorityReason,
      urgencyLabel: out.urgencyLabel,
      aiUrgency: out.aiUrgency,
      estimateHours: out.estimateHours,
      summary: out.summary,
      questions: out.questions,
      draftReply: out.draftReply,
      // engine reflects what ACTUALLY ran: the LLM only counts if a node got a real response.
      engine: out.llmUsed ? "langgraph+llm" : "langgraph+rules"
    };
  } catch (e) {
    // Absolute fallback: never fail a lead because of the agent.
    console.error("[graph] flow failed, using rule baseline:", e.message);
    return { ...rules.analyzeLead(lead), engine: "rules(fallback)" };
  }
}

// ==========================================================================
// Live chat agent — a LangGraph flow whose node answers the customer with an
// LLM (LangChain). Used by the "Chat with our AI" box on the request page.
// ==========================================================================
const SERVICE_LIST = "Account Security, Servers/RDP, Automation, Docker/DevOps, Cloudflare/Network, Monitoring, and Website+Domain+Protection";
const CHAT_SYSTEM = [
  "You are the friendly AI assistant for LeadFlow AI, an IT / cyber / automation services company.",
  `The services offered are: ${SERVICE_LIST}.`,
  "Help the customer describe what they need, ask one or two clarifying questions, and tell them which service fits.",
  "Keep replies short (2-4 sentences), warm and practical. When they seem ready, invite them to submit the request form below so the team can follow up.",
  "Never invent prices; if asked, say the team will confirm a quote after reviewing the request."
].join(" ");

const ChatState = Annotation.Root({
  history: Annotation(),   // [{role:'user'|'assistant', content}]
  reply: Annotation()
});

async function chatRespond(state) {
  const history = Array.isArray(state.history) ? state.history : [];
  const lastUser = [...history].reverse().find((m) => m.role === "user");

  if (LLM_ENABLED) {
    try {
      const msgs = [new SystemMessage(CHAT_SYSTEM)];
      for (const m of history.slice(-10)) {
        msgs.push(m.role === "assistant" ? new AIMessage(String(m.content)) : new HumanMessage(String(m.content)));
      }
      const res = await getLLM().invoke(msgs);
      const text = String(res.content || "").trim();
      if (text) return { reply: text };
    } catch (e) { console.error("[chat] LLM failed:", e.message); }
  }

  // Fallback (no LLM): classify their message with rules and reply helpfully.
  const text = lastUser ? String(lastUser.content) : "";
  const rule = rules.classify(text);
  const q = (rule.questions && rule.questions[0]) || "Could you tell me a bit more about what you need?";
  return {
    reply: `Thanks! This sounds like a **${rule.category}** request. ${q} ` +
           `When you're ready, fill in the request form below and our team will follow up with a quote.`
  };
}

const chatApp = new StateGraph(ChatState)
  .addNode("respond", chatRespond)
  .addEdge(START, "respond")
  .addEdge("respond", END)
  .compile();

async function agentChat(history) {
  try {
    const out = await chatApp.invoke({ history });
    return { reply: out.reply, engine: LLM_ENABLED ? "langgraph+llm" : "langgraph+rules" };
  } catch (e) {
    console.error("[chat] flow failed:", e.message);
    return { reply: "Thanks for your message — please fill in the request form below and our team will follow up.", engine: "rules(fallback)" };
  }
}

module.exports = { analyzeLeadGraph, agentChat, LLM_ENABLED };
