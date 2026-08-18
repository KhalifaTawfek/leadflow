// Quick agent check — runs a sample lead through the LangGraph flow and prints
// the result. If the LLM (LangChain) is configured and reachable, ENGINE reads
// "langgraph+llm" and the summary/reply are LLM-written; otherwise "langgraph+rules".
//
// Usage:  docker compose exec -T app node scripts/test-agent.js

const { analyzeLeadGraph } = require("../src/agent/graph");

(async () => {
  const a = await analyzeLeadGraph({
    name: "Test User",
    problem: "my gmail got hacked, someone keeps logging in from another country, I need help urgently",
    urgency: "low",
    budget: "500"
  });
  console.log("========================================");
  console.log("ENGINE:  ", a.engine);
  console.log("CATEGORY:", a.category, " | PRIORITY:", a.priority, "| AI urgency:", a.aiUrgency);
  console.log("----------------------------------------");
  console.log("SUMMARY:", a.summary);
  console.log("----------------------------------------");
  console.log("QUESTIONS:\n" + a.questions);
  console.log("----------------------------------------");
  console.log("REPLY:\n" + a.draftReply);
  console.log("========================================");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
