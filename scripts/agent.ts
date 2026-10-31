// Run the owner collections agent from the command line.
// Usage: npm run agent -- "List my unpaid invoices"
import { runAgent, summarizeStep } from "../lib/agent";

async function main() {
  const request = process.argv.slice(2).join(" ").trim();
  if (!request) {
    console.error('Usage: npm run agent -- "<request>"');
    process.exit(1);
  }
  console.log(`> ${request}\n`);

  const result = await runAgent(request, {
    onToolCall: (call) => {
      const preview = JSON.stringify(call.output);
      console.log(`[tool] ${call.tool} ${JSON.stringify(call.input)} (${call.ms} ms)`);
      console.log(`       -> ${preview.length > 300 ? `${preview.slice(0, 300)}…` : preview}`);
      console.log(`       = ${summarizeStep(call).summary}`);
    },
  });

  console.log(`\n${result.ok ? "Agent" : "Agent unavailable"}:\n${result.text}`);
  if (!result.ok) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
