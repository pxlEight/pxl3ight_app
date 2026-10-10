const fs = require('fs');
let input = '';
try {
    input = fs.readFileSync(0, 'utf-8');
} catch(e) {
    console.log(JSON.stringify({ decision: "allow" }));
    process.exit(0);
}

try {
    const data = JSON.parse(input);
    const toolName = data.toolCall && data.toolCall.name;
    const args = data.toolCall && data.toolCall.args;

    let decision = "allow";
    let reason = "";

    if (toolName === "run_command" && args && args.CommandLine) {
        const cmd = args.CommandLine.toLowerCase();
        // Check for git usage
        if (cmd.match(/\bgit\s+/)) {
            decision = "force_ask";
            reason = "Strict System Safety Constraint: You have requested to run a git command. This requires explicit user approval.";
        }
    }

    console.log(JSON.stringify({ decision, reason }));
} catch(e) {
    console.log(JSON.stringify({ decision: "allow" }));
}
